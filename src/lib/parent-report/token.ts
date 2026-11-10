// src/lib/parent-report/token.ts
//
// Signed links for the parent's own controls: "turn on weekly reports" (in
// the invite email) and "stop weekly reports" (in every report). They work
// without a login — the parent has no BoardEdge account — so the link is its
// own proof: an HMAC over the purpose, the student id and the parent address
// it was sent to.
//
// Binding the address means a link stops working the moment the student
// changes the parent email on file: an old invite forwarded or left in a
// shared inbox can't switch reports on for a different parent. Links don't
// expire otherwise (a stop link in a months-old report must still work).
//
// Signed with PARENT_CONSENT_TOKEN_SECRET under contexts no other token uses,
// so a reminder-unsubscribe or consent token can never validate here.
//
// Server-only.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type ReportTokenPurpose = "on" | "off";

const CONTEXT: Record<ReportTokenPurpose, string> = {
  on: "boardedge-parent-report-optin-v1",
  off: "boardedge-parent-report-optout-v1",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getSecret(): string {
  const secret = process.env.PARENT_CONSENT_TOKEN_SECRET ?? "";
  if (secret.length >= 32) return secret;
  if (process.env.NODE_ENV !== "production") {
    return "dev-only-parent-consent-secret-do-not-use-in-production";
  }
  throw new Error("PARENT_CONSENT_TOKEN_SECRET is missing or shorter than 32 characters.");
}

const emailDigest = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("base64url");

function sign(purpose: ReportTokenPurpose, userId: string, parentEmail: string): string {
  return createHmac("sha256", getSecret())
    .update(`${CONTEXT[purpose]}.${userId}.${emailDigest(parentEmail)}`)
    .digest("base64url");
}

export function createReportToken(purpose: ReportTokenPurpose, userId: string, parentEmail: string): string {
  return `${userId}.${sign(purpose, userId, parentEmail)}`;
}

/** The student id in the token, unverified — for looking up the row to verify against. */
export function reportTokenUserId(token: unknown): string | null {
  if (typeof token !== "string" || token.length > 200) return null;
  const [userId, signature, ...rest] = token.split(".");
  if (rest.length || !userId || !signature || !UUID_RE.test(userId)) return null;
  return userId;
}

/** True only if the token was minted for this purpose, student and current parent address. */
export function verifyReportToken(
  purpose: ReportTokenPurpose,
  token: string,
  userId: string,
  parentEmail: string,
): boolean {
  const signature = token.split(".")[1] ?? "";
  const expected = Buffer.from(sign(purpose, userId, parentEmail));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
