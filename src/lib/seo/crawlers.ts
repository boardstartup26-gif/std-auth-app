// src/lib/seo/crawlers.ts
//
// Crawler policy: which paths are private, and which bots may read the rest.
// Consumed by src/app/robots.ts and by the X-Robots-Tag headers in
// next.config.ts, so the two can't drift.
//
// robots.txt is advice, not access control. Every path below is already
// protected by middleware (session redirect), a signed token, or both; listing
// it here only keeps well-behaved crawlers from wasting requests on login
// redirects and token links.
//
// "/admin" is deliberately absent, here and in the headers. It answers 404 to
// non-admins so a prober can't tell it from a typo (see src/middleware.ts);
// naming it in a public robots.txt, or giving it a header no other 404 has,
// would announce it. It carries its own noindex metadata for the admin who
// can see it.

export const PRIVATE_PATH_PREFIXES = [
  // Signed-in app (PROTECTED_PREFIXES in src/middleware.ts).
  "/dashboard",
  "/evaluate",
  "/history",
  "/progress",
  "/account",
  "/onboarding",
  "/notifications",
  "/practice-paper",
  "/invite",
  // Machine endpoints, OAuth/recovery callbacks, personal invite links.
  "/api/",
  "/auth/",
  "/i/",
  // Token-bearing links opened from emails.
  "/parent-confirm",
  "/parent-reports",
  "/unsubscribe",
] as const;

/**
 * AI *search* crawlers: they fetch pages to cite and link them in answers,
 * the GEO equivalent of Googlebot. Allowed on exactly what `*` is allowed.
 * They would follow the `*` group anyway; naming them makes the decision
 * explicit and keeps it true if `*` is ever tightened.
 */
export const AI_SEARCH_CRAWLERS = ["OAI-SearchBot", "ChatGPT-User"] as const;

/**
 * GPTBot collects data to train OpenAI's models. Unrelated to whether
 * BoardEdge appears in ChatGPT search, which is OAI-SearchBot above.
 *
 * POLICY DECISION, owned by the founder: "disallow", confirmed 2026-11-20.
 * Switch to "allow-public" to let it read the same public pages as everyone
 * else (private paths stay blocked either way).
 */
export const GPTBOT_POLICY: "disallow" | "allow-public" = "disallow";
