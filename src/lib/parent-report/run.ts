// src/lib/parent-report/run.ts
//
// The weekly cron's Parent Report step (src/app/api/cron/weekly), after the
// Board Plans. Sends nothing unless PARENT_REPORTS_ENABLED=true.
//
// Who gets one: consent status 'confirmed', a parent email on file, and
// reports_enabled_for equal to it (the parent opted in from that address) —
// read from the raw row, never from the consent kill switch. A withdrawn
// consent ('revoked') is excluded by the status filter. Students inactive
// for ACTIVE_DAYS get nothing: a run of "didn't practise" emails reads as
// surveillance, not support. At most one report per ~week per student
// (report_last_sent_at), so a retry or second run is harmless.

import { createAdminClient } from "@/lib/supabase/server";
import { readProgressAttempts } from "@/lib/progress/read";
import { weekStartIST } from "@/lib/progress";
import { readPlan, viewPlan } from "@/lib/board-plan/service";
import { EVENTS } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";
import { buildParentReport } from "./content";
import { sendParentReport } from "./email";
import {
  markReportSent,
  parentReportsLive,
  readStudentFirstName,
  REPORT_ROW_COLUMNS,
  reportState,
  toReportRow,
  type ReportRow,
} from "./service";

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_DAYS = 28;
const MIN_GAP_MS = 6 * DAY_MS;
const PAGE_SIZE = 1000;

export interface ParentReportRunSummary {
  disabled: boolean;
  dryRun: boolean;
  optedIn: number;
  skipped: Record<string, number>;
  sent: number;
  failed: number;
  incomplete: boolean;
}

async function optedInRows(): Promise<ReportRow[]> {
  const admin = createAdminClient();
  const rows: ReportRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("parent_consents")
      .select(REPORT_ROW_COLUMNS)
      .eq("status", "confirmed")
      .not("parent_email", "is", null)
      .not("reports_enabled_for", "is", null)
      .order("user_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`parent report recipients read failed: ${error.message}`);
    rows.push(...(data ?? []).map((r) => toReportRow(r)));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

export async function runParentReports({
  now = Date.now(),
  dryRun = false,
  deadline = Date.now() + 50_000,
}: { now?: number; dryRun?: boolean; deadline?: number } = {}): Promise<ParentReportRunSummary> {
  const summary: ParentReportRunSummary = { disabled: false, dryRun, optedIn: 0, skipped: {}, sent: 0, failed: 0, incomplete: false };
  if (!parentReportsLive()) return { ...summary, disabled: true };
  const skip = (reason: string) => {
    summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1;
  };

  const rows = await optedInRows();
  summary.optedIn = rows.length;
  const nowIso = new Date(now).toISOString();
  const lastWeek = weekStartIST(now - 7 * DAY_MS);

  for (const row of rows) {
    if (Date.now() > deadline) {
      summary.incomplete = true;
      break;
    }
    // The opt-in must belong to the address on file today.
    if (reportState(row) !== "on" || !row.parentEmail) {
      skip("address_changed");
      continue;
    }
    if (row.lastSentAt && now - Date.parse(row.lastSentAt) < MIN_GAP_MS) {
      skip("sent_recently");
      continue;
    }
    const read = await readProgressAttempts(row.userId);
    if (!read.ok) {
      skip("read_failed");
      continue;
    }
    const lastActive = Math.max(0, ...read.attempts.map((a) => Date.parse(a.submittedAt)));
    if (now - lastActive > ACTIVE_DAYS * DAY_MS) {
      skip("inactive");
      continue;
    }

    let plan: { completed: number; total: number } | null = null;
    try {
      const p = await readPlan(row.userId, lastWeek);
      if (p) {
        const v = viewPlan(p, read.attempts);
        plan = { completed: v.completed, total: v.items.length };
      }
    } catch {
      // A missing plan figure is not a reason to skip the report.
    }

    const report = buildParentReport(read.attempts, now, plan);
    if (dryRun) {
      summary.sent += 1;
      continue;
    }

    const result = await sendParentReport({
      userId: row.userId,
      to: row.parentEmail,
      firstName: await readStudentFirstName(row.userId),
      report,
    });
    if (!result.ok) {
      summary.failed += 1;
      skip(`failed_${result.reason}`);
      continue;
    }
    summary.sent += 1;
    await markReportSent(row.userId, nowIso);
    await recordServerEvent({
      eventName: EVENTS.PARENT_REPORT_SENT,
      userId: row.userId,
      properties: { answers: report.answers, active: report.answers > 0 },
      path: "/api/cron/weekly",
    });
  }
  return summary;
}
