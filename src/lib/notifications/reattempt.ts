// src/lib/notifications/reattempt.ts
//
// Spaced Reattempt Prompts: the first thing in the product that asks a student
// to come back.
//
// The rule, per student and question:
//   - Look at their *latest* attempt at a written (Claude-graded) question in
//     the last LOOKBACK_DAYS. MCQs are excluded: once the answer is shown,
//     "reattempting" one is just clicking the option you now know.
//   - If it scored full marks, the question is done. Nothing is sent.
//   - Otherwise it is due for another go at roughly 1, 3 and 7 days after that
//     attempt. Each step is sent once (the dedupe key carries the answer id and
//     the step), and a newer step retires the older one's unread row so the
//     inbox never holds two prompts for the same question.
//   - A new attempt that still falls short starts its own 1/3/7 cycle, keyed
//     on the new answer id. That repetition is the point.
//
// Limits, so this reads as a coach and not as spam:
//   - At most MAX_NEW_PER_RUN new prompts per student per run, highest marks
//     lost first.
//   - At most one reminder email per EMAIL_MIN_GAP_HOURS, never to a student
//     who submitted something in the last ACTIVE_WITHIN_HOURS (they are
//     already back), and never after they unsubscribe. In-app prompts are not
//     affected by any of these.
//   - Nothing at all for a student who can't currently be graded (parental
//     consent still owed after the free evaluations, or withdrawn): a prompt
//     that leads to a locked page is worse than no prompt.
//
// Server-only. Runs from the daily cron (src/app/api/cron/reattempt-prompts).

import { createAdminClient } from "@/lib/supabase/server";
import { getEvaluationGateState } from "@/lib/parent-consent/service";
import { isSubjectiveGraded } from "@/lib/question-format";
import { EVENTS } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";
import { readEmailPrefs, sendReattemptEmail } from "./reattempt-email";
import { formatMarks, questionLabel, reattemptHref } from "./reattempt-copy";

// ─── Tunables ────────────────────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000;

/**
 * When each step becomes due, in hours after the attempt. Nominally 1, 3 and
 * 7 days, each pulled 4 hours early: the cron runs once a day, and without the
 * slack an answer written at 8 pm would miss the next evening's 7 pm run and
 * slip a whole day.
 */
const STEP_DUE_AFTER_HOURS = [20, 68, 164] as const;
const LOOKBACK_DAYS = 30;
const MAX_NEW_PER_RUN = 3;
const EMAIL_MIN_GAP_HOURS = 44;
const ACTIVE_WITHIN_HOURS = 20;
const PAGE_SIZE = 1000;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AttemptRow {
  id: string;
  user_id: string;
  question_id: string;
  submitted_at: string;
  questions: {
    id: string;
    question_number: string | null;
    year: number | null;
    is_subjective: boolean;
    question_type: string | null;
    subjects: { name: string } | null;
    marking_schemes: { total_marks: number | string }[] | null;
  } | null;
  evaluations: { marks_awarded: number | string | null }[] | null;
}

export interface ReattemptCandidate {
  userId: string;
  answerId: string;
  questionId: string;
  subject: string;
  year: number | null;
  questionNumber: string;
  awarded: number;
  total: number;
  submittedAt: string;
  step: 1 | 2 | 3;
}

export interface RunSummary {
  dryRun: boolean;
  attemptsScanned: number;
  studentsWithDuePrompts: number;
  studentsSkippedLocked: number;
  notificationsCreated: number;
  emailsSent: number;
  emailsFailed: number;
  emailsSkipped: Record<string, number>;
}

// ─── Copy ────────────────────────────────────────────────────────────────────

function promptCopy(c: ReattemptCandidate): { title: string; body: string } {
  const score = `${formatMarks(c.awarded)}/${formatMarks(c.total)}`;
  const title = `Try ${questionLabel(c)} again`;
  const body =
    c.step === 1
      ? `You scored ${score}. Rewrite it now, while the points you missed are still fresh.`
      : c.step === 2
        ? `A few days on from your ${score}. A second attempt is what makes the missed points stick.`
        : `A week since your ${score}. Try it without looking back at the model answer.`;
  return { title, body };
}

const dedupeKey = (answerId: string, step: number) => `reattempt:${answerId}:${step}`;

// ─── Reads ───────────────────────────────────────────────────────────────────

