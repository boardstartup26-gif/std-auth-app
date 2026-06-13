import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EvaluateRequestBody {
  question_number: string;
  year: number;
  paper: string;
  subject: string;
  student_answer: string;
  declared_marks: number;
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
9. DO NOT be lenient because the student declared higher marks. declared_marks is context only — it does not influence your award.
10. Output ONLY valid JSON matching the schema below. No preamble, no markdown fences, no trailing text.

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
  declaredMarks: number,
  scheme: MarkingScheme
): string {
  return `QUESTION:
${questionText}

STUDENT'S ANSWER:
${studentAnswer}

STUDENT DECLARED MARKS: ${declaredMarks}

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

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Parse + validate request body
  let body: EvaluateRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { question_number, year, paper, subject, student_answer, declared_marks } = body;

  if (!question_number || !year || !paper || !subject || !student_answer || declared_marks === undefined) {
    return NextResponse.json(
      { error: "Missing required fields: question_number, year, paper, subject, student_answer, declared_marks" },
      { status: 400 }
    );
  }

  if (student_answer.trim().length < 5) {
    return NextResponse.json({ error: "student_answer is too short to evaluate" }, { status: 400 });
  }

  // Extract authenticated user
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  const userId = user?.id ?? null;

  // 2. DB lookups
  const supabase = createAdminClient();

  // 2a. Resolve subject_id
  const { data: subjectRow, error: subjectError } = await supabase
    .from("subjects")
    .select("id")
    .eq("name", subject)
    .single();

  if (subjectError || !subjectRow) {
    return NextResponse.json(
      { error: `Subject not found: ${subject}` },
      { status: 404 }
    );
  }

  // 2b. Fetch question
  const { data: questionRow, error: questionError } = await supabase
    .from("questions")
    .select("id, question_text")
    .eq("subject_id", subjectRow.id)
    .eq("year", year)
    .eq("paper", paper)
    .eq("question_number", question_number)
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

  // 2c. Fetch marking scheme
  const { data: schemeRow, error: schemeError } = await supabase
    .from("marking_schemes")
    .select(
      "scheme_text, total_marks, key_points, model_answer, model_answer_verified, accepted_alternatives, common_errors, examiner_notes"
    )
    .eq("question_id", questionRow.id)
    .single();

  if (schemeError || !schemeRow) {
    return NextResponse.json(
      { error: "Marking scheme not found for this question" },
      { status: 404 }
    );
  }

  const scheme = schemeRow as MarkingScheme;

  // 3. Call Claude
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
          content: buildUserMessage(
            questionRow.question_text,
            student_answer,
            declared_marks,
            scheme
          ),
        },
      ],
    });

    // Extract text content block
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

  // 4. Parse Claude's JSON response
  let evaluation: EvaluationOutput;
  try {
    // Strip accidental markdown fences if Claude misbehaves
    const cleaned = rawContent
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    evaluation = JSON.parse(cleaned);
  } catch {
    console.error("[BoardEdge] Failed to parse Claude output:", rawContent);
    return NextResponse.json(
      { error: "Evaluation failed — could not parse model response", raw: rawContent },
      { status: 500 }
    );
  }

  // 5. Enforce model_answer_source from DB truth, not Claude's guess
  evaluation.model_answer_source = scheme.model_answer_verified ? "verified" : "ai_generated";

  // 6. Persist to student_answers + evaluations (fire-and-forget; don't block response)
  persistSubmission(supabase, {
    questionId: questionRow.id,
    studentAnswer: student_answer,
    declaredMarks: declared_marks,
    userId,
    evaluation,
  }).catch((err) => console.error("[BoardEdge] Persist error:", err));

  return NextResponse.json(evaluation, { status: 200 });
}

// ─── Background Persistence ───────────────────────────────────────────────────

async function persistSubmission(
  supabase: ReturnType<typeof createAdminClient>,
  {
    questionId,
    studentAnswer,
    declaredMarks,
    userId,
    evaluation,
  }: {
    questionId: string;
    studentAnswer: string;
    declaredMarks: number;
    userId: string | null;
    evaluation: EvaluationOutput;
  }
) {
  // Insert student_answer — matches schema: id, user_id, question_id, answer_text, submitted_at
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
    return;
  }

  // Insert evaluation — total_marks NOT a column here (lives on marking_schemes via question_id)
  const { error: evalError } = await supabase.from("evaluations").insert({
    student_answer_id: answerRow.id,
    marks_awarded: evaluation.marks_awarded,
    points_hit: evaluation.points_hit,
    points_missed: evaluation.points_missed,
    conceptual_errors: evaluation.conceptual_errors,
    model_answer: evaluation.model_answer,
    model_answer_source: evaluation.model_answer_source,
    declared_marks: declaredMarks,
    examiner_feedback: evaluation.examiner_feedback,
  });

  if (evalError) {
    console.error("[BoardEdge] evaluations insert failed:", evalError);
  }
}