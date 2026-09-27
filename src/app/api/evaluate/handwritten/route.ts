// src/app/api/evaluate/handwritten/route.ts
//
// Step 1 of a handwritten answer: photo(s) in, transcript out. The single
// Claude call here also grades that transcript, but the grade leaves this
// route sealed (see src/lib/evaluation/handwritten.ts) and is only opened by
// /confirm once the student has checked the transcript.
//
// Ordering mirrors the typed route, and the consent gate stays first: it runs
// before the question lookup, the credit reservation, and before any photo is
// sent to Anthropic. The photos themselves are never stored.
//
// A handwritten written answer costs the same credit as a typed one
// (CREDIT_COST_SUBJECTIVE). It is spent here, at transcription, because this
// is where the model call happens; confirming later, with or without
// corrections, costs nothing more.

import { after, NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { CREDIT_COST_SUBJECTIVE, WEEKLY_CREDIT_LIMIT } from "@/lib/constants";
import { getUsageDateIST } from "@/lib/usage-date";
import { getEvaluationGateState } from "@/lib/parent-consent/service";
import { EVENTS, FAILURE_STAGES, type FailureStage } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";
import { refundTokens, reserveTokens } from "@/lib/evaluation/grading";
import {
  GradingError,
  loadQuestionByKey,
  MAX_PAGES,
  MAX_TOTAL_BYTES,
  sealGrading,
  sniffImageType,
  transcribeAndGrade,
  type ImageMediaType,
} from "@/lib/evaluation/handwritten";

export const dynamic = "force-dynamic";
// A vision call that transcribes and grades takes longer than a typed grade.
export const maxDuration = 60;

function trackFailure(stage: FailureStage, userId: string | null, properties: Record<string, unknown>) {
  after(() =>
    recordServerEvent({
      eventName: EVENTS.EVALUATION_FAILED,
      userId,
      properties: { ...properties, failure_stage: stage, input_mode: "handwritten" },
      path: "/api/evaluate/handwritten",
    }),
  );
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart form with photos" }, { status: 400 });
  }

  const subject = form.get("subject");
  const paper = form.get("paper");
  const questionNumber = form.get("question_number");
  const year = Number(form.get("year"));
  if (
    typeof subject !== "string" || !subject ||
    typeof paper !== "string" || !paper ||
    typeof questionNumber !== "string" || !questionNumber ||
    !Number.isInteger(year)
  ) {
    return NextResponse.json({ error: "Missing required fields: subject, year, paper, question_number" }, { status: 400 });
  }

  const files = form.getAll("pages").filter((f): f is File => f instanceof File);
  if (files.length < 1 || files.length > MAX_PAGES) {
    return NextResponse.json(
      { error: `Add between 1 and ${MAX_PAGES} photos of your answer.` },
      { status: 400 },
    );
  }
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      { error: "Those photos are too large together. Try fewer pages, or retake them a little further away." },
      { status: 413 },
    );
  }

  // ─── Auth + consent gate (before anything else is done with the photos) ───

  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to run an evaluation." }, { status: 401 });
  }
  const userId = user.id;

  const gate = await getEvaluationGateState(userId);
  if (!gate.allowed) {
    trackFailure(FAILURE_STAGES.PARENT_CONSENT_REQUIRED, userId, {
      subject, year, question_number: questionNumber, consent_status: gate.consent.status,
    });
    const unavailable = gate.consent.status === "unavailable";
    return NextResponse.json(
      {
        error: unavailable
          ? "We couldn't check your parent or guardian consent. Please try again in a moment."
          : gate.consent.status === "revoked"
            ? "Evaluations are paused because your parent or guardian withdrew consent."
            : "You've used your free evaluations. Evaluations unlock once your parent or guardian confirms consent — check the notice at the top of the page.",
        code: "parent_consent_required",
        consent_status: gate.consent.status,
      },
      { status: unavailable ? 503 : 403 },
    );
  }

  // ─── Photos (validated by their bytes, not their declared type) ───────────

  const images: { mediaType: ImageMediaType; base64: string }[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mediaType = sniffImageType(bytes);
    if (!mediaType) {
      return NextResponse.json({ error: "Photos must be JPEG, PNG or WebP images." }, { status: 400 });
    }
    images.push({ mediaType, base64: Buffer.from(bytes).toString("base64") });
  }

  // ─── Question ─────────────────────────────────────────────────────────────

  const lookup = await loadQuestionByKey({ subject, year, paper, questionNumber });
  if (!lookup.ok) {
    trackFailure(
      lookup.reason === "scheme_not_found"
        ? FAILURE_STAGES.SCHEME_NOT_FOUND
        : lookup.status === 404
          ? FAILURE_STAGES.QUESTION_NOT_FOUND
          : FAILURE_STAGES.UNGRADABLE_QUESTION,
      userId,
      { subject, year, question_number: questionNumber, reason: lookup.reason },
    );
    return NextResponse.json({ error: lookup.error }, { status: lookup.status });
  }
  const { question } = lookup;

  // ─── Credit (reserve before the call, refund if nothing usable comes back) ─

  const admin = createAdminClient();
  const today = getUsageDateIST();
  const tokenCost = CREDIT_COST_SUBJECTIVE;
  const reservation = await reserveTokens(admin, userId, today, tokenCost);
  if (!reservation.ok) {
    trackFailure(FAILURE_STAGES.QUOTA_EXCEEDED, userId, {
      subject, year, question_number: questionNumber, question_id: question.id, token_cost: tokenCost,
    });
    return NextResponse.json(
      {
        error: `Not enough credits. This question costs ${tokenCost} credit${tokenCost > 1 ? "s" : ""}.`,
        limit_reached: true,
        token_cost: tokenCost,
      },
      { status: 429 },
    );
  }
  const tokensRemaining = Math.max(0, WEEKLY_CREDIT_LIMIT - reservation.newCount);

  // ─── The one call: transcribe + grade ─────────────────────────────────────

  let result;
  try {
    result = await transcribeAndGrade({
      subject,
      questionText: question.questionText,
      scheme: question.scheme,
      images,
    });
  } catch (err) {
    await refundTokens(admin, userId, today, tokenCost);
    const stage =
      err instanceof GradingError
        ? err.stage === "anthropic_error"
          ? FAILURE_STAGES.ANTHROPIC_ERROR
          : err.stage === "json_parse_error"
            ? FAILURE_STAGES.JSON_PARSE_ERROR
            : FAILURE_STAGES.SCHEMA_VALIDATION_ERROR
        : FAILURE_STAGES.OCR_FAILED;
    console.error("[BoardEdge] handwritten transcribe+grade failed:", err);
    trackFailure(stage, userId, {
      subject, year, question_number: questionNumber, question_id: question.id,
      pages: images.length, duration_ms: Date.now() - startedAt,
      reason: err instanceof Error ? err.message.slice(0, 200) : "unknown",
    });
    return NextResponse.json(
      { error: "We couldn't read your photo just now. Your credit has been returned — please try again." },
      { status: 502 },
    );
  }

  // Nothing readable: no transcript to review, so nothing to charge for.
  if (result.legibility === "illegible" || !/[\p{L}\p{N}]/u.test(result.transcript)) {
    await refundTokens(admin, userId, today, tokenCost);
    trackFailure(FAILURE_STAGES.OCR_FAILED, userId, {
      subject, year, question_number: questionNumber, question_id: question.id,
      pages: images.length, reason: "illegible", duration_ms: Date.now() - startedAt,
    });
    return NextResponse.json(
      {
        error:
          "We couldn't read an answer in that photo. Try again in good light, with the page flat and filling the frame. Your credit has been returned.",
        code: "illegible",
      },
      { status: 422 },
    );
  }

  const sealed = sealGrading({
    userId,
    questionId: question.id,
    transcript: result.transcript,
    legibility: result.legibility,
    evaluation: {
      marks_awarded: result.marks_awarded,
      total_marks: result.total_marks,
      marking_points: result.marking_points,
      conceptual_errors: result.conceptual_errors,
      icse_style_issues: result.icse_style_issues,
      unassessable_components: result.unassessable_components,
      model_answer: result.model_answer,
      model_answer_source: result.model_answer_source,
      examiner_feedback: result.examiner_feedback,
      improvement_tips: result.improvement_tips,
    },
    tokenCost,
    pages: images.length,
  });

  after(() =>
    recordServerEvent({
      eventName: EVENTS.TRANSCRIPT_READY,
      userId,
      properties: {
        subject, year, question_id: question.id, pages: images.length,
        legibility: result.legibility, transcript_length: result.transcript.length,
        duration_ms: Date.now() - startedAt,
      },
      path: "/api/evaluate/handwritten",
    }),
  );

  // Deliberately no marks, points or feedback in this response: the student
  // reviews the transcript first. They are inside `sealed`, unreadable here.
  return NextResponse.json({
    transcript: result.transcript,
    legibility: result.legibility,
    sealed,
    token_cost: tokenCost,
    tokens_remaining: tokensRemaining,
  });
}
