// src/lib/safe-next.ts
//
// Post-login return path. A reminder email links straight to a question
// (/evaluate?subject=…&q=…); a student whose session has expired goes through
// /login first, and without this they would land on /dashboard and lose the
// question the email was about.
//
// `next` arrives from a URL, so it is attacker-controllable. Only a same-site
// path is accepted — never an absolute URL, a protocol-relative "//host", or a
// backslash variant browsers normalise into one — or the login form becomes an
// open redirect that sends a student from a real BoardEdge login to anywhere.

/** Cookie that carries `next` across the Google OAuth round trip. */
export const NEXT_COOKIE = "be_next";

const MAX_LENGTH = 512;

export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || value.length > MAX_LENGTH) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  // Control characters and any backslash: browsers read "\" as "/" in URLs.
  if (/[\u0000-\u001f\\]/.test(value)) return null;

  // Belt and braces: whatever the string looks like, it must resolve to the
  // same origin it started from.
  try {
    const base = "http://boardedge.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return null;
    // Sending someone back to the screen they just left is a loop, not a
    // destination.
    if (url.pathname === "/login" || url.pathname === "/signup") return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
