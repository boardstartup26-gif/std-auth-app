import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";

// ─── Config ───────────────────────────────────────────────────────────────────

const DAILY_TOKEN_LIMIT = 10;
const TOKEN_COST_SUBJECTIVE = 3;
const TOKEN_COST_OBJECTIVE = 1;

// ─── Types ───────────────────────────────────────────────────────────────────

interface EvaluateRequestBody {
  question_number: string;
  year: number;
  paper: string;
  subject: string;
  student_answer: string;
}

interface QuestionRow {
  id: string;
  question_text: string;
  is_subjective: boolean;
  question_type: string | null;
  options: string[] | null;
  correct_answer: string | null;
  diagram_required: boolean | null;
}

interface MarkingScheme {
  scheme_text: string;
  total_marks: number;
  key_points: string[] | Record<string, unknown>;
  model_answer: string | null;
  model_answer_verified: boolean;
  accepted_alternatives: string[] | Record<string, unknown> | null;
  common_errors: string[] | Record<string, unknown> | null;
  examiner_notes: string | null;
  marks_per_correct_point: number | null;
}

interface EvaluationOutput {
  marks_awarded: number;
  total_marks: number;
  points_hit: string[];
  points_missed: string[];
  conceptual_errors: string[];
  model_answer: string;
  model_answer_source: "verified" | "ai_generated";
  examiner_feedback: string;
  // Objective-only fields
  is_objective?: boolean;
  correct_answer?: string;
  is_correct?: boolean;
  token_cost: number;
  tokens_remaining: number;
}

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a strict, fair ICSE examiner evaluating Class 9/10 student answers for the CISCE board.

RULES — READ CAREFULLY:
1. Evaluate ONLY using the marking scheme provided in the user message. Do not draw on external knowledge to award or deduct marks.
2. Never fabricate key points, model answers, or examiner feedback. If the marking scheme is sparse, say so in examiner_feedback.
3. marks_awarded must be an integer between 0 and total_marks (inclusive). Never exceed total_marks.
4. points_hit: list only scheme points the student demonstrably addressed.
5. points_missed: list only scheme points the student clearly omitted or got wrong.
6. conceptual_errors: flag misconceptions or factually wrong statements in the student's answer. Empty array if none.
7. model_answer: use the provided model_answer verbatim if it exists. If absent, construct a concise examiner-quality answer strictly from scheme_text and key_points — label it ai_generated.
8. examiner_feedback: 2–3 sentences max. Be direct. Identify the single most impactful gap or strength.
9. Output ONLY valid JSON matching the schema below. No preamble, no markdown fences, no trailing text.

OUTPUT SCHEMA:
{
  "marks_awarded": number,
  "total_marks": number,
  "points_hit": ["string"],
  "points_missed": ["string"],
  "conceptual_errors": ["string"],
  "model_answer": "string",
  "model_answer_source": "verified" | "ai_generated",
  "examiner_feedback": "string"
}`;
}

// ─── User Message ─────────────────────────────────────────────────────────────

function buildUserMessage(
  questionText: string,
  studentAnswer: string,
  scheme: MarkingScheme
): string {
  return `QUESTION:
${questionText}

STUDENT'S ANSWER:
${studentAnswer}

MARKING SCHEME:
Total Marks: ${scheme.total_marks}

Scheme Text:
${scheme.scheme_text}

Key Points:
${JSON.stringify(scheme.key_points, null, 2)}

${scheme.model_answer ? `Official Model Answer:\n${scheme.model_answer}` : "Model Answer: Not provided — generate from scheme."}

${scheme.accepted_alternatives ? `Accepted Alternatives:\n${JSON.stringify(scheme.accepted_alternatives, null, 2)}` : ""}

${scheme.common_errors ? `Common Pupil Errors (from CISCE Examiner Comments):\n${JSON.stringify(scheme.common_errors, null, 2)}` : ""}

${scheme.examiner_notes ? `Examiner Notes:\n${scheme.examiner_notes}` : ""}

Evaluate the student's answer against the marking scheme above. Return valid JSON only.`;
}

// ─── Objective Answer Matching ────────────────────────────────────────────────

function normaliseAnswer(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-d]\.\s*/i, "") // strip "B. " prefix if user typed full MCQ option
    .replace(/\s+/g, " ");
}

