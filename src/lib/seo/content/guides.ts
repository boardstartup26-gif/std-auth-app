// src/lib/seo/content/guides.ts
//
// Registry for the public educational guides (/guides/[slug]). The prose lives
// in content/guides/*.md and is rendered by the same small parser as the legal
// pages; title, dates and summary live here so the sitemap, metadata and
// Article structured data read one source.
//
// Bar for adding a guide: it answers a question students actually ask, says
// something a subject page doesn't, and every claim in it is something the
// marking schemes or BoardEdge's grader rules support. Fewer, better guides —
// not a page per keyword.

export interface GuideMeta {
  slug: string;
  file: string;
  title: string;
  /** ≤160 chars: meta description, og:description, and the hub card. */
  description: string;
  published: string;
  updated: string;
  /** Subject page slugs this guide links onward to. */
  relatedSubjects: string[];
}

export const GUIDES: GuideMeta[] = [
  {
    slug: "how-icse-answers-are-marked",
    file: "how-icse-answers-are-marked.md",
    title: "How ICSE Class 10 Answers Are Marked",
    description:
      "How CISCE marking schemes award marks: points, steps, mark-bearing terms and the common ways a correct-looking ICSE answer still loses marks.",
    published: "2026-11-20",
    updated: "2026-11-20",
    relatedSubjects: ["physics", "history-civics", "biology"],
  },
  {
    slug: "how-to-practise-icse-past-papers",
    file: "how-to-practise-icse-past-papers.md",
    title: "How to Practise ICSE Past Papers So Your Marks Improve",
    description:
      "A practical method for ICSE Class 10 past-paper practice: attempt under exam conditions, check against the marking scheme, fix the missed point, reattempt.",
    published: "2026-11-20",
    updated: "2026-11-20",
    relatedSubjects: ["chemistry", "geography", "english-literature"],
  },
];

export const GUIDES_HUB_PATH = "/guides";
export const guidePath = (slug: string) => `${GUIDES_HUB_PATH}/${slug}`;

export function getGuide(slug: string): GuideMeta | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
