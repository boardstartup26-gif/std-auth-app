// src/lib/analytics/aggregate.ts
//
// Server-only aggregation over public.analytics_events.
//
// SECURITY: every read here goes through the service-role client, which
// bypasses RLS. That is deliberate — aggregation needs to see everyone's rows
// — and it is also why getDashboardMetrics() calls requireAdmin() itself
// rather than trusting its caller to have done so. The route guard, the layout
// guard and this check are three independent locks on the same door; removing
// the one in this file would mean a single forgotten check anywhere else
// exposes the whole dataset.
//
// Nothing in this module may be imported from a Client Component: it would
// pull the service-role key into the browser bundle. It is only ever awaited
// inside Server Components.

import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "./admin";
import { EVENTS } from "./events";

// ─── Row shape ───────────────────────────────────────────────────────────────

interface EventRow {
  event_name: string;
  user_id: string | null;
  anon_id: string | null;
  session_id: string | null;
  path: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  properties: Record<string, unknown> | null;
  created_at: string;
}

// PostgREST caps a single response (Supabase's default is 1000 rows), so a
// plain .limit(50000) silently returns 1000 and every number on the dashboard
// comes out wrong. Paging is not an optimisation here, it is correctness.
const PAGE_SIZE = 1000;
const MAX_ROWS = 60_000;

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Public types ────────────────────────────────────────────────────────────

export interface FunnelStep {
  key: string;
  label: string;
  /** Distinct actors who reached this step. */
  count: number;
  /**
   * Share of the step above (or of an explicit cohort where that is the
   * meaningful denominator), 0-1. Null for the first step.
   */
  conversionFromPrevious: number | null;
  /** Share of the first step, 0-1. Drives the bar width. */
  conversionFromTop: number | null;
  hint?: string;
}

export interface SubjectStat {
  subject: string;
  evaluations: number;
  students: number;
  share: number;
  averageScore: number | null;
}

export interface ErrorStat {
  stage: string;
  label: string;
  count: number;
  lastSeen: string | null;
  sampleReason: string | null;
}

export interface AcquisitionStat {
  source: string;
  visitors: number;
  signups: number;
}

export interface RetentionStat {
  /** Signups old enough to have had the chance to return. */
  cohortSize: number;
  returned: number;
  rate: number | null;
}

export interface AbandonmentStat {
  stage: string;
  label: string;
  count: number;
}

export interface FeedbackStat {
  total: number;
  thumbsUp: number;
  thumbsDown: number;
  tags: { tag: string; count: number }[];
}

export interface DashboardMetrics {
  windowDays: number;
  generatedAt: string;
  /** True when the row cap was hit and the numbers are a lower bound. */
  truncated: boolean;
  totalEvents: number;

  kpis: {
    visitors: number;
    signups: number;
    activeStudents: number;
    evaluations: number;
    evaluationsPerStudent: number | null;
    failureRate: number | null;
    repeatEvaluationRate: number | null;
  };

  funnel: FunnelStep[];
  evalIndexBuckets: { label: string; count: number }[];
  subjects: SubjectStat[];
  errors: ErrorStat[];
  errorTotal: number;
  abandonment: AbandonmentStat[];
  abandonmentTotal: number;
  acquisition: AcquisitionStat[];
  retention: {
    d1: RetentionStat;
    d7: RetentionStat;
    within7d: RetentionStat;
  };
  feedback: FeedbackStat;
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

async function fetchEvents(sinceIso: string): Promise<{ rows: EventRow[]; truncated: boolean }> {
  const supabase = createAdminClient();
  const rows: EventRow[] = [];

  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("analytics_events")
      .select(
        "event_name, user_id, anon_id, session_id, path, referrer, utm_source, utm_medium, utm_campaign, properties, created_at",
      )
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("[BoardEdge] analytics read failed:", error);
      break;
    }
    if (!data || data.length === 0) break;

    rows.push(...(data as EventRow[]));
    if (data.length < PAGE_SIZE) break;
  }

  return { rows, truncated: rows.length >= MAX_ROWS };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Human label for a snake_case key, used for stages and tags alike. */