function matchObjectiveAnswer(
  userAnswer: string,
  correctAnswer: string,
  questionType: string | null
): boolean {
  const userNorm = normaliseAnswer(userAnswer);
  const correctNorm = normaliseAnswer(correctAnswer);

  // MCQ: accept just the letter OR full option text
  if (questionType === "mcq") {
    const userLetter = userAnswer.trim().toUpperCase().charAt(0);
    const correctLetter = correctAnswer.trim().toUpperCase().charAt(0);
    return (
      userNorm === correctNorm ||
      (userLetter === correctLetter && /^[A-D]$/.test(userLetter))
    );
  }

  // Match-the-following: compare pair-by-pair e.g. "A-3,B-1,C-4,D-2"
  if (questionType === "match") {
    const parsePairs = (s: string) =>
      s
        .toLowerCase()
        .replace(/\s/g, "")
        .split(",")
        .map((p) => p.trim())
        .sort();
    return parsePairs(userAnswer).join() === parsePairs(correctAnswer).join();
  }

  // True/False, fill_in_blank: normalised string match
  return userNorm === correctNorm;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Parse + validate request body
  let body: EvaluateRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { question_number, year, paper, subject, student_answer } = body;

  if (!question_number || !year || !paper || !subject || !student_answer) {
    return NextResponse.json(
      { error: "Missing required fields: question_number, year, paper, subject, student_answer" },
      { status: 400 }
    );
  }

  if (student_answer.trim().length < 1) {
    return NextResponse.json({ error: "student_answer is empty" }, { status: 400 });
  }

  // 1a. Auth check
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  const userId = user?.id ?? null;

  if (!userId) {
    return NextResponse.json(
      { error: "You must be signed in to run an evaluation." },
      { status: 401 }
    );
  }

  const supabase = createAdminClient();

  // 2. DB lookups — resolve subject → question → scheme

  const { data: subjectRow, error: subjectError } = await supabase
    .from("subjects")
    .select("id")
    .eq("name", subject)
    .single();

  if (subjectError || !subjectRow) {
    return NextResponse.json({ error: `Subject not found: ${subject}` }, { status: 404 });
  }

  const { data: questionRow, error: questionError } = await supabase
    .from("questions")
    .select(
      "id, question_text, is_subjective, question_type, options, correct_answer, diagram_required"
    )
    .eq("subject_id", subjectRow.id)
    .eq("year", year)
    .eq("question_number", question_number)
    .or(`paper.eq.${paper},paper.is.null`)
    .single();

  if (questionError || !questionRow) {
    return NextResponse.json(
      {
        error: "Question not found",
        detail: `No match for subject=${subject}, year=${year}, paper=${paper}, question_number=${question_number}`,
      },
      { status: 404 }
    );
  }

  const question = questionRow as QuestionRow;

  const { data: schemeRow, error: schemeError } = await supabase
    .from("marking_schemes")
    .select(
      "scheme_text, total_marks, key_points, model_answer, model_answer_verified, accepted_alternatives, common_errors, examiner_notes, marks_per_correct_point"
    )
    .eq("question_id", question.id)
    .single();

  if (schemeError || !schemeRow) {
    return NextResponse.json(
      { error: "Marking scheme not found for this question" },
      { status: 404 }
    );
  }

  const scheme = schemeRow as MarkingScheme;

  // 3. Determine token cost BEFORE cap check
  const tokenCost = question.is_subjective ? TOKEN_COST_SUBJECTIVE : TOKEN_COST_OBJECTIVE;
  const today = new Date().toISOString().slice(0, 10);

  const { data: usageRow } = await supabase
    .from("usage")
    .select("token_count")
    .eq("user_id", userId)
    .eq("usage_date", today)
    .maybeSingle();

  const currentTokens = usageRow?.token_count ?? 0;
  const tokensRemaining = Math.max(0, DAILY_TOKEN_LIMIT - currentTokens);

  if (currentTokens + tokenCost > DAILY_TOKEN_LIMIT) {
    return NextResponse.json(
      {
        error: `Not enough tokens. This question costs ${tokenCost} token${tokenCost > 1 ? "s" : ""}. You have ${tokensRemaining} remaining today.`,
        limit_reached: true,
        tokens_remaining: tokensRemaining,
        token_cost: tokenCost,
      },
      { status: 429 }
    );
  }

  // ─── 4a. OBJECTIVE PATH (no Claude call) ─────────────────────────────────

  if (!question.is_subjective) {
    if (!question.correct_answer) {
      return NextResponse.json(
        { error: "Answer key for this question hasn't been added yet. Try a different question." },
        { status: 404 }
      );
    }

    const isCorrect = matchObjectiveAnswer(
      student_answer,
      question.correct_answer,
      question.question_type
    );

    const marksAwarded = isCorrect ? scheme.total_marks : 0;

    const evaluation: EvaluationOutput = {
      marks_awarded: marksAwarded,
      total_marks: scheme.total_marks,
      points_hit: isCorrect ? [question.correct_answer] : [],
      points_missed: isCorrect ? [] : [question.correct_answer],
      conceptual_errors: [],
      model_answer: question.correct_answer,
      model_answer_source: "verified",
      examiner_feedback: isCorrect
        ? "Correct."
        : `Incorrect. The correct answer is: ${question.correct_answer}`,
      is_objective: true,
      correct_answer: question.correct_answer,
      is_correct: isCorrect,
      token_cost: tokenCost,
      tokens_remaining: tokensRemaining - tokenCost,
    };

    // Increment usage + persist — fire and forget
    incrementUsage(supabase, userId, today, tokenCost).catch((err) =>
      console.error("[BoardEdge] Usage increment error:", err)
    );
    persistSubmission(supabase, {
      questionId: question.id,
      studentAnswer: student_answer,
      userId,
      evaluation,
    }).catch((err) => console.error("[BoardEdge] Persist error:", err));

    return NextResponse.json(evaluation, { status: 200 });
  }

  // ─── 4b. SUBJECTIVE PATH (Claude call) ───────────────────────────────────

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  let rawContent: string;
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: buildSystemPrompt(),
      messages: [
        {
          role: "user",
          content: buildUserMessage(question.question_text, student_answer, scheme),
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Claude returned no text content");
    }
    rawContent = textBlock.text;
  } catch (claudeError: unknown) {
    console.error("[BoardEdge] Claude API error:", claudeError);
    const message = claudeError instanceof Error ? claudeError.message : "Unknown error";
    return NextResponse.json(
      { error: "Evaluation failed — Claude API error", detail: message },
      { status: 502 }
    );
  }

  // 5. Parse Claude response
  let claudeEval: Omit<EvaluationOutput, "is_objective" | "correct_answer" | "is_correct" | "token_cost" | "tokens_remaining">;
  try {
    const cleaned = rawContent
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    claudeEval = JSON.parse(cleaned);
  } catch {
    console.error("[BoardEdge] Failed to parse Claude output:", rawContent);
    return NextResponse.json(
      { error: "Evaluation failed — could not parse model response", raw: rawContent },
      { status: 500 }
    );
  }

  // 6. Enforce model_answer_source from DB truth
  claudeEval.model_answer_source = scheme.model_answer_verified ? "verified" : "ai_generated";

  const evaluation: EvaluationOutput = {
    ...claudeEval,
    token_cost: tokenCost,
    tokens_remaining: tokensRemaining - tokenCost,
  };

  // Increment usage + persist — fire and forget
  incrementUsage(supabase, userId, today, tokenCost).catch((err) =>
    console.error("[BoardEdge] Usage increment error:", err)
  );
  persistSubmission(supabase, {
    questionId: question.id,
    studentAnswer: student_answer,
    userId,
    evaluation,
  }).catch((err) => console.error("[BoardEdge] Persist error:", err));

  return NextResponse.json(evaluation, { status: 200 });
}

