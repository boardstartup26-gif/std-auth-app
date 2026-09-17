// src/lib/parent-consent/service.ts
//
// Verifiable parental consent: state, request (send/resend), and confirmation.
//
// All reads and writes use the service-role client keyed by a user id that the
// caller has already taken from a verified session (or, for the parent, from a
// verified token). parent_consents has no client write path at all — a student
// who could write their own row could confirm themselves.
//
// The single rule everything else hangs off: evaluation access requires
// status === "confirmed". Anything else — no row, no email yet, pending,
// expired, revoked, or a failed read — is locked.

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { escapeHtml, sendEmail } from "@/lib/email/send";
import { POLICIES } from "@/lib/legal/policies";
import { GRIEVANCE_EMAIL } from "./constants";
import {
  createConsentToken,
  hashesMatch,
  verifyConsentToken,
} from "./token";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Minimum gap between two emails for one student. */
export const RESEND_COOLDOWN_MS = 60 * 1000;
/** Most emails one student can trigger in a rolling 24 hours. */
export const MAX_SENDS_PER_WINDOW = 5;
const SEND_WINDOW_MS = 24 * 60 * 60 * 1000;

export { GRIEVANCE_EMAIL };

// ─── Types ───────────────────────────────────────────────────────────────────

interface ConsentRow {
  id: string;
  user_id: string;
  parent_email: string | null;
  verification_token_hash: string | null;
  token_expires_at: string | null;
  status: "pending" | "confirmed" | "expired" | "revoked";
  confirmed_at: string | null;
  revoked_at: string | null;
  last_sent_at: string | null;
  send_count: number;
  send_window_started_at: string | null;
}

const ROW_COLUMNS =
  "id, user_id, parent_email, verification_token_hash, token_expires_at, status, confirmed_at, revoked_at, last_sent_at, send_count, send_window_started_at";

export type ParentConsentStatus =
  | "needs_email" // no row, or a row with no parent email yet
  | "pending" // link sent, not yet confirmed, not expired
  | "expired" // link sent, 72h passed without confirmation
  | "confirmed"
  | "revoked"
  | "unavailable"; // read failed — treated as locked

export interface ParentConsentState {
  status: ParentConsentStatus;
  /** "p•••@gmail.com" — never the full address in UI chrome. */
  parentEmailMasked: string | null;
  tokenExpiresAt: string | null;
  /** Earliest moment a resend will be accepted, if currently rate-limited. */
  resendAvailableAt: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  return `${local.slice(0, 1)}•••@${domain}`;
}

function getSiteUrl(): string | null {
  // Never derived from the request's Host header: a student who could steer
  // the link's domain could send their parent a link to a site they control,
  // capture the token, and confirm themselves.
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  return null;
}

const emailSchema = z.string().trim().toLowerCase().max(320).pipe(z.email());

