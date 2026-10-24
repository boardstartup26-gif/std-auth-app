// src/lib/referrals/constants.ts
//
// Client-safe pieces of the referral program: the code format, the cookie
// name, and the link/share-text builders. No server imports here; the share
// buttons are client components.

/** No 0/O or 1/I: codes get read aloud and typed from screenshots. */
export const REFERRAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const REFERRAL_CODE_LENGTH = 6;

/**
 * Set by /i/{code}, read once at signup (email action or Google callback) and
 * then deleted. HttpOnly: nothing in the browser needs it, and the value is
 * looked up server-side before it means anything.
 */
export const REF_COOKIE = "be_ref";
export const REF_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Set by a challenge link (/i/{code}?q=…): the /evaluate path for that
 * question. Read and cleared when onboarding completes, which every new
 * account passes through whichever way it signed up.
 */
export const CHALLENGE_COOKIE = "be_challenge";

/** Uppercases and validates. Null for anything that isn't a well-formed code. */
export function normaliseReferralCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return /^[A-HJ-NP-Z2-9]{6}$/.test(code) ? code : null;
}

/** Where a share came from. Recorded on REFERRAL_SHARE_CLICKED and in utm_campaign. */
export type ShareSurface =
  | "invite_page"
  | "out_of_credits"
  | "result"
  | "paper_results"
  | "dashboard"
  | "checklist";

/**
 * The personal link, tagged so a WhatsApp forward (which strips the referrer)
 * still shows up as a channel. `q` turns it into a challenge link that lands
 * the friend on that question after signup.
 */
export function inviteUrl(
  siteUrl: string,
  code: string,
  { surface, questionId }: { surface: ShareSurface; questionId?: string | null },
): string {
  const params = new URLSearchParams({
    utm_source: "whatsapp",
    utm_medium: "referral",
    utm_campaign: surface,
  });
  if (questionId) params.set("q", questionId);
  return `${siteUrl}/i/${code}?${params.toString()}`;
}

export function inviteMessage(link: string, challenge?: string | null): string {
  const lead = challenge
    ? `${challenge} Try it on BoardEdge — it marks your answer like the ICSE board does.`
    : "I'm using BoardEdge for ICSE Class 10 — you write an answer to a real past board question and it marks it point by point like the examiner would.";
  return `${lead} Sign up with my link and we both get 5 extra free credits every week: ${link}`;
}
