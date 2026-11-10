// src/lib/parent-report/service.ts
//
// Server-only state for Parent Reports. Service-role client throughout,
// keyed on a user id from a verified session, a verified signed link, or the
// cron's own query.
//
// The single eligibility rule (see the migration): consent status
// 'confirmed', a parent email on file, and reports_enabled_for equal to that
// email. Read from the raw row — never getParentConsentState(), whose kill
// switch reports everyone as confirmed.

import { createAdminClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { maskEmail } from "@/lib/parent-consent/service";
import { createReportToken, reportTokenUserId, verifyReportToken, type ReportTokenPurpose } from "./token";

/**
 * Off unless PARENT_REPORTS_ENABLED=true. Reports widen what the parent email
 * is used for, so nothing is offered or sent until the privacy policy says
 * so. Checked by every entry point: account invite, opt-in page, cron.
 */
export function parentReportsLive(): boolean {
  return process.env.PARENT_REPORTS_ENABLED === "true";
}

export const INVITE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface ReportRow {
  userId: string;
  parentEmail: string | null;
  status: string;
  enabledFor: string | null;
  lastSentAt: string | null;
  invitedAt: string | null;
}

const COLUMNS = "user_id, parent_email, status, reports_enabled_for, report_last_sent_at, report_invited_at";

export function toReportRow(r: Record<string, unknown>): ReportRow {
  return {
    userId: r.user_id as string,
    parentEmail: (r.parent_email as string | null) ?? null,
    status: r.status as string,
    enabledFor: (r.reports_enabled_for as string | null) ?? null,
    lastSentAt: (r.report_last_sent_at as string | null) ?? null,
    invitedAt: (r.report_invited_at as string | null) ?? null,
  };
}

export const REPORT_ROW_COLUMNS = COLUMNS;

export async function readReportRow(userId: string): Promise<ReportRow | null> {
  const { data, error } = await createAdminClient().from("parent_consents").select(COLUMNS).eq("user_id", userId).maybeSingle();
  if (error) {
    console.warn("[BoardEdge] parent report row read failed:", error.message);
    return null;
  }
  return data ? toReportRow(data) : null;
}

const same = (a: string | null, b: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export type ReportState = "unavailable" | "off" | "on";

/** Pure. "unavailable" until a parent has confirmed consent from an address on file. */
export function reportState(row: ReportRow | null): ReportState {
  if (!row || row.status !== "confirmed" || !row.parentEmail) return "unavailable";
  return same(row.enabledFor, row.parentEmail) ? "on" : "off";
}

export async function readStudentFirstName(userId: string): Promise<string | null> {
  const { data } = await createAdminClient().from("profiles").select("first_name").eq("id", userId).maybeSingle();
  const name = ((data?.first_name as string | null) ?? "").trim().slice(0, 40);
  return name || null;
}

/** Absolute links for one parent, or null without a site URL. */
export function reportLinks(purpose: ReportTokenPurpose, userId: string, parentEmail: string) {
  const siteUrl = getSiteUrl();
  if (!siteUrl) return null;
  const t = encodeURIComponent(createReportToken(purpose, userId, parentEmail));
  return {
    page: `${siteUrl}/parent-reports?t=${t}&a=${purpose}`,
    oneClick: `${siteUrl}/api/parent-report/unsubscribe?t=${t}`,
  };
}

export interface ResolvedLink {
  userId: string;
  parentEmail: string;
  parentEmailMasked: string;
  firstName: string | null;
  state: ReportState;
}

/**
 * The student and parent a signed link belongs to, or null if the link is
 * forged, cut short, or was sent to an address no longer on file.
 */
export async function resolveReportLink(purpose: ReportTokenPurpose, token: unknown): Promise<ResolvedLink | null> {
  const userId = reportTokenUserId(token);
  if (!userId || typeof token !== "string") return null;
  const row = await readReportRow(userId);
  if (!row?.parentEmail || !verifyReportToken(purpose, token, userId, row.parentEmail)) return null;
  return {
    userId,
    parentEmail: row.parentEmail,
    parentEmailMasked: maskEmail(row.parentEmail),
    firstName: await readStudentFirstName(userId),
    state: reportState(row),
  };
}

/**
 * Turns reports on or off for the parent address the link was sent to.
 * Conditional on that address still being on file, so a change to the
 * parent email between reading and writing can't opt in someone else.
 */
export async function setParentReports(userId: string, parentEmail: string, on: boolean): Promise<boolean> {
  let query = createAdminClient()
    .from("parent_consents")
    .update(
      on
        ? { reports_enabled_for: parentEmail, reports_enabled_at: new Date().toISOString() }
        : { reports_enabled_for: null, reports_enabled_at: null },
    )
    .eq("user_id", userId)
    .eq("parent_email", parentEmail);
  if (on) query = query.eq("status", "confirmed");
  const { data, error } = await query.select("user_id");
  if (error) {
    console.error("[BoardEdge] parent report preference write failed:", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Claims the invite slot for this student, at most once per INVITE_COOLDOWN_MS.
 * An atomic conditional update, so two quick presses can't send two emails.
 */
export async function claimInviteSlot(userId: string, now: number = Date.now()): Promise<boolean> {
  const cutoff = new Date(now - INVITE_COOLDOWN_MS).toISOString();
  const { data, error } = await createAdminClient()
    .from("parent_consents")
    .update({ report_invited_at: new Date(now).toISOString() })
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .or(`report_invited_at.is.null,report_invited_at.lt.${cutoff}`)
    .select("user_id");
  if (error) {
    console.error("[BoardEdge] parent report invite claim failed:", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export async function markReportSent(userId: string, at: string): Promise<void> {
  const { error } = await createAdminClient().from("parent_consents").update({ report_last_sent_at: at }).eq("user_id", userId);
  if (error) console.warn("[BoardEdge] report_last_sent_at stamp failed:", error.message);
}