export function normaliseParentEmail(raw: unknown): string | null {
  const parsed = emailSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** When the next send will be allowed for this row, or null if allowed now. */
function nextSendAllowedAt(row: ConsentRow, now: number): number | null {
  const cooldownEnds = row.last_sent_at ? Date.parse(row.last_sent_at) + RESEND_COOLDOWN_MS : 0;
  const windowStart = row.send_window_started_at ? Date.parse(row.send_window_started_at) : null;
  const windowOpen = windowStart !== null && now - windowStart < SEND_WINDOW_MS;
  const windowEnds =
    windowOpen && row.send_count >= MAX_SENDS_PER_WINDOW ? windowStart + SEND_WINDOW_MS : 0;
  const allowedAt = Math.max(cooldownEnds, windowEnds);
  return allowedAt > now ? allowedAt : null;
}

async function readRow(userId: string): Promise<{ row: ConsentRow | null; error: boolean }> {
  const { data, error } = await createAdminClient()
    .from("parent_consents")
    .select(ROW_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[BoardEdge] parent consent read failed:", error.message);
    return { row: null, error: true };
  }
  return { row: (data as ConsentRow | null) ?? null, error: false };
}

// ─── State ───────────────────────────────────────────────────────────────────

export async function getParentConsentState(userId: string): Promise<ParentConsentState> {
  const locked = (status: ParentConsentStatus): ParentConsentState => ({
    status,
    parentEmailMasked: null,
    tokenExpiresAt: null,
    resendAvailableAt: null,
  });

  let result: { row: ConsentRow | null; error: boolean };
  try {
    result = await readRow(userId);
  } catch (err) {
    console.error("[BoardEdge] parent consent read threw:", err);
    return locked("unavailable");
  }
  if (result.error) return locked("unavailable");

  const row = result.row;
  if (!row) return locked("needs_email");

  const now = Date.now();
  const allowedAt = nextSendAllowedAt(row, now);
  const base = {
    parentEmailMasked: row.parent_email ? maskEmail(row.parent_email) : null,
    tokenExpiresAt: row.token_expires_at,
    resendAvailableAt: allowedAt ? new Date(allowedAt).toISOString() : null,
  };

  if (row.status === "confirmed") return { status: "confirmed", ...base };
  if (row.status === "revoked") return { status: "revoked", ...base };
  if (!row.parent_email) return { status: "needs_email", ...base };
  if (
    row.status === "expired" ||
    !row.token_expires_at ||
    Date.parse(row.token_expires_at) <= now
  ) {
    return { status: "expired", ...base };
  }
  return { status: "pending", ...base };
}

/** The gate. Only an explicit confirmation unlocks evaluation. */
export async function hasConfirmedParentConsent(userId: string): Promise<boolean> {
  return (await getParentConsentState(userId)).status === "confirmed";
}

// ─── Request (send / resend / change email) ──────────────────────────────────

export type RequestResult =
  | { ok: true; parentEmailMasked: string }
  | {
      ok: false;
      reason:
        | "invalid_email"
        | "same_as_student"
        | "email_required"
        | "already_confirmed"
        | "revoked"
        | "rate_limited"
        | "send_failed"
        | "unavailable";
      retryAt?: string;
    };

/**
 * Create or refresh the pending consent row and email the parent a new link.
 *
 * `parentEmail` is optional on a plain resend (the stored address is reused)
 * and required the first time. Rate limits are enforced on the row with an
 * optimistic-concurrency update, so two simultaneous clicks send one email.
 */
export async function requestParentConsent(input: {
  userId: string;
  studentEmail: string | null;
  studentFirstName: string | null;
  parentEmail?: unknown;
}): Promise<RequestResult> {
  const { userId } = input;
  const supabase = createAdminClient();

  let newEmail: string | null = null;
  if (input.parentEmail !== undefined && input.parentEmail !== null && input.parentEmail !== "") {
    newEmail = normaliseParentEmail(input.parentEmail);
    if (!newEmail) return { ok: false, reason: "invalid_email" };
    if (input.studentEmail && newEmail === input.studentEmail.trim().toLowerCase()) {
      return { ok: false, reason: "same_as_student" };
    }
  }

  try {
    // Ensure a row exists (Google signups and anyone the backfill missed).
    const { error: ensureError } = await supabase
      .from("parent_consents")
      .upsert({ user_id: userId, status: "pending" }, { onConflict: "user_id", ignoreDuplicates: true });
    if (ensureError) {
      console.error("[BoardEdge] parent consent ensure-row failed:", ensureError.message);
      return { ok: false, reason: "unavailable" };
    }

    const { row, error } = await readRow(userId);
    if (error || !row) return { ok: false, reason: "unavailable" };

    if (row.status === "confirmed") return { ok: false, reason: "already_confirmed" };
    // A withdrawal is the parent's decision; the student must not be able to
    // undo it by pointing a fresh link at a different address.
    if (row.status === "revoked") return { ok: false, reason: "revoked" };

    const parentEmail = newEmail ?? row.parent_email;
    if (!parentEmail) return { ok: false, reason: "email_required" };

    const now = Date.now();
    const allowedAt = nextSendAllowedAt(row, now);
    if (allowedAt) {
      return { ok: false, reason: "rate_limited", retryAt: new Date(allowedAt).toISOString() };
    }

    const siteUrl = getSiteUrl();
    if (!siteUrl) {
      console.error("[BoardEdge] NEXT_PUBLIC_SITE_URL is not set; cannot build consent link.");
      return { ok: false, reason: "send_failed" };
    }

    const windowStart =
      row.send_window_started_at && now - Date.parse(row.send_window_started_at) < SEND_WINDOW_MS
        ? row.send_window_started_at
        : new Date(now).toISOString();
    const sendCount = windowStart === row.send_window_started_at ? row.send_count + 1 : 1;

    const { token, tokenHash, expiresAt } = createConsentToken(row.id, now);

    // Optimistic concurrency on last_sent_at: if another request sent in the
    // meantime, this update matches nothing and we report rate_limited rather
    // than sending twice.
    let update = supabase
      .from("parent_consents")
      .update({
        parent_email: parentEmail,
        verification_token_hash: tokenHash,
        token_expires_at: expiresAt.toISOString(),
        status: "pending",
        last_sent_at: new Date(now).toISOString(),
        send_count: sendCount,
        send_window_started_at: windowStart,
        updated_at: new Date(now).toISOString(),
      })
      .eq("id", row.id)
      .in("status", ["pending", "expired"]);
    update = row.last_sent_at ? update.eq("last_sent_at", row.last_sent_at) : update.is("last_sent_at", null);

    const { data: updated, error: updateError } = await update.select("id");
    if (updateError) {
      console.error("[BoardEdge] parent consent update failed:", updateError.message);
      return { ok: false, reason: "unavailable" };
    }
    if (!updated || updated.length === 0) {
      return {
        ok: false,
        reason: "rate_limited",
        retryAt: new Date(now + RESEND_COOLDOWN_MS).toISOString(),
      };
    }

    const link = `${siteUrl}/parent-confirm?token=${encodeURIComponent(token)}`;
    const sent = await sendEmail(
      buildConsentEmail({
        to: parentEmail,
        link,
        studentFirstName: input.studentFirstName,
        expiresAt,
      }),
    );
    // The send slot is spent even on failure — a broken provider shouldn't
    // be hammered by repeated clicks.
    if (!sent.ok) return { ok: false, reason: "send_failed" };

    return { ok: true, parentEmailMasked: maskEmail(parentEmail) };
  } catch (err) {
    console.error("[BoardEdge] parent consent request threw:", err);
    return { ok: false, reason: "unavailable" };
  }
}

function buildConsentEmail({
  to,
  link,
  studentFirstName,
  expiresAt,
}: {
  to: string;
  link: string;
  studentFirstName: string | null;
  expiresAt: Date;
}) {
  // The first name is student-typed text, so it is length-capped and escaped
  // before it goes anywhere near HTML.
  const name = (studentFirstName ?? "").trim().slice(0, 40);
  const who = name ? name : "Your child";
  const expires = expiresAt.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });
  const siteUrl = new URL(link).origin;

  const text = [
    `Hello,`,
    ``,
    `${who} has created an account on BoardEdge and gave this email address as their parent or guardian.`,
    ``,
    `BoardEdge is an online practice tool for ICSE Class 9 and 10 students. Students answer past-paper questions and get marks and feedback against the official marking scheme. Written answers are graded by an AI model.`,
    ``,
    `Because students under 18 need a parent's or guardian's consent, their account can't submit answers for grading until you confirm. To review what data is used and confirm, open this link (valid until ${expires} IST):`,
    ``,
    link,
    ``,
    `If you don't recognise this, or don't want to give consent, you can ignore this email — no answers will be graded. To ask us to delete the account, write to ${GRIEVANCE_EMAIL}.`,
    ``,
    `Privacy Policy: ${siteUrl}${POLICIES.privacy.href}`,
    ``,
    `— BoardEdge`,
  ].join("\n");

  const safeWho = escapeHtml(who);
  const safeLink = escapeHtml(link);
  const html = `<!doctype html>
<html><body style="margin:0;background:#FAF9F5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16181D;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5C6068;margin:0 0 16px;">BoardEdge</p>
    <h1 style="font-family:Georgia,serif;font-weight:500;font-size:26px;line-height:1.2;margin:0 0 20px;">Please confirm consent for ${safeWho}&rsquo;s account</h1>
    <p style="font-size:16px;line-height:1.6;margin:0 0 14px;">${safeWho} has created an account on BoardEdge and gave this email address as their parent or guardian.</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 14px;">BoardEdge is an online practice tool for ICSE Class 9 and 10 students. Students answer past-paper questions and get marks and feedback against the official marking scheme. Written answers are graded by an AI model.</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 24px;">Because students under 18 need a parent&rsquo;s or guardian&rsquo;s consent, the account can&rsquo;t submit answers for grading until you confirm.</p>
    <p style="margin:0 0 24px;"><a href="${safeLink}" style="display:inline-block;background:#C43D2B;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px;">Review and confirm</a></p>
    <p style="font-size:13px;line-height:1.6;color:#5C6068;margin:0 0 14px;">This link is valid until ${escapeHtml(expires)} IST. If the button doesn&rsquo;t work, copy this address into your browser:<br><span style="word-break:break-all;">${safeLink}</span></p>
    <p style="font-size:13px;line-height:1.6;color:#5C6068;margin:0;">Don&rsquo;t recognise this, or don&rsquo;t want to give consent? Ignore this email and no answers will be graded. To ask us to delete the account, write to <a href="mailto:${GRIEVANCE_EMAIL}" style="color:#C43D2B;">${GRIEVANCE_EMAIL}</a>.</p>
  </div>
</body></html>`;

  return {
    to,
    subject: "Please confirm consent for a BoardEdge student account",
    text,
    html,
  };
}