function humanise(key: string): string {
  const spaced = key.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/** Bare host of a referrer URL, for grouping. "reddit.com", not the full link. */
function referrerHost(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

/**
 * Everything the dashboard renders, computed in one pass over one query.
 *
 * @param windowDays how far back to look. Retention needs headroom inside this
 *   window (a D7 cohort must be at least 8 days old), so short windows report
 *   an empty D7 cohort rather than a misleadingly low rate.
 */
export async function getDashboardMetrics(windowDays = 30): Promise<DashboardMetrics> {
  // Not the caller's job to remember. See the security note at the top.
  await requireAdmin();

  const days = Math.min(Math.max(Math.round(windowDays), 1), 365);
  const now = Date.now();
  const since = new Date(now - days * DAY_MS);
  const { rows, truncated } = await fetchEvents(since.toISOString());

  // ── Identity resolution ───────────────────────────────────────────────────
  //
  // A visitor is an anon_id before signup and a user_id after it. Counting
  // those separately would make every post-signup funnel step look like it
  // came from a different population. Rows that carry both stitch the two
  // halves together, so one person counts once across the whole funnel.
  const anonToUser = new Map<string, string>();
  for (const row of rows) {
    if (row.user_id && row.anon_id && !anonToUser.has(row.anon_id)) {
      anonToUser.set(row.anon_id, row.user_id);
    }
  }

  const actorOf = (row: EventRow): string =>
    row.user_id ??
    (row.anon_id ? anonToUser.get(row.anon_id) ?? row.anon_id : null) ??
    row.session_id ??
    "unknown";

  // ── Single pass ───────────────────────────────────────────────────────────

  const actorsByEvent = new Map<string, Set<string>>();
  const addActor = (event: string, actor: string) => {
    let set = actorsByEvent.get(event);
    if (!set) actorsByEvent.set(event, (set = new Set()));
    set.add(actor);
  };

  const activeStudents = new Set<string>();
  const repeatEvaluators = new Set<string>();

  const evalIndexCounts = { first: 0, second: 0, third_plus: 0, unknown: 0 };

  const subjectEvals = new Map<string, { count: number; students: Set<string>; marks: number; total: number }>();

  const errorCounts = new Map<string, { count: number; lastSeen: string | null; sampleReason: string | null }>();
  let errorTotal = 0;
  let completedTotal = 0;

  const abandonCounts = new Map<string, number>();
  let abandonmentTotal = 0;
  const abandonedRows: { actor: string; questionId: string | null; stage: string }[] = [];
  const submittedQuestions = new Set<string>();

  const acquisition = new Map<string, { visitors: Set<string>; signups: number }>();
  const actorSource = new Map<string, string>();

  const signupAt = new Map<string, number>();
  const activityByUser = new Map<string, number[]>();

  const feedback: FeedbackStat = { total: 0, thumbsUp: 0, thumbsDown: 0, tags: [] };
  const feedbackTags = new Map<string, number>();

  for (const row of rows) {
    const actor = actorOf(row);
    const props = row.properties ?? {};
    const at = Date.parse(row.created_at);

    addActor(row.event_name, actor);

    if (row.user_id) {
      activeStudents.add(row.user_id);
      const list = activityByUser.get(row.user_id);
      if (list) list.push(at);
      else activityByUser.set(row.user_id, [at]);
    }

    // Acquisition source: an explicit UTM tag wins, then the external
    // referrer's host, then "direct". Recorded per actor rather than per event
    // so a chatty session cannot outweigh a quiet one.
    if (!actorSource.has(actor)) {
      const source = str(row.utm_source) ?? referrerHost(row.referrer) ?? "direct";
      actorSource.set(actor, source);
      let bucket = acquisition.get(source);
      if (!bucket) acquisition.set(source, (bucket = { visitors: new Set(), signups: 0 }));
      bucket.visitors.add(actor);
    }

    switch (row.event_name) {
      case EVENTS.SIGNUP_COMPLETED: {
        const source = actorSource.get(actor);
        if (source) {
          const bucket = acquisition.get(source);
          if (bucket) bucket.signups += 1;
        }
        if (row.user_id && !signupAt.has(row.user_id)) signupAt.set(row.user_id, at);
        break;
      }

      case EVENTS.ANSWER_SUBMITTED: {
        const questionId = str(props.question_id);
        if (questionId) submittedQuestions.add(`${actor}|${questionId}`);
        break;
      }

      case EVENTS.EVALUATION_COMPLETED: {
        completedTotal += 1;

        const evalIndex = num(props.eval_index);
        if (evalIndex === null) evalIndexCounts.unknown += 1;
        else if (evalIndex <= 1) evalIndexCounts.first += 1;
        else if (evalIndex === 2) evalIndexCounts.second += 1;
        else evalIndexCounts.third_plus += 1;
        if (evalIndex !== null && evalIndex >= 2) repeatEvaluators.add(actor);

        const subject = str(props.subject) ?? "Unknown";
        let entry = subjectEvals.get(subject);
        if (!entry) subjectEvals.set(subject, (entry = { count: 0, students: new Set(), marks: 0, total: 0 }));
        entry.count += 1;
        entry.students.add(actor);
        const awarded = num(props.marks_awarded);
        const total = num(props.total_marks);
        if (awarded !== null && total !== null && total > 0) {
          entry.marks += awarded;
          entry.total += total;
        }
        break;
      }

      case EVENTS.EVALUATION_FAILED: {
        errorTotal += 1;
        const stage = str(props.failure_stage) ?? "unknown";
        const existing = errorCounts.get(stage);
        const reason = str(props.reason);
        if (existing) {
          existing.count += 1;
          existing.lastSeen = row.created_at;
          existing.sampleReason = reason ?? existing.sampleReason;
        } else {
          errorCounts.set(stage, { count: 1, lastSeen: row.created_at, sampleReason: reason });
        }
        break;
      }

      case EVENTS.EVALUATION_ABANDONED: {
        abandonedRows.push({
          actor,
          questionId: str(props.question_id),
          stage: str(props.stage) ?? "question_selected",
        });
        break;
      }

      case EVENTS.FEEDBACK_SUBMITTED: {
        feedback.total += 1;
        const rating = str(props.rating);
        if (rating === "up") feedback.thumbsUp += 1;
        if (rating === "down") feedback.thumbsDown += 1;
        if (Array.isArray(props.tags)) {
          for (const tag of props.tags) {
            if (typeof tag !== "string") continue;
            feedbackTags.set(tag, (feedbackTags.get(tag) ?? 0) + 1);
          }
        }
        break;
      }
    }
  }

  // Abandonment is resolved after the pass, because the submission that
  // cancels it may have happened later in the window than the walk-away.
  // Conservative by design: a question abandoned on Monday and submitted on
  // Friday is not counted, so this under-reports rather than crying wolf.
  for (const row of abandonedRows) {
    if (row.questionId && submittedQuestions.has(`${row.actor}|${row.questionId}`)) continue;
    abandonmentTotal += 1;
    abandonCounts.set(row.stage, (abandonCounts.get(row.stage) ?? 0) + 1);
  }

  // ── Funnel ────────────────────────────────────────────────────────────────

  const visitors = new Set<string>([
    ...(actorsByEvent.get(EVENTS.PAGE_VIEW) ?? []),
    ...(actorsByEvent.get(EVENTS.VISITOR_FIRST_TOUCH) ?? []),
  ]);
  const signedUp = actorsByEvent.get(EVENTS.SIGNUP_COMPLETED) ?? new Set<string>();
  const selected = actorsByEvent.get(EVENTS.QUESTION_SELECTED) ?? new Set<string>();
  const submitted = actorsByEvent.get(EVENTS.ANSWER_SUBMITTED) ?? new Set<string>();
  const completed = actorsByEvent.get(EVENTS.EVALUATION_COMPLETED) ?? new Set<string>();

  // ── Retention ─────────────────────────────────────────────────────────────
  //
  // A cohort only counts once it has had the chance to return: a student who
  // signed up an hour ago has not "failed" D1. Excluding them keeps a recent
  // burst of signups from dragging the rate down.
  const retentionFor = (fromDays: number, toDays: number | null): RetentionStat => {
    let cohortSize = 0;
    let returned = 0;

    for (const [userId, signedUpAt] of signupAt) {
      const windowStart = signedUpAt + fromDays * DAY_MS;
      const windowEnd = toDays === null ? now : signedUpAt + toDays * DAY_MS;
      // Not mature enough to judge yet.
      if (windowEnd > now) continue;

      cohortSize += 1;
      const activity = activityByUser.get(userId) ?? [];
      if (activity.some((t) => t >= windowStart && t < windowEnd)) returned += 1;
    }

    return { cohortSize, returned, rate: ratio(returned, cohortSize) };
  };

  const d1 = retentionFor(1, 2);
  const d7 = retentionFor(7, 8);
  const within7d = retentionFor(1, 7);

  // `denominator` overrides "share of the step above" where that comparison
  // would be meaningless. The retention step is the case: day-7 returners are
  // drawn from the signup cohort, not from the students who ran a second
  // evaluation, and dividing by the latter can exceed 100% and read as a bug.
  const funnelRaw: {
    key: string;
    label: string;
    count: number;
    hint?: string;
    denominator?: number;
  }[] = [
    { key: "visitors", label: "Visitors", count: visitors.size, hint: "Unique browsers that opened any page" },
    { key: "signups", label: "Signed up", count: signedUp.size, hint: "Account created (email or Google)" },
    { key: "selected", label: "Question selected", count: selected.size, hint: "Opened a past-paper question" },
    { key: "submitted", label: "Answer submitted", count: submitted.size, hint: "Pressed Evaluate" },
    { key: "completed", label: "Evaluation returned", count: completed.size, hint: "Got a graded result back" },
    { key: "repeat", label: "Second evaluation", count: repeatEvaluators.size, hint: "Came back for another question" },
    {
      key: "returned_d7",
      label: "Returned on day 7",
      count: d7.returned,
      hint: `Of ${d7.cohortSize} signups old enough to count`,
      denominator: d7.cohortSize,
    },
  ];

  const top = funnelRaw[0]?.count ?? 0;
  const funnel: FunnelStep[] = funnelRaw.map((step, i) => ({
    key: step.key,
    label: step.label,
    count: step.count,
    hint: step.hint,
    conversionFromPrevious:
      i === 0 ? null : ratio(step.count, step.denominator ?? funnelRaw[i - 1].count),
    conversionFromTop: ratio(step.count, top),
  }));

  // ── Shaping ───────────────────────────────────────────────────────────────

  const subjects: SubjectStat[] = [...subjectEvals.entries()]
    .map(([subject, entry]) => ({
      subject,
      evaluations: entry.count,
      students: entry.students.size,
      share: ratio(entry.count, completedTotal) ?? 0,
      averageScore: entry.total > 0 ? entry.marks / entry.total : null,
    }))
    .sort((a, b) => b.evaluations - a.evaluations);

  const errors: ErrorStat[] = [...errorCounts.entries()]
    .map(([stage, entry]) => ({
      stage,
      label: humanise(stage),
      count: entry.count,
      lastSeen: entry.lastSeen,
      sampleReason: entry.sampleReason,
    }))
    .sort((a, b) => b.count - a.count);

  const abandonment: AbandonmentStat[] = [...abandonCounts.entries()]
    .map(([stage, count]) => ({
      stage,
      label: stage === "answer_started" ? "Started typing, left" : "Opened question, left",
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const acquisitionStats: AcquisitionStat[] = [...acquisition.entries()]
    .map(([source, entry]) => ({ source, visitors: entry.visitors.size, signups: entry.signups }))
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, 12);

  feedback.tags = [...feedbackTags.entries()]
    .map(([tag, count]) => ({ tag: humanise(tag), count }))
    .sort((a, b) => b.count - a.count);

  return {
    windowDays: days,
    generatedAt: new Date(now).toISOString(),
    truncated,
    totalEvents: rows.length,

    kpis: {
      visitors: visitors.size,
      signups: signedUp.size,
      activeStudents: activeStudents.size,
      evaluations: completedTotal,
      evaluationsPerStudent: ratio(completedTotal, activeStudents.size),
      failureRate: ratio(errorTotal, errorTotal + completedTotal),
      repeatEvaluationRate: ratio(repeatEvaluators.size, completed.size),
    },

    funnel,
    evalIndexBuckets: [
      { label: "1st evaluation", count: evalIndexCounts.first },
      { label: "2nd evaluation", count: evalIndexCounts.second },
      { label: "3rd+ evaluation", count: evalIndexCounts.third_plus },
      ...(evalIndexCounts.unknown > 0 ? [{ label: "Unattributed", count: evalIndexCounts.unknown }] : []),
    ],
    subjects,
    errors,
    errorTotal,
    abandonment,
    abandonmentTotal,
    acquisition: acquisitionStats,
    retention: { d1, d7, within7d },
    feedback,
  };
}
