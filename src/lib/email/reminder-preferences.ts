// src/lib/email/reminder-preferences.ts
//
// The student's reminder-email opt-out, and the signed links that flip it.
//
// Every reminder email carries an unsubscribe link that must work without a
// login — a student who wants the emails to stop should not have to remember
// a password first. So the link carries its own proof: an HMAC over the user
// id. It does not expire (an unsubscribe link from a month-old email must
// still work) and it can only ever turn reminders *off* for that one account,
// so a leaked link is worth nothing to anyone else.
//
// Signed with PARENT_CONSENT_TOKEN_SECRET under a different context string, so
// no new secret has to be provisioned and a token from one purpose can never
// validate as the other.
//
// Server-only: reads the signing secret and uses the service-role client.

import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

const SIGNING_CONTEXT = "boardedge-email-reminders-unsubscribe-v1";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getSecret(): string {
  const secret = process.env.PARENT_CONSENT_TOKEN_SECRET ?? "";
  if (secret.length >= 32) return secret;
  if (process.env.NODE_ENV !== "production") {
    return "dev-only-parent-consent-secret-do-not-use-in-production";
  }
  throw new Error("PARENT_CONSENT_TOKEN_SECRET is missing or shorter than 32 characters.");
}

function sign(userId: string): string {
  return createHmac("sha256", getSecret()).update(`${SIGNING_CONTEXT}.${userId}`).digest("base64url");
}

export function createUnsubscribeToken(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

/** Returns the user id the token was minted for, or null. */
export function verifyUnsubscribeToken(token: unknown): string | null {
  if (typeof token !== "string" || token.length > 200) return null;
  const [userId, signature, ...rest] = token.split(".");
  if (rest.length || !userId || !signature || !UUID_RE.test(userId)) return null;
  const expected = Buffer.from(sign(userId));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return userId;
}

/** Absolute unsubscribe URLs for one student, or null without a site URL. */
export function unsubscribeLinks(userId: string): { page: string; oneClick: string } | null {
  const siteUrl = getSiteUrl();
  if (!siteUrl) return null;
  const t = encodeURIComponent(createUnsubscribeToken(userId));
  return {
    page: `${siteUrl}/unsubscribe?t=${t}`,
    // RFC 8058 one-click target. Mail clients POST here directly from their
    // own "Unsubscribe" button.
    oneClick: `${siteUrl}/api/email/unsubscribe?t=${t}`,
  };
}

export async function readEmailReminders(userId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("email_reminders")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[BoardEdge] reminder preference read failed:", error.message);
    return true;
  }
  return (data?.email_reminders as boolean | undefined) ?? true;
}

export async function setEmailReminders(userId: string, enabled: boolean): Promise<boolean> {
  const { error } = await createAdminClient()
    .from("profiles")
    .update({ email_reminders: enabled })
    .eq("id", userId);
  if (error) {
    console.error("[BoardEdge] reminder preference write failed:", error.message);
    return false;
  }
  return true;
}