// ─── Confirmation (parent side) ──────────────────────────────────────────────

export type TokenInspection =
  | { state: "ready"; studentFirstName: string | null; parentEmailMasked: string | null }
  | { state: "invalid" }
  | { state: "expired" }
  | { state: "superseded" }
  | { state: "already_confirmed" }
  | { state: "revoked" }
  | { state: "unavailable" };

async function loadForToken(token: string): Promise<
  | { kind: "result"; result: TokenInspection }
  | { kind: "row"; row: ConsentRow; tokenHash: string }
> {
  const check = verifyConsentToken(token);
  if (!check.ok && check.reason !== "expired") return { kind: "result", result: { state: "invalid" } };

  const consentId = check.consentId;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("parent_consents")
    .select(ROW_COLUMNS)
    .eq("id", consentId)
    .maybeSingle();
  if (error) {
    console.error("[BoardEdge] parent consent token lookup failed:", error.message);
    return { kind: "result", result: { state: "unavailable" } };
  }
  const row = data as ConsentRow | null;
  if (!row) return { kind: "result", result: { state: "invalid" } };

  // Status first: a link that was used, then later expired or replaced, should
  // still say "already confirmed" rather than a confusing expiry message.
  if (row.status === "confirmed") return { kind: "result", result: { state: "already_confirmed" } };
  if (row.status === "revoked") return { kind: "result", result: { state: "revoked" } };
  if (!hashesMatch(row.verification_token_hash, check.tokenHash)) {
    return { kind: "result", result: { state: "superseded" } };
  }

  if (!check.ok) {
    // Signed, current link — but out of time. Record it so the student's
    // banner reflects it too.
    await supabase
      .from("parent_consents")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "pending")
      .eq("verification_token_hash", check.tokenHash);
    return { kind: "result", result: { state: "expired" } };
  }

  return { kind: "row", row, tokenHash: check.tokenHash };
}

