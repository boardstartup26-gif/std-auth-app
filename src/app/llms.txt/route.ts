// /llms.txt — a plain-text map of the public site for AI assistants, in the
// llmstxt.org format. An emerging convention, not a standard any crawler is
// bound by; cheap to serve, and it gives answer engines BoardEdge's own
// summary instead of one inferred from the landing page's animation markup.
//
// Built from the same registries as the sitemap, so it lists exactly the
// public pages and nothing private.

import { SITE, absoluteUrl } from "@/lib/seo/site";
import { SUBJECT_HUB_PATH, SUBJECT_PAGES, corpusTotals, subjectPath } from "@/lib/seo/content/subjects";
import { GUIDES, GUIDES_HUB_PATH, guidePath } from "@/lib/seo/content/guides";
import { POLICIES } from "@/lib/legal/policies";

export const dynamic = "force-static";

export function GET() {
  const totals = corpusTotals();
  const lines = [
    `# ${SITE.name}`,
    "",
    `> ${SITE.description}`,
    "",
    `BoardEdge is an independent learning platform for ICSE Class 10 students in India. It holds ${totals.questions.toLocaleString("en-IN")} real past-paper questions from the ${totals.years[0]}–${totals.years[totals.years.length - 1]} board exams across ${totals.subjects} subjects, each stored with its official CISCE marking scheme. A student writes (or photographs) an answer; written answers are marked only against that question's scheme, and objective questions against the answer key. Feedback lists marks awarded, scheme points hit and missed, and what to change. It does not teach content or generate questions. BoardEdge is not affiliated with CISCE.`,
    "",
    "## Subjects",
    "",
    `- [ICSE Class 10 subjects](${absoluteUrl(SUBJECT_HUB_PATH)}): overview of all subjects`,
    ...SUBJECT_PAGES.map(
      (s) =>
        `- [ICSE Class 10 ${s.name}](${absoluteUrl(subjectPath(s.slug))}): ${s.coverage.questions} questions, years ${s.coverage.years.join(", ")}; where answers lose marks`,
    ),
    "",
    "## Guides",
    "",
    `- [All guides](${absoluteUrl(GUIDES_HUB_PATH)})`,
    ...GUIDES.map((g) => `- [${g.title}](${absoluteUrl(guidePath(g.slug))}): ${g.description}`),
    "",
    "## Optional",
    "",
    ...Object.values(POLICIES).map((p) => `- [${p.title}](${absoluteUrl(p.href)})`),
    `- Contact: ${SITE.email}`,
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
