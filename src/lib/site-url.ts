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
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  return null;
}
