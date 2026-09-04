// src/lib/analytics/events.ts
//
// The telemetry vocabulary, shared by the browser tracker, the /api/track
// ingest route and the dashboard aggregator. One list, imported by all three,
// so a renamed event breaks the build instead of quietly zeroing a funnel step.
//
// Nothing here is secret — event names ship in the client bundle by design.
// What must never ship is a way to *read* events back; that lives behind RLS
// and the /admin server guard.

export const EVENTS = {
  // ── Acquisition ────────────────────────────────────────────────────────────
  /** Any route entry, authenticated or not. The top of the funnel. */
  PAGE_VIEW: "page_view",
  /** Fired once per browser, the first time we ever see this visitor. */
  VISITOR_FIRST_TOUCH: "visitor_first_touch",

  // ── Auth conversion ────────────────────────────────────────────────────────
  SIGNUP_STARTED: "signup_started",
  SIGNUP_COMPLETED: "signup_completed",
  LOGIN_COMPLETED: "login_completed",
  AUTH_FAILED: "auth_failed",

  // ── Evaluation lifecycle ───────────────────────────────────────────────────
  QUESTION_SELECTED: "question_selected",
  /** First keystroke / option pick on a question. Separates "looked" from "tried". */
  ANSWER_TYPING_STARTED: "answer_typing_started",
  ANSWER_SUBMITTED: "answer_submitted",
  EVALUATION_COMPLETED: "evaluation_completed",
  EVALUATION_FAILED: "evaluation_failed",
  /** Selected a question, or started typing, then left without submitting. */
  EVALUATION_ABANDONED: "evaluation_abandoned",

  // ── Feedback ───────────────────────────────────────────────────────────────
  FEEDBACK_SUBMITTED: "feedback_submitted",
} as const;

export type AnalyticsEventName = (typeof EVENTS)[keyof typeof EVENTS];

/**
 * Allowlist enforced at ingest. An unknown name is dropped rather than stored:
 * /api/track is an unauthenticated write path, and without this any script on
 * the internet could mint arbitrary event names and make the dashboard
 * unreadable.
 */
export const ALLOWED_EVENT_NAMES: ReadonlySet<string> = new Set(
  Object.values(EVENTS),
);

/**
 * Where an evaluation died. Recorded as `failure_stage` on
 * EVALUATION_FAILED so the dashboard can separate "our model call timed out"
 * from "the student ran out of tokens" — very different problems.
 */
export const FAILURE_STAGES = {
  /** Weekly token cap hit. A product signal, not a bug. */
  QUOTA_EXCEEDED: "quota_exceeded",
  BAD_REQUEST: "bad_request",
  QUESTION_NOT_FOUND: "question_not_found",
  SCHEME_NOT_FOUND: "scheme_not_found",
  ANSWER_KEY_MISSING: "answer_key_missing",
  /** Diagram-drawing / missing-figure questions we refuse to grade. */
  UNGRADABLE_QUESTION: "ungradable_question",
  /** Anthropic call threw — timeout, 5xx, overload. */
  ANTHROPIC_ERROR: "anthropic_error",
  /** Model replied, but the body was not JSON. */
  JSON_PARSE_ERROR: "json_parse_error",
  /** Body parsed, but failed the Zod contract. */
  SCHEMA_VALIDATION_ERROR: "schema_validation_error",
  /** Graded fine, but the write to student_answers/evaluations failed. */
  PERSIST_ERROR: "persist_error",
  /** Client-side: request never reached us. */
  NETWORK_ERROR: "network_error",
  /**
   * Handwriting/scan recognition failed. No OCR upload path exists yet — this
   * is reserved so the dashboard's error panel already has a bucket for it the
   * day one ships.
   */
  OCR_FAILED: "ocr_failed",
} as const;

export type FailureStage = (typeof FAILURE_STAGES)[keyof typeof FAILURE_STAGES];

/** Where a student was standing when they walked away. */
export type AbandonStage = "question_selected" | "answer_started";

/**
 * Free-form but bounded. `properties` is JSONB, so anything JSON-shaped
 * survives the round trip; the ingest route caps its size.
 */
export type EventProperties = Record<string, unknown>;

/** Acquisition context, captured on first touch and replayed on every event. */
export interface AttributionContext {
  referrer?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
}

/** The wire format accepted by POST /api/track. */
export interface TrackPayload extends AttributionContext {
  event_name: string;
  anon_id?: string | null;
  session_id?: string | null;
  path?: string | null;
  properties?: EventProperties;
}
