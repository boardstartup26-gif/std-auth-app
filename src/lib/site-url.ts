// src/lib/site-url.ts
//
// The canonical public origin BoardEdge is served from. Shared by anything
// that builds an absolute link a student or parent might click from outside
// the app — a parent-consent email, a welcome email, anything similar in the
// future. Never derived from a request's Host header: a caller who could
// steer that would be able to point a generated link at a domain they
// control, which matters most for the consent link but is worth the same
// discipline everywhere links are built this way.

export function getSiteUrl(): string | null {
  let configured = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "").trim();
  if (configured) {
    // A bare domain (no scheme) is a real mistake that has already shipped
    // once — Vercel's env var UI doesn't validate this, and a value like
    // "boardedge.vercel.app" passes every check here except `new URL()`,
    // which only gets called deep inside a template builder and throws
    // there instead. Self-heal rather than let that happen again, but log
    // it so a genuine misconfiguration is still visible.
    if (!/^https?:\/\//i.test(configured)) {
      console.warn(
        `[BoardEdge] NEXT_PUBLIC_SITE_URL/SITE_URL ("${configured}") has no scheme — assuming https://. Fix the env var to remove this warning.`,
      );
      configured = `https://${configured}`;
    }
    return configured.replace(/\/+$/, "");
  }
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  return null;
}
