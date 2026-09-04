import { after, NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { WEEKLY_TOKEN_LIMIT, TOKEN_COST_SUBJECTIVE, TOKEN_COST_OBJECTIVE } from "@/lib/constants";
import { getUsageDateIST } from "@/lib/usage-date";
import { buildExaminerSystemPrompt } from "@/lib/prompts/examiner-prompt";
import { EVENTS, FAILURE_STAGES, type FailureStage } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EvaluateRequestBody {
  question_number: string;
  year: number;
  paper: string;
  subject: string;
  student_answer: string;
}

// Two import batches shaped MCQ options differently: chemistry/physics/
// biology/geography store plain option strings (correct_answer is the full
// matching string); history & civics / english literature store {key, text}
// objects (correct_answer is just the key letter, e.g. "d"). Both shapes
// have to be supported here.
type McqOption = string | { key: string; text: string };

interface QuestionRow {
  id: string;
  question_text: string;
  is_subjective: boolean;
  question_type: string | null;
  options: McqOption[] | null;
  correct_answer: string | null;
  diagram_required: boolean | null;
  diagram_url: string | null;
  diagram_source: "figure" | "physical_map" | "ocr_pending" | null;
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
  icse_style_issues: string[];
  unassessable_components: string[];
  model_answer: string;
  model_answer_source: "verified" | "ai_generated";
  examiner_feedback: string;
  improvement_tips: string[];
  is_objective?: boolean;
  correct_answer?: string;
  is_correct?: boolean;
  token_cost: number;
  tokens_remaining: number;
}

// ─── Zod schema for Claude's structured output ────────────────────────────────
// Claude's JSON is untrusted input, same as anything from a client — validate
// shape before it touches the DB or the response. This does NOT replace the
// marks_awarded clamp below; a value can be schema-valid and still out of
// range (e.g. 999), so both checks run.
const ClaudeEvalSchema = z.object({
  marks_awarded: z.number(),
  total_marks: z.number(),
  points_hit: z.array(z.string()),
  points_missed: z.array(z.string()),
  conceptual_errors: z.array(z.string()),
  icse_style_issues: z.array(z.string()),
  unassessable_components: z.array(z.string()),
  model_answer: z.string(),
  model_answer_source: z.enum(["verified", "ai_generated"]),
  examiner_feedback: z.string(),
  improvement_tips: z.array(z.string()),
});

// ─── User Message ─────────────────────────────────────────────────────────────

function buildUserMessage(
  questionText: string,
  studentAnswer: string,
  scheme: MarkingScheme
): string {
  return `QUESTION:
${questionText}

<student_answer>
${studentAnswer}
</student_answer>

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
    .replace(/^[a-d]\.\s*/i, "")
    .replace(/\s+/g, " ");
}

function matchObjectiveAnswer(
  userAnswer: string,
  correctAnswer: string,
  questionType: string | null
): boolean {
  const userNorm = normaliseAnswer(userAnswer);
  const correctNorm = normaliseAnswer(correctAnswer);

  if (questionType === "mcq") {
    const userLetter = userAnswer.trim().toUpperCase().charAt(0);
    const correctLetter = correctAnswer.trim().toUpperCase().charAt(0);
    return (
      userNorm === correctNorm ||
      (userLetter === correctLetter && /^[A-D]$/.test(userLetter))
    );
  }

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

  return userNorm === correctNorm;
}

// Resolves a raw MCQ answer (a full option string, or a bare key like "d")
// to the human-readable option text for display. Falls through to the raw
// value when options are plain strings, no options are on record, or the
// key doesn't resolve — never blocks showing feedback to the student.
function resolveOptionText(raw: string, options: McqOption[] | null): string {
  if (!options) return raw;
  const match = options.find(
    (opt) => typeof opt !== "string" && opt.key.toLowerCase() === raw.trim().toLowerCase()
  );
  return match && typeof match !== "string" ? match.text : raw;
}

// ─── Token Accounting (atomic) ─────────────────────────────────────────────────
// Replaces the old "SELECT count, check, then UPDATE" pattern. The RPC does
// the check-and-increment as one database operation, so two simultaneous
// requests can't both slip through before either one lands. Called BEFORE
// the Claude API request — reserve the spend first, don't spend then check.
async function reserveTokens(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  date: string,
  cost: number
): Promise<{ ok: true; newCount: number } | { ok: false }> {
  const { data, error } = await supabase.rpc("increment_usage", {
    p_user_id: userId,
    p_date: date,
    p_cost: cost,
    p_limit: WEEKLY_TOKEN_LIMIT,
  });

  if (error) {
    // TOKEN_LIMIT_EXCEEDED surfaces here as a Postgres exception.
    return { ok: false };
  }
  return { ok: true, newCount: data as number };
}

// Rollback: only called if token reservation succeeded but the Claude call
// then failed — the student shouldn't lose a token for an evaluation they
// never received. Not atomic against a concurrent request, but the failure
// window here is rare (an API error), not the common path, so it's an
// acceptable non-atomic decrement.
async function refundTokens(
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
      .update({ token_count: Math.max(0, existing.token_count - cost) })
      .eq("user_id", userId)
      .eq("usage_date", date);
  }
}

// ─── Telemetry ────────────────────────────────────────────────────────────────
//
// Recorded here rather than in the browser because this is the only place that
// knows what actually happened. A client can report that it *sent* an answer;
// only the server knows whether Anthropic timed out, the JSON came back
// malformed, or the row failed to persist — and a client that gave up mid-
// request reports nothing at all.
//
// Every call is wrapped in after() so telemetry never sits in front of the
// student's response.

function trackEvaluationFailure(
  stage: FailureStage,
  properties: Record<string, unknown>,
): void {
  after(() =>
    recordServerEvent({
      eventName: EVENTS.EVALUATION_FAILED,
      userId: (properties.user_id as string | null) ?? null,
      properties: { ...properties, user_id: undefined, failure_stage: stage },
      path: "/api/evaluate",
    }),
  );
}

/**
 * Counts the user's lifetime submissions to derive `eval_index` — 1 for a
 * first-ever evaluation, 2 for the second, and so on. That single number is
 * what makes "did they come back and do another one" answerable, which is the
 * activation question this whole funnel exists for.
 *
 * Runs after the response, so the row just written by persistSubmission is
 * already counted.
 */
function trackEvaluationCompleted(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  properties: Record<string, unknown>,
): void {
  after(async () => {
    let evalIndex: number | null = null;
    try {
      const { count } = await supabase
        .from("student_answers")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      evalIndex = count ?? null;
    } catch {
      // A missing index is worth less than a missing event — record anyway.
    }

    await recordServerEvent({
      eventName: EVENTS.EVALUATION_COMPLETED,
      userId,
      properties: {
        ...properties,
        eval_index: evalIndex,
        is_first_evaluation: evalIndex === 1,
      },
      path: "/api/evaluate",
    });
  });
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startedAt = Date.now();

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

  // Cost control. The token charge is flat (3 for subjective), but the answer
  // is pasted verbatim into the Claude prompt, so without a ceiling one
  // reservation buys an arbitrarily large input — a megabyte of text costs the
  // same 3 tokens as a paragraph. max_tokens caps the response, not the prompt.
  // 12k characters is far beyond any real ICSE answer (the longest are worth
  // 5 marks) while leaving generous headroom.
  const MAX_ANSWER_CHARS = 12_000;
  if (student_answer.length > MAX_ANSWER_CHARS) {
    // The one 400 a real student can trip. The others below only fire for
    // hand-rolled clients, so instrumenting them would add noise, not signal.
    trackEvaluationFailure(FAILURE_STAGES.BAD_REQUEST, {
      subject, year, question_number,
      reason: "answer_too_long",
      answer_length: student_answer.length,
    });
    return NextResponse.json(
      {
        error: "Answer is too long",
        detail: `Answers are limited to ${MAX_ANSWER_CHARS} characters; received ${student_answer.length}.`,
      },
      { status: 400 }
    );
  }

  // Type-confusion guard. These land in .eq() filters, which Supabase
  // parameterises — so this is not an injection risk — but a client sending
  // {"year": {"gt": 0}} or an array should be rejected outright rather than
  // producing a confusing downstream failure.
  if (
    typeof question_number !== "string" ||
    typeof paper !== "string" ||
    typeof subject !== "string" ||
    typeof student_answer !== "string" ||
    !Number.isInteger(year)
  ) {
    return NextResponse.json({ error: "Invalid field types" }, { status: 400 });
  }

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

  const { data: subjectRow, error: subjectError } = await supabase
    .from("subjects")
    .select("id")
    .eq("name", subject)
    .single();

  if (subjectError || !subjectRow) {
    trackEvaluationFailure(FAILURE_STAGES.QUESTION_NOT_FOUND, {
      user_id: userId, subject, year, paper, reason: "subject_not_found",
    });
    return NextResponse.json({ error: `Subject not found: ${subject}` }, { status: 404 });
  }

  // FIX: paper filter restored. Without it, two papers sharing a year/subject/
  // question_number silently collide — a student gets graded against the
  // wrong question's marking scheme, or sees the wrong model answer.
  const { data: questionRow, error: questionError } = await supabase
    .from("questions")
    .select(
      "id, question_text, is_subjective, question_type, options, correct_answer, diagram_required, diagram_url, diagram_source"
    )
    .eq("subject_id", subjectRow.id)
    .eq("year", year)
    .eq("question_number", question_number)
    .eq("paper", paper)
    .single();

  if (questionError || !questionRow) {
    trackEvaluationFailure(FAILURE_STAGES.QUESTION_NOT_FOUND, {
      user_id: userId, subject, year, paper, question_number,
    });
    return NextResponse.json(
      {
        error: "Question not found",
        detail: `No match for subject=${subject}, year=${year}, paper=${paper}, question_number=${question_number}`,
      },
      { status: 404 }
    );
  }

  const question = questionRow as QuestionRow;

  // Questions we can't grade are refused here, BEFORE the token reservation
  // below — the evaluate page hides them, but that block is cosmetic and a
  // direct POST would otherwise reserve (and on the Claude path, spend) tokens
  // on an answer that was never gradeable. Mirrors diagramState() in
  // src/app/(protected)/evaluate/page.tsx; keep the two in step.
  if (question.diagram_source === "ocr_pending" || question.question_type === "diagram") {
    trackEvaluationFailure(FAILURE_STAGES.UNGRADABLE_QUESTION, {
      user_id: userId, subject, year, question_number,
      question_id: question.id, reason: "diagram_drawing_required",
    });
    return NextResponse.json(
      {
        error: "This question asks for a drawing, which can't be graded yet",
        detail: "Diagram-drawing questions need handwriting recognition, which isn't implemented.",
      },
      { status: 400 }
    );
  }
  if (question.diagram_required && !question.diagram_url && question.diagram_source !== "physical_map") {
    trackEvaluationFailure(FAILURE_STAGES.UNGRADABLE_QUESTION, {
      user_id: userId, subject, year, question_number,
      question_id: question.id, reason: "figure_missing",
    });
    return NextResponse.json(
      {
        error: "This question's figure isn't available yet",
        detail: "The question depends on a figure we haven't sourced, so it can't be graded fairly.",
      },
      { status: 400 }
    );
  }

  const { data: schemeRow, error: schemeError } = await supabase
    .from("marking_schemes")
    .select(
      "scheme_text, total_marks, key_points, model_answer, model_answer_verified, accepted_alternatives, common_errors, examiner_notes, marks_per_correct_point"
    )
    .eq("question_id", question.id)
    .single();

  if (schemeError || !schemeRow) {
    trackEvaluationFailure(FAILURE_STAGES.SCHEME_NOT_FOUND, {
      user_id: userId, subject, year, question_number, question_id: question.id,
    });
    return NextResponse.json(
      { error: "Marking scheme not found for this question" },
      { status: 404 }
    );
  }

  const scheme = schemeRow as MarkingScheme;

  const isSubjective = question.is_subjective || question.question_type === "short_answer";
  const tokenCost = isSubjective ? TOKEN_COST_SUBJECTIVE : TOKEN_COST_OBJECTIVE;
  const today = getUsageDateIST();

  // FIX: atomic reserve-before-spend, replaces the old SELECT-then-later-
  // increment pattern that allowed concurrent requests to both pass the cap.
  const reservation = await reserveTokens(supabase, userId, today, tokenCost);
  if (!reservation.ok) {
    trackEvaluationFailure(FAILURE_STAGES.QUOTA_EXCEEDED, {
      user_id: userId, subject, year, question_number,
      question_id: question.id, token_cost: tokenCost,
    });
    return NextResponse.json(
      {
        error: `Not enough tokens. This question costs ${tokenCost} token${tokenCost > 1 ? "s" : ""}.`,
        limit_reached: true,
        token_cost: tokenCost,
      },
      { status: 429 }
    );
  }
  const tokensRemaining = Math.max(0, WEEKLY_TOKEN_LIMIT - reservation.newCount);

  // ─── OBJECTIVE PATH (no Claude call) ─────────────────────────────────────

  if (!isSubjective) {
    if (!question.correct_answer) {
      await refundTokens(supabase, userId, today, tokenCost);
      trackEvaluationFailure(FAILURE_STAGES.ANSWER_KEY_MISSING, {
        user_id: userId, subject, year, question_number, question_id: question.id,
      });
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

    // MCQ correct_answer is a bare key letter ("d") for history & civics /
    // english literature questions — resolve it to the option's display
    // text so the student sees the actual answer, not a lone letter.
    const correctAnswerDisplay = resolveOptionText(question.correct_answer, question.options);

    const evaluation: EvaluationOutput = {
      marks_awarded: marksAwarded,
      total_marks: scheme.total_marks,
      points_hit: isCorrect ? [correctAnswerDisplay] : [],
      points_missed: isCorrect ? [] : [correctAnswerDisplay],
      conceptual_errors: [],
      icse_style_issues: [],
      unassessable_components: [],
      model_answer: correctAnswerDisplay,
      model_answer_source: "verified",
      examiner_feedback: isCorrect
        ? "Correct."
        : `Incorrect. The correct answer is: ${correctAnswerDisplay}`,
      improvement_tips: isCorrect
        ? []
        : [`Revisit this exact question — the correct answer was "${correctAnswerDisplay}".`],
      is_objective: true,
      correct_answer: correctAnswerDisplay,
      is_correct: isCorrect,
      token_cost: tokenCost,
      tokens_remaining: tokensRemaining,
    };

    // FIX: awaited, not fire-and-forget. If this fails, the client gets a
    // real error instead of a "success" response for a grade that was never
    // saved to /history.
    try {
      await persistSubmission(supabase, {
        questionId: question.id,
        studentAnswer: student_answer,
        userId,
        evaluation,
      });
    } catch (err) {
      console.error("[BoardEdge] Persist error:", err);
      trackEvaluationFailure(FAILURE_STAGES.PERSIST_ERROR, {
        user_id: userId, subject, year, question_number,
        question_id: question.id, is_subjective: false,
      });
      return NextResponse.json(
        { error: "Evaluation succeeded but could not be saved. Please retry." },
        { status: 500 }
      );
    }

    trackEvaluationCompleted(supabase, userId, {
      subject,
      year,
      paper,
      question_id: question.id,
      question_number,
      question_type: question.question_type,
      is_subjective: false,
      is_correct: isCorrect,
      marks_awarded: marksAwarded,
      total_marks: scheme.total_marks,
      token_cost: tokenCost,
      duration_ms: Date.now() - startedAt,
    });

    return NextResponse.json(evaluation, { status: 200 });
  }

  // ─── SUBJECTIVE PATH (Claude call) ────────────────────────────────────────

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  let rawContent: string;
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: buildExaminerSystemPrompt(subject),
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
    // Token was already reserved before this call — refund it since the
    // student got no evaluation.
    await refundTokens(supabase, userId, today, tokenCost);
    console.error("[BoardEdge] Claude API error:", claudeError);
    const message = claudeError instanceof Error ? claudeError.message : "Unknown error";
    trackEvaluationFailure(FAILURE_STAGES.ANTHROPIC_ERROR, {
      user_id: userId, subject, year, question_number,
      question_id: question.id,
      // The message distinguishes a timeout from an overload from a 401 in
      // the dashboard's error panel; it is our own provider's text, not a
      // student's, so there is nothing sensitive in it.
      reason: message.slice(0, 200),
      duration_ms: Date.now() - startedAt,
    });
    return NextResponse.json(
      { error: "Evaluation failed — Claude API error", detail: message },
      { status: 502 }
    );
  }

  // Parse + validate Claude's output
  let claudeEval: z.infer<typeof ClaudeEvalSchema>;
  // Which of the two failure modes below actually fired. They look identical
  // from the catch block but mean very different things: bad JSON is usually a
  // truncated or prose-wrapped response, while a schema failure means the
  // model answered in the wrong shape.
  let parseFailureStage: FailureStage = FAILURE_STAGES.JSON_PARSE_ERROR;
  try {
    const cleaned = rawContent
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    const parsedJson = JSON.parse(cleaned);
    const validated = ClaudeEvalSchema.safeParse(parsedJson);
    if (!validated.success) {
      parseFailureStage = FAILURE_STAGES.SCHEMA_VALIDATION_ERROR;
      throw new Error(`Schema validation failed: ${validated.error.message}`);
    }
    claudeEval = validated.data;
  } catch (err) {
    await refundTokens(supabase, userId, today, tokenCost);
    console.error("[BoardEdge] Failed to parse/validate Claude output:", rawContent, err);
    trackEvaluationFailure(parseFailureStage, {
      user_id: userId, subject, year, question_number,
      question_id: question.id,
      raw_length: rawContent.length,
      duration_ms: Date.now() - startedAt,
    });
    return NextResponse.json(
      { error: "Evaluation failed — could not parse model response" },
      { status: 500 }
    );
  }

  // FIX: hard clamp — schema validation confirms shape, not range. A
  // schema-valid marks_awarded of 999 would otherwise still pass through.
  // This is the enforcement layer the original prompt-only instruction
  // ("never exceed total_marks") had nothing backing it up.
  const clampedMarks = Math.max(0, Math.min(claudeEval.marks_awarded, scheme.total_marks));
  const flaggedForReview = clampedMarks !== claudeEval.marks_awarded;
  if (flaggedForReview) {
    console.warn("[BoardEdge] marks_awarded out of range, clamped:", {
      userId,
      questionId: question.id,
      original: claudeEval.marks_awarded,
      total_marks: scheme.total_marks,
    });
  }

  claudeEval.model_answer_source = scheme.model_answer_verified ? "verified" : "ai_generated";

  const evaluation: EvaluationOutput = {
    ...claudeEval,
    marks_awarded: clampedMarks,
    token_cost: tokenCost,
    tokens_remaining: tokensRemaining,
  };

  try {
    await persistSubmission(supabase, {
      questionId: question.id,
      studentAnswer: student_answer,
      userId,
      evaluation,
    });
  } catch (err) {
    console.error("[BoardEdge] Persist error:", err);
    trackEvaluationFailure(FAILURE_STAGES.PERSIST_ERROR, {
      user_id: userId, subject, year, question_number,
      question_id: question.id, is_subjective: true,
    });
    return NextResponse.json(
      { error: "Evaluation succeeded but could not be saved. Please retry." },
      { status: 500 }
    );
  }

  trackEvaluationCompleted(supabase, userId, {
    subject,
    year,
    paper,
    question_id: question.id,
    question_number,
    question_type: question.question_type,
    is_subjective: true,
    marks_awarded: clampedMarks,
    total_marks: scheme.total_marks,
    // A clamp means the model returned a mark outside [0, total]. Rare, but
    // worth being able to count without grepping logs.
    marks_clamped: flaggedForReview,
    model_answer_source: evaluation.model_answer_source,
    token_cost: tokenCost,
    duration_ms: Date.now() - startedAt,
  });

  return NextResponse.json(evaluation, { status: 200 });
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
): Promise<void> {
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
    improvement_tips: evaluation.improvement_tips,
  });

  if (evalError) {
    console.error("[BoardEdge] evaluations insert failed:", evalError);
    throw new Error(`evaluations insert failed: ${evalError.message}`);
  }
}