async function readRecentAttempts(sinceIso: string): Promise<AttemptRow[]> {
  const admin = createAdminClient();
  const rows: AttemptRow[] = [];
  // PostgREST caps a response at 1000 rows; a bare select would silently drop
  // the rest (the same trap noted in analytics/aggregate.ts).
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("student_answers")
      .select(
        `id, user_id, question_id, submitted_at,
         questions ( id, question_number, year, is_subjective, question_type,
                     subjects ( name ), marking_schemes ( total_marks ) ),
         evaluations ( marks_awarded )`,
      )
      .gte("submitted_at", sinceIso)
      .order("submitted_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`attempt read failed: ${error.message}`);
    rows.push(...((data ?? []) as unknown as AttemptRow[]));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

async function readSentPrompts(sinceIso: string) {
  const admin = createAdminClient();
  const sent = new Set<string>();
  const lastEmailed = new Map<string, number>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("notifications")
      .select("id, user_id, dedupe_key, emailed_at")
      .eq("kind", "reattempt")
      .gte("created_at", sinceIso)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`notification read failed: ${error.message}`);
    for (const row of data ?? []) {
      const userId = row.user_id as string;
      sent.add(`${userId}|${row.dedupe_key as string}`);
      if (row.emailed_at) {
        const t = Date.parse(row.emailed_at as string);
        if (t > (lastEmailed.get(userId) ?? 0)) lastEmailed.set(userId, t);
      }
    }
    if (!data || data.length < PAGE_SIZE) return { sent, lastEmailed };
  }
}

// ─── Selection ───────────────────────────────────────────────────────────────

function stepFor(ageHours: number): 0 | 1 | 2 | 3 {
  let step = 0;
  for (const due of STEP_DUE_AFTER_HOURS) if (ageHours >= due) step += 1;
  return step as 0 | 1 | 2 | 3;
}

/**
 * Pure: every due prompt, grouped by student, plus each student's latest
 * submission time. Exported so the rule can be checked without a database.
 */
export function selectDuePrompts(rows: AttemptRow[], now: number) {
  const latest = new Map<string, AttemptRow>();
  const lastActive = new Map<string, number>();

  for (const row of rows) {
    const t = Date.parse(row.submitted_at);
    if (t > (lastActive.get(row.user_id) ?? 0)) lastActive.set(row.user_id, t);
    const key = `${row.user_id}|${row.question_id}`;
    const prev = latest.get(key);
    if (!prev || Date.parse(prev.submitted_at) <= t) latest.set(key, row);
  }

  const due = new Map<string, ReattemptCandidate[]>();
  for (const row of latest.values()) {
    const q = row.questions;
    const ev = row.evaluations?.[0];
    const subject = q?.subjects?.name;
    if (!q || !ev || !subject || !q.question_number) continue;
    if (!isSubjectiveGraded(q)) continue;

    const total = Number(q.marking_schemes?.[0]?.total_marks ?? 0);
    const awarded = Number(ev.marks_awarded ?? 0);
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(awarded)) continue;
    if (awarded >= total) continue; // full marks: this one is done

    const step = stepFor((now - Date.parse(row.submitted_at)) / HOUR_MS);
    if (step === 0) continue;

    const list = due.get(row.user_id) ?? [];
    list.push({
      userId: row.user_id,
      answerId: row.id,
      questionId: q.id,
      subject,
      year: q.year,
      questionNumber: q.question_number,
      awarded,
      total,
      submittedAt: row.submitted_at,
      step,
    });
    due.set(row.user_id, list);
  }

  // Most marks lost first; the more recent attempt breaks a tie.
  for (const list of due.values()) {
    list.sort(
      (a, b) =>
        b.total - b.awarded - (a.total - a.awarded) ||
        Date.parse(b.submittedAt) - Date.parse(a.submittedAt),
    );
  }
  return { due, lastActive };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

