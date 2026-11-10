// src/lib/board-plan/service.ts
//
// Server-only reads and writes for the Weekly Board Plan. Service-role
// client, always keyed on a user id from a verified session or from the
// cron's own query — never one taken from a request body.
//
// Callers must check getEvaluationGateState() first: a plan that leads a
// locked student to pages they can't use is worse than no plan. That check
// lives with the callers (dashboard, cron) because both already hold it.

import { createAdminClient } from "@/lib/supabase/server";
import { buildProgressSnapshot, weekStartIST } from "@/lib/progress";
import type { ProgressAttempt } from "@/lib/progress/types";
import { attemptsSince, generatePlanTasks, taskProgress, type PlanTask, type TaskProgress } from "./tasks";

export interface WeeklyPlan {
  id: string;
  weekStart: string;
  tasks: PlanTask[];
  createdAt: string;
  emailedAt: string | null;
}

const COLUMNS = "id, week_start, tasks, created_at, emailed_at";

function toPlan(row: Record<string, unknown>): WeeklyPlan {
  return {
    id: row.id as string,
    weekStart: row.week_start as string,
    tasks: (Array.isArray(row.tasks) ? row.tasks : []) as PlanTask[],
    createdAt: row.created_at as string,
    emailedAt: (row.emailed_at as string | null) ?? null,
  };
}

export async function readPlan(userId: string, weekStart: string): Promise<WeeklyPlan | null> {
  const { data, error } = await createAdminClient()
    .from("weekly_plans")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw new Error(`weekly plan read failed: ${error.message}`);
  return data ? toPlan(data) : null;
}

export type EnsureResult = { plan: WeeklyPlan; created: boolean } | null;

/**
 * This week's plan, creating it from `attempts` if it doesn't exist yet.
 * Null when there is nothing to base a plan on. Safe to call concurrently
 * (the dashboard and the cron can race): the insert ignores a conflict on
 * (user_id, week_start) and the row that won is read back, so a student
 * never sees two different plans for one week.
 */
export async function ensureWeeklyPlan(
  userId: string,
  attempts: ProgressAttempt[],
  now: number = Date.now(),
): Promise<EnsureResult> {
  const weekStart = weekStartIST(now);
  const existing = await readPlan(userId, weekStart);
  if (existing) return { plan: existing, created: false };

  const tasks = generatePlanTasks(attempts, buildProgressSnapshot(attempts, now));
  if (!tasks.length) return null;

  const { data, error } = await createAdminClient()
    .from("weekly_plans")
    .upsert(
      { user_id: userId, week_start: weekStart, tasks, created_at: new Date(now).toISOString() },
      { onConflict: "user_id,week_start", ignoreDuplicates: true },
    )
    .select(COLUMNS);
  if (error) throw new Error(`weekly plan insert failed: ${error.message}`);
  // An empty result means another request created it first: read theirs.
  if (data && data.length) return { plan: toPlan(data[0]), created: true };
  const raced = await readPlan(userId, weekStart);
  return raced ? { plan: raced, created: false } : null;
}

export async function markPlanEmailed(planId: string, at: string): Promise<void> {
  const { error } = await createAdminClient().from("weekly_plans").update({ emailed_at: at }).eq("id", planId);
  if (error) console.warn("[BoardEdge] weekly plan emailed_at stamp failed:", error.message);
}

export interface PlanView {
  plan: WeeklyPlan;
  items: { task: PlanTask; progress: TaskProgress }[];
  completed: number;
}

/** Pure: the plan with progress on each task, from the student's attempts. */
export function viewPlan(plan: WeeklyPlan, attempts: ProgressAttempt[]): PlanView {
  const since = attemptsSince(attempts, plan.createdAt);
  const items = plan.tasks.map((task) => ({ task, progress: taskProgress(task, since) }));
  return { plan, items, completed: items.filter((i) => i.progress.complete).length };
}