// ─── Usage Tracking ────────────────────────────────────────────────────────────

async function incrementUsage(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  date: string,
  cost: number
) {
  const { data: existing } = await supabase
    .from("usage")
    .select("token_count")
    .eq("user_id", userId)
    .eq("usage_date", date)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("usage")
      .update({ token_count: existing.token_count + cost })
      .eq("user_id", userId)
      .eq("usage_date", date);
  } else {
    await supabase
      .from("usage")
      .insert({ user_id: userId, usage_date: date, token_count: cost });
  }
}

// ─── Background Persistence ───────────────────────────────────────────────────

async function persistSubmission(
  supabase: ReturnType<typeof createAdminClient>,
  {
    questionId,
    studentAnswer,
    userId,
    evaluation,
  }: {
    questionId: string;
    studentAnswer: string;
    userId: string;
    evaluation: EvaluationOutput;
  }
) {
  const { data: answerRow, error: answerError } = await supabase
    .from("student_answers")
    .insert({
      question_id: questionId,
      answer_text: studentAnswer,
      user_id: userId,
    })
    .select("id")
    .single();

  if (answerError || !answerRow) {
    console.error("[BoardEdge] student_answers insert failed:", answerError);
    throw new Error(`student_answers insert failed: ${answerError?.message}`);
  }

  const { error: evalError } = await supabase.from("evaluations").insert({
    student_answer_id: answerRow.id,
    marks_awarded: evaluation.marks_awarded,
    points_hit: evaluation.points_hit,
    points_missed: evaluation.points_missed,
    conceptual_errors: evaluation.conceptual_errors,
    model_answer: evaluation.model_answer,
    model_answer_source: evaluation.model_answer_source,
    examiner_feedback: evaluation.examiner_feedback,
  });

  if (evalError) {
    console.error("[BoardEdge] evaluations insert failed:", evalError);
    throw new Error(`evaluations insert failed: ${evalError.message}`);
  }
}