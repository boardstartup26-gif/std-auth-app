// /icse-class-10 — hub for the subject pages. Static.

import type { Metadata } from "next";
import Link from "next/link";
import { btnPrimary, numericFigures, sectionLabel } from "@/lib/ui";
import { Breadcrumbs, PublicShell } from "@/app/_components/PublicShell";
import { buildPageMetadata } from "@/lib/seo/metadata";
import {
  JsonLd,
  breadcrumbNode,
  itemListNode,
  organizationNode,
  webPageNode,
  websiteNode,
} from "@/lib/seo/json-ld";
import {
  SUBJECT_HUB_PATH,
  SUBJECT_PAGES,
  corpusTotals,
  subjectPath,
} from "@/lib/seo/content/subjects";
import { GUIDES, guidePath } from "@/lib/seo/content/guides";

const TITLE = "ICSE Class 10 Past Papers With Official Marking Schemes";
const DESCRIPTION =
  "Practise ICSE Class 10 past-paper questions in eight subjects and get every answer marked against the official CISCE marking scheme, point by point.";

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: SUBJECT_HUB_PATH,
});

export default function SubjectHubPage() {
  const totals = corpusTotals();
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "ICSE Class 10", path: SUBJECT_HUB_PATH },
  ];

  return (
    <PublicShell>
      <JsonLd
        data={[
          organizationNode(),
          websiteNode(),
          webPageNode({
            path: SUBJECT_HUB_PATH,
            name: TITLE,
            description: DESCRIPTION,
            type: "CollectionPage",
            about: "ICSE Class 10 board exam",
          }),
          breadcrumbNode(crumbs),
          itemListNode(
            SUBJECT_PAGES.map((s) => ({ name: `ICSE Class 10 ${s.name}`, path: subjectPath(s.slug) })),
          ),
        ]}
      />

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-10 sm:pt-14">
        <div className="border-b border-border pb-10">
          <Breadcrumbs items={crumbs} />
          <p className={`${sectionLabel} mt-8`}>ICSE Class 10</p>
          <h1 className="display-section mt-3 max-w-[22ch] text-balance">
            ICSE Class 10 past papers, marked against the official scheme
          </h1>
          <p className="mt-6 max-w-[var(--measure)] text-lg leading-relaxed text-muted-foreground">
            <span className={numericFigures}>{totals.questions.toLocaleString("en-IN")}</span> real
            past-paper questions across {totals.subjects} subjects, from the{" "}
            {totals.years[0]}–{totals.years[totals.years.length - 1]} board exams. Every question
            carries its official CISCE marking scheme, and every answer you write is marked against
            it — the points it lists, and nothing else.
          </p>
        </div>

        <section aria-labelledby="subjects" className="mt-12">
          <h2 id="subjects" className="font-display text-2xl text-foreground sm:text-[1.75rem]">
            Choose a subject
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SUBJECT_PAGES.map((s) => (
              <li key={s.slug}>
                <Link
                  href={subjectPath(s.slug)}
                  className="block h-full rounded-2xl border border-border bg-card p-6 transition-colors hover:border-accent/40"
                >
                  <p className={sectionLabel}>{s.paper}</p>
                  <h3 className="mt-2 font-display text-xl text-foreground">{s.name}</h3>
                  <p className={`mt-3 text-sm text-muted-foreground ${numericFigures}`}>
                    {s.coverage.questions} questions · {s.coverage.years.length} years
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    Top mark leak: {s.markLeaks[0].title.toLowerCase()}.
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="guides" className="mt-16 border-t border-border pt-12">
          <h2 id="guides" className="font-display text-2xl text-foreground sm:text-[1.75rem]">
            Guides
          </h2>
          <ul className="mt-6 space-y-4">
            {GUIDES.map((g) => (
              <li key={g.slug} className="max-w-[var(--measure)]">
                <Link
                  href={guidePath(g.slug)}
                  className="font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                >
                  {g.title}
                </Link>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{g.description}</p>
              </li>
            ))}
          </ul>
          <div className="mt-10">
            <Link href="/signup" className={`${btnPrimary} h-12 px-6 text-sm`}>
              Start marking free →
            </Link>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
