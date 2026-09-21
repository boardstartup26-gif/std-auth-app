// src/lib/legal/policies.ts
//
// Version and date for each legal document. The prose lives in
// content/legal/*.md; the metadata lives here, in code, on purpose:
//
//   * The signup action and the OAuth callback stamp policy_consents rows with
//     these versions. A server action reading a markdown file at runtime would
//     depend on output-file tracing picking that file up on every host, whereas
//     an import is always bundled.
//   * The version recorded against a user must be decided by the server, never
//     posted by the browser — so the client form carries no version at all.
//
// Bump `version` (and `lastUpdated`) whenever the meaning of a document
// changes. Typo fixes don't need a bump; anything a user would have to agree
// to again does.

export type PolicyKey = "privacy" | "terms";

export interface PolicyMeta {
  key: PolicyKey;
  title: string;
  description: string;
  href: `/${string}`;
  /** Markdown file under content/legal/. */
  file: string;
  version: string;
  /** ISO date (YYYY-MM-DD). */
  lastUpdated: string;
}

export const POLICIES: Record<PolicyKey, PolicyMeta> = {
  privacy: {
    key: "privacy",
    title: "Privacy Policy",
    description:
      "What personal data BoardEdge collects, why, who processes it, how long it is kept, and the rights you and your parent or guardian have over it.",
    href: "/privacy",
    file: "privacy.md",
    version: "1.3",
    lastUpdated: "2026-09-22",
  },
  terms: {
    key: "terms",
    title: "Terms & Conditions",
    description:
      "The terms for using BoardEdge — accounts, fair use of evaluation credits, AI-generated feedback, and your content.",
    href: "/terms",
    file: "terms.md",
    version: "1.1",
    lastUpdated: "2026-09-17",
  },
};

/** "16 September 2026" — the long form reads unambiguously in India and abroad. */
export function formatPolicyDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
