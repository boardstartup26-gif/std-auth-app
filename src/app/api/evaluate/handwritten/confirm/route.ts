// src/app/api/evaluate/handwritten/confirm/route.ts
//
// Step 2 of a handwritten answer: the student has reviewed the transcript.
//
//   • Unchanged → open the seal and save the grade the first call produced.
//   • Corrected → grade the corrected text like a typed answer (the only case
//     with a second model call) and save that. No further credit.
//
// Either way the saved answer is the transcript the student confirmed, and the
// same clamp, anchor resolution and persistence as the typed route apply.

import { after, NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { readCredits } from "@/lib/credits";
import { getEvaluationGateState } from "@/lib/parent-consent/service";
import { EVENTS, FAILURE_STAGES, type FailureStage } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";
import {
  persistSubmission,
  resolveMarkingPointAnchors,
  type EvaluationOutput,
} from "@/lib/evaluation/grading";
import {
  finaliseTranscript,
  gradeCorrectedTranscript,
  GradingError,
  loadQuestionById,
  MAX_TRANSCRIPT_CHARS,
  sealAlreadyUsed,
  transcriptChanged,
  unsealGrading,
  type ClaudeEval,
} from "@/lib/evaluation/handwritten";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function trackFailure(stage: FailureStage, userId: string, properties: Record<string, unknown>) {
  after(() =>
    recordServerEvent({
      eventName: EVENTS.EVALUATION_FAILED,
      userId,
      properties: { ...properties, failure_stage: stage, input_mode: "handwritten" },
      path: "/api/evaluate/handwritten/confirm",
    }),
  );
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  let body: { sealed?: unknown; transcript?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.transcript !== "string") {
    return NextResponse.json({ error: "Missing transcript" }, { status: 400 });
  }
  const submitted = body.transcript;
  if (submitted.length > MAX_TRANSCRIPT_CHARS) {
    return NextResponse.json(
      { error: `Answers are limited to ${MAX_TRANSCRIPT_CHARS} characters.` },
      { status: 400 },
    );
  }
  const answer = finaliseTranscript(submitted);
  if (!/[\p{L}\p{N}]/u.test(answer)) {
    return NextResponse.json({ error: "The transcript is empty." }, { status: 400 });
  }

  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to run an evaluation." }, { status: 401 });
  }
  const userId = user.id;

  const unsealed = unsealGrading(body.sealed);
  if (!unsealed.ok || unsealed.grading.userId !== userId) {
    const expired = unsealed.ok === false && unsealed.reason === "expired";
    return NextResponse.json(
      {
        error: expired
          ? "This review timed out after 30 minutes. Please upload your photo again."
          : "This review isn't valid any more. Please upload your photo again.",
        code: expired ? "review_expired" : "review_invalid",
      },
      { status: 400 },
    );
  }
  const grading = unsealed.grading;

  // Saving stores a minor's answer, so the gate is checked here too, not only
  // at upload: a withdrawal in between must stop it.
  const gate = await getEvaluationGateState(userId);
  if (!gate.allowed) {
    trackFailure(FAILURE_STAGES.PARENT_CONSENT_REQUIRED, userId, {
      question_id: grading.questionId, consent_status: gate.consent.status,
    });
    return NextResponse.json(
      {
        error:
          gate.consent.status === "revoked"
            ? "Evaluations are paused because your parent or guardian withdrew consent."
            : "Evaluations are locked until your parent or guardian confirms consent.",
        code: "parent_consent_required",
      },
      { status: gate.consent.status === "unavailable" ? 503 : 403 },
    );
  }

  if (await sealAlreadyUsed(grading)) {
    return NextResponse.json(
      { error: "This answer has already been marked. You'll find it in Results.", code: "already_confirmed" },
      { status: 409 },
    );
  }

  const lookup = await loadQuestionById(grading.questionId);
  if (!lookup.ok) {
    return NextResponse.json({ error: lookup.error }, { status: lookup.status });
  }
  const { question } = lookup;
  const subject = await subjectOf(question.id);

  // ─── Unchanged → the sealed grade. Corrected → grade the correction. ──────

  const edited = transcriptChanged(grading.transcript, submitted);
  let claudeEval: ClaudeEval;
  if (!edited) {
    claudeEval = grading.evaluation;
  } else {
    try {
      claudeEval = await gradeCorrectedTranscript({
        subject: subject ?? "",
        questionText: question.questionText,
        scheme: question.scheme,
        answer,
      });
    } catch (err) {
      // The seal is still unused (nothing was saved), so the student can
      // simply press confirm again. The credit spent at upload stands.
      console.error("[BoardEdge] corrected-transcript grading failed:", err);
      trackFailure(
        err instanceof GradingError
          ? err.stage === "anthropic_error"
            ? FAILURE_STAGES.ANTHROPIC_ERROR
            : err.stage === "json_parse_error"
              ? FAILURE_STAGES.JSON_PARSE_ERROR
              : FAILURE_STAGES.SCHEMA_VALIDATION_ERROR
          : FAILURE_STAGES.ANTHROPIC_ERROR,
        userId,
        { question_id: question.id, transcript_edited: true, duration_ms: Date.now() - startedAt },
      );
      return NextResponse.json(
        { error: "Marking your corrected answer failed. Please press confirm again." },
        { status: 502 },
      );
    }
  }

  // Same enforcement as the typed route: the schema checks shape, this checks
  // range. A sealed grade is ours, but it was still produced by a model.
  const total = question.scheme.total_marks;
  const clampedMarks = Math.max(0, Math.min(claudeEval.marks_awarded, total));
  const marksClamped = clampedMarks !== claudeEval.marks_awarded;

  // Quotes were taken from the transcript with its [?] markers; the saved
  // answer has them removed, so the quotes are too before anchoring.
  const markingPoints = resolveMarkingPointAnchors(
    claudeEval.marking_points.map((mp) => ({
      ...mp,
      matched_text: mp.matched_text ? finaliseTranscript(mp.matched_text) || null : null,
    })),
    answer,
  );

  const credits = await readCredits(userId);
  const evaluation: EvaluationOutput = {
    ...claudeEval,
    marking_points: markingPoints,
    marks_awarded: clampedMarks,
    total_marks: total,
    model_answer_source: question.scheme.model_answer_verified ? "verified" : "ai_generated",
    token_cost: grading.tokenCost,
    tokens_remaining: credits.remaining,
  };

  const admin = createAdminClient();
  try {
    await persistSubmission(admin, { questionId: question.id, studentAnswer: answer, userId, evaluation });
  } catch (err) {
    // Unlike the typed route there is no refund here: the credit was spent on
    // the transcription call, which succeeded. The seal is still unused, so a
    // retry saves it without charging again.
    console.error("[BoardEdge] handwritten persist error:", err);
    trackFailure(FAILURE_STAGES.PERSIST_ERROR, userId, { question_id: question.id, is_subjective: true });
    return NextResponse.json(
      { error: "Your answer was marked but couldn't be saved. Please press confirm again." },
      { status: 500 },
    );
  }

  after(async () => {
    let evalIndex: number | null = null;
    try {
      const { count } = await admin
        .from("student_answers")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      evalIndex = count ?? null;
    } catch {
      // Record the event regardless.
    }
    await recordServerEvent({
      eventName: EVENTS.EVALUATION_COMPLETED,
      userId,
      properties: {
        subject,
        question_id: question.id,
        is_subjective: true,
        input_mode: "handwritten",
        transcript_edited: edited,
        legibility: grading.legibility,
        pages: grading.pages,
        marks_awarded: clampedMarks,
        total_marks: total,
        marks_clamped: marksClamped,
        model_answer_source: evaluation.model_answer_source,
        token_cost: grading.tokenCost,
        review_ms: startedAt - grading.iat,
        eval_index: evalIndex,
        is_first_evaluation: evalIndex === 1,
      },
      path: "/api/evaluate/handwritten/confirm",
    });
  });

  return NextResponse.json({ ...evaluation, transcript: answer, transcript_edited: edited });
}

async function subjectOf(questionId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("questions")
    .select("subjects ( name )")
    .eq("id", questionId)
    .single();
  const subjects = (data as { subjects: { name: string } | null } | null)?.subjects;
  return subjects?.name ?? null;
}
