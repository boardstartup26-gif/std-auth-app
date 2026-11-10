// src/lib/board-plan/run.ts
//
// The weekly cron's Board Plan step (src/app/api/cron/weekly). For every
// student active in the last ACTIVE_DAYS who can currently be graded:
// create this week's plan, put it in their inbox, and email it once.
//
// Idempotent end to end, so a retry or a second run is harmless:
//   - the plan is create-or-read on (user_id, week_start)
//   - the notification is keyed board_plan:<week_start>
//   - the email is sent only while weekly_plans.emailed_at is null
// Stops itself before the function's time limit and reports `incomplete`;
// whoever it didn't reach still gets a plan when they open the dashboard.

import { createAdminClient } from "@/lib/supabase/server";
import { getEvaluationGateState } from "@/lib/parent-consent/service";
import { readProgressAttempts } from "@/lib/progress/read";
import { buildProgressSnapshot, weekStartIST } from "@/lib/progress";
import { readEmailPrefs } from "@/lib/notifications/reattempt-email";
import { EVENTS } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";
import { ensureWeeklyPlan, markPlanEmailed } from "./service";
import { generatePlanTasks, taskCopy } from "./tasks";
import { sendBoardPlanEmail } from "./email";

const ACTIVE_DAYS = 28;
const PAGE_SIZE = 1000;
const DEFAULT_BUDGET_MS = 50_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface BoardPlanRunSummary {
  dryRun: boolean;
  weekStart: string;
  activeStudents: number;
  skippedLocked: number;
  skippedNoPlan: number;
  readFailures: number;
  plansCreated: number;
  plansExisting: number;
  notificationsCreated: number;
  emailsSent: number;
  emailsFailed: number;
  emailsSkipped: Record<string, number>;
  incomplete: boolean;
}

async function activeStudentIds(sinceIso: string): Promise<string[]> {
  const admin = createAdminClient();
  const ids = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("student_answers")
      .select("user_id")
      .gte("submitted_at", sinceIso)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`active student read failed: ${error.message}`);
    for (const row of data ?? []) ids.add(row.user_id as string);
    if (!data || data.length < PAGE_SIZE) return [...ids];
  }
}

export async function runBoardPlans({
  now = Date.now(),
  dryRun = false,
  deadline = Date.now() + DEFAULT_BUDGET_MS,
}: { now?: number; dryRun?: boolean; deadline?: number } = {}): Promise<BoardPlanRunSummary> {
  const weekStart = weekStartIST(now);
  const nowIso = new Date(now).toISOString();
  const summary: BoardPlanRunSummary = {
    dryRun,
    weekStart,
    activeStudents: 0,
    skippedLocked: 0,
    skippedNoPlan: 0,
    readFailures: 0,
    plansCreated: 0,
    plansExisting: 0,
    notificationsCreated: 0,
    emailsSent: 0,
    emailsFailed: 0,
    emailsSkipped: {},
    incomplete: false,
  };
  const skip = (reason: string) => {
    summary.emailsSkipped[reason] = (summary.emailsSkipped[reason] ?? 0) + 1;
  };

  const students = await activeStudentIds(new Date(now - ACTIVE_DAYS * DAY_MS).toISOString());
  summary.activeStudents = students.length;
  const admin = createAdminClient();

  for (const userId of students) {
    if (Date.now() > deadline) {
      summary.incomplete = true;
      break;
    }

    const gate = await getEvaluationGateState(userId);
    if (!gate.allowed) {
      summary.skippedLocked += 1;
      continue;
    }
    const read = await readProgressAttempts(userId);
    if (!read.ok) {
      summary.readFailures += 1;
      continue;
    }

    if (dryRun) {
      const tasks = generatePlanTasks(read.attempts, buildProgressSnapshot(read.attempts, now));
      if (tasks.length) summary.plansCreated += 1;
      else summary.skippedNoPlan += 1;
      continue;
    }

    let ensured;
    try {
      ensured = await ensureWeeklyPlan(userId, read.attempts, now);
    } catch (err) {
      console.error("[BoardEdge] weekly plan create failed:", err);
      summary.readFailures += 1;
      continue;
    }
    if (!ensured) {
      summary.skippedNoPlan += 1;
      continue;
    }
    const { plan, created } = ensured;
    if (created) summary.plansCreated += 1;
    else summary.plansExisting += 1;

    // ── Inbox ──
    const titles = plan.tasks.map((t) => taskCopy(t).title);
    const { data: note, error: noteError } = await admin
      .from("notifications")
      .upsert(
        {
          user_id: userId,
          kind: "board_plan",
          title: "Your board plan for this week",
          body: titles.join(" · "),
          href: "/dashboard#board-plan",
          dedupe_key: `board_plan:${weekStart}`,
          created_at: nowIso,
        },
        { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
      )
      .select("id");
    if (noteError) console.error("[BoardEdge] board plan notification failed:", noteError.message);
    else summary.notificationsCreated += note?.length ?? 0;

    // ── Email (once per plan) ──
    let emailOutcome = "sent";
    if (plan.emailedAt) emailOutcome = "already_sent";
    const prefs = emailOutcome === "sent" ? await readEmailPrefs(userId) : null;
    if (prefs && !prefs.email) emailOutcome = "no_address";
    else if (prefs && !prefs.remindersOn) emailOutcome = "unsubscribed";

    if (emailOutcome === "sent" && prefs?.email) {
      const result = await sendBoardPlanEmail({ userId, to: prefs.email, firstName: prefs.firstName, tasks: plan.tasks });
      if (result.ok) {
        summary.emailsSent += 1;
        await markPlanEmailed(plan.id, nowIso);
        const { error: stampError } = await admin
          .from("notifications")
          .update({ emailed_at: nowIso })
          .eq("user_id", userId)
          .eq("dedupe_key", `board_plan:${weekStart}`);
        if (stampError) console.warn("[BoardEdge] board plan notification stamp failed:", stampError.message);
      } else {
        summary.emailsFailed += 1;
        emailOutcome = `failed_${result.reason}`;
      }
    } else {
      skip(emailOutcome);
    }

    if (created) {
      await recordServerEvent({
        eventName: EVENTS.BOARD_PLAN_CREATED,
        userId,
        properties: { source: "cron", week_start: weekStart, kinds: plan.tasks.map((t) => t.kind), email: emailOutcome },
        path: "/api/cron/weekly",
      });
    }
  }

  return summary;
}
