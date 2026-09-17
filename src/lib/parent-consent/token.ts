// src/lib/parent-consent/token.ts
//
// Signed, expiring confirmation tokens for parent consent links.
//
// Format:  <consent row id>.<expiry, unix seconds>.<nonce>.<signature>
//
// Two independent checks protect a confirmation:
//
//   1. The HMAC signature (PARENT_CONSENT_TOKEN_SECRET) — rejects forged or
//      tampered tokens, including a doctored expiry, without a database read.
//   2. The SHA-256 of the whole token must equal the hash stored on the row —
//      so a resend (which stores a new hash) retires every older link, and a
//      database dump alone can't produce a valid link.
//
// Server-only: this module reads the signing secret.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

const SIGNING_CONTEXT = "boardedge-parent-consent-v1";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getSecret(): string {
  const secret = process.env.PARENT_CONSENT_TOKEN_SECRET ?? "";
  if (secret.length >= 32) return secret;
  if (process.env.NODE_ENV !== "production") {
    // Local development only. Production refuses to sign without a real secret
    // — a guessable key would let anyone mint a confirmation link.
    return "dev-only-parent-consent-secret-do-not-use-in-production";
  }
  throw new Error("PARENT_CONSENT_TOKEN_SECRET is missing or shorter than 32 characters.");
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret())
    .update(`${SIGNING_CONTEXT}.${payload}`)
    .digest("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createConsentToken(consentId: string, now = Date.now()) {
  const expiresAt = new Date(now + TOKEN_TTL_MS);
  const exp = Math.floor(expiresAt.getTime() / 1000);
  const nonce = randomBytes(18).toString("base64url");
  const payload = `${consentId}.${exp}.${nonce}`;
  const token = `${payload}.${sign(payload)}`;
  return { token, tokenHash: hashToken(token), expiresAt };
}

export type TokenCheck =
  | { ok: true; consentId: string; expiresAt: Date; tokenHash: string }
  | { ok: false; reason: "malformed" | "bad_signature" }
  | { ok: false; reason: "expired"; consentId: string; tokenHash: string };

/**
 * Structural + cryptographic check. Does not touch the database; the caller
 * must still match `tokenHash` against the row before trusting it.
 */
export function verifyConsentToken(token: string, now = Date.now()): TokenCheck {
  if (typeof token !== "string" || token.length > 256) return { ok: false, reason: "malformed" };

  const parts = token.split(".");
  if (parts.length !== 4) return { ok: false, reason: "malformed" };
  const [consentId, expRaw, nonce, signature] = parts;
  if (!UUID_RE.test(consentId) || !/^\d{1,12}$/.test(expRaw) || !nonce || !signature) {
    return { ok: false, reason: "malformed" };
  }

  // Signature before expiry: an attacker learns nothing about timing from a
  // forged token.
  const expected = Buffer.from(sign(`${consentId}.${expRaw}.${nonce}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "bad_signature" };
  }

  const tokenHash = hashToken(token);
  const expiresAt = new Date(Number(expRaw) * 1000);
  if (expiresAt.getTime() <= now) return { ok: false, reason: "expired", consentId, tokenHash };

  return { ok: true, consentId, expiresAt, tokenHash };
}

/** Constant-time comparison of two hex hashes. */
export function hashesMatch(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