export async function runReattemptPrompts({
  now = Date.now(),
  dryRun = false,
}: { now?: number; dryRun?: boolean } = {}): Promise<RunSummary> {
  const summary: RunSummary = {
    dryRun,
    attemptsScanned: 0,
    studentsWithDuePrompts: 0,
    studentsSkippedLocked: 0,
    notificationsCreated: 0,
    emailsSent: 0,
    emailsFailed: 0,
    emailsSkipped: {},
  };
  const skip = (reason: string) => {
    summary.emailsSkipped[reason] = (summary.emailsSkipped[reason] ?? 0) + 1;
  };

  const rows = await readRecentAttempts(new Date(now - LOOKBACK_DAYS * 24 * HOUR_MS).toISOString());
  summary.attemptsScanned = rows.length;

  const { due, lastActive } = selectDuePrompts(rows, now);
  // A little wider than the lookback, so a step sent near the window's edge is
  // still recognised as sent.
  const { sent, lastEmailed } = await readSentPrompts(
    new Date(now - (LOOKBACK_DAYS + 10) * 24 * HOUR_MS).toISOString(),
  );

  const admin = createAdminClient();
  const nowIso = new Date(now).toISOString();

  for (const [userId, candidates] of due) {
    const fresh = candidates
      .filter((c) => !sent.has(`${userId}|${dedupeKey(c.answerId, c.step)}`))
      .slice(0, MAX_NEW_PER_RUN);
    if (!fresh.length) continue;
    summary.studentsWithDuePrompts += 1;

    const gate = await getEvaluationGateState(userId);
    if (!gate.allowed) {
      summary.studentsSkippedLocked += 1;
      continue;
    }

    if (dryRun) {
      summary.notificationsCreated += fresh.length;
      continue;
    }

    const { data: inserted, error } = await admin
      .from("notifications")
      .upsert(
        fresh.map((c) => ({
          user_id: userId,
          kind: "reattempt",
          ...promptCopy(c),
          href: reattemptHref(c),
          dedupe_key: dedupeKey(c.answerId, c.step),
          created_at: nowIso,
        })),
        { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
      )
      .select("id, dedupe_key");
    if (error) {
      console.error("[BoardEdge] reattempt prompt insert failed:", error.message);
      continue;
    }

    const created = inserted ?? [];
    summary.notificationsCreated += created.length;
    if (!created.length) continue;
    const createdKeys = new Set(created.map((r) => r.dedupe_key as string));
    const createdCandidates = fresh.filter((c) => createdKeys.has(dedupeKey(c.answerId, c.step)));

    // A later step replaces an earlier one still sitting unread for the same
    // attempt, so the inbox shows one prompt per question.
    for (const c of createdCandidates) {
      if (c.step === 1) continue;
      const { error: supersedeError } = await admin
        .from("notifications")
        .update({ read_at: nowIso })
        .eq("user_id", userId)
        .eq("kind", "reattempt")
        .is("read_at", null)
        .like("dedupe_key", `reattempt:${c.answerId}:%`)
        .neq("dedupe_key", dedupeKey(c.answerId, c.step));
      if (supersedeError) console.warn("[BoardEdge] reattempt supersede failed:", supersedeError.message);
    }

    // ── Email ──
    let emailOutcome = "sent";
    const prefs = await readEmailPrefs(userId);
    if (!prefs.email) emailOutcome = "no_address";
    else if (!prefs.remindersOn) emailOutcome = "unsubscribed";
    else if (now - (lastActive.get(userId) ?? 0) < ACTIVE_WITHIN_HOURS * HOUR_MS) emailOutcome = "recently_active";
    else if (now - (lastEmailed.get(userId) ?? 0) < EMAIL_MIN_GAP_HOURS * HOUR_MS) emailOutcome = "emailed_recently";

    if (emailOutcome === "sent" && prefs.email) {
      const result = await sendReattemptEmail({
        userId,
        to: prefs.email,
        firstName: prefs.firstName,
        prompts: createdCandidates,
      });
      if (result.ok) {
        summary.emailsSent += 1;
        const { error: stampError } = await admin
          .from("notifications")
          .update({ emailed_at: nowIso })
          .in("id", created.map((r) => r.id as string));
        if (stampError) console.warn("[BoardEdge] emailed_at stamp failed:", stampError.message);
      } else {
        summary.emailsFailed += 1;
        emailOutcome = `failed_${result.reason}`;
      }
    } else {
      skip(emailOutcome);
    }

    await recordServerEvent({
      eventName: EVENTS.REATTEMPT_PROMPTS_CREATED,
      userId,
      properties: {
        count: createdCandidates.length,
        steps: createdCandidates.map((c) => c.step),
        subjects: [...new Set(createdCandidates.map((c) => c.subject))],
        email: emailOutcome,
      },
      path: "/api/cron/reattempt-prompts",
    });
  }

  return summary;
}