/** Read-only check used to render the confirmation page on GET. */
export async function inspectConsentToken(token: string): Promise<TokenInspection> {
  try {
    const loaded = await loadForToken(token);
    if (loaded.kind === "result") return loaded.result;

    const { data: profile } = await createAdminClient()
      .from("profiles")
      .select("first_name")
      .eq("id", loaded.row.user_id)
      .maybeSingle();

    return {
      state: "ready",
      studentFirstName: (profile?.first_name as string | null | undefined)?.trim() || null,
      parentEmailMasked: loaded.row.parent_email ? maskEmail(loaded.row.parent_email) : null,
    };
  } catch (err) {
    console.error("[BoardEdge] parent consent inspect threw:", err);
    return { state: "unavailable" };
  }
}

export type ConfirmResult =
  | { state: "confirmed" }
  | Exclude<TokenInspection, { state: "ready" }>;

/**
 * Mark consent confirmed. Re-verifies everything — the GET page's check is
 * not trusted — and the update is conditional on the row still being pending
 * with this exact token hash, so a double-click or a raced resend can't
 * confirm against a retired link.
 */
export async function confirmParentConsent(token: string): Promise<ConfirmResult> {
  try {
    const loaded = await loadForToken(token);
    if (loaded.kind === "result") {
      return loaded.result.state === "ready" ? { state: "unavailable" } : loaded.result;
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await createAdminClient()
      .from("parent_consents")
      .update({
        status: "confirmed",
        confirmed_at: nowIso,
        updated_at: nowIso,
        // Single-use: the link stops working the moment it has worked once.
        verification_token_hash: null,
        token_expires_at: null,
      })
      .eq("id", loaded.row.id)
      .eq("status", "pending")
      .eq("verification_token_hash", loaded.tokenHash)
      .gt("token_expires_at", nowIso)
      .select("id");

    if (error) {
      console.error("[BoardEdge] parent consent confirm failed:", error.message);
      return { state: "unavailable" };
    }
    if (!data || data.length === 0) {
      // Lost a race — re-read to explain what happened.
      const again = await loadForToken(token);
      if (again.kind === "result" && again.result.state !== "ready") return again.result;
      return { state: "unavailable" };
    }
    return { state: "confirmed" };
  } catch (err) {
    console.error("[BoardEdge] parent consent confirm threw:", err);
    return { state: "unavailable" };
  }
}
