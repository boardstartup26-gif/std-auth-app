// /icse-class-10/[subject] — public subject landing page.
//
// Static: generateStaticParams lists exactly the subjects in the registry and
// dynamicParams = false makes anything else a real 404, so no URL can mint a
// thin page. Content and the reasons it is true live in
// src/lib/seo/content/subjects.ts.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { btnPrimary, btnSecondary, numericFigures, sectionLabel } from "@/lib/ui";
import { Breadcrumbs, PublicShell } from "@/app/_components/PublicShell";
import { buildPageMetadata } from "@/lib/seo/metadata";
import {
  JsonLd,
  breadcrumbNode,
  faqNode,
  organizationNode,
  webPageNode,
  websiteNode,
} from "@/lib/seo/json-ld";
import {
  SUBJECT_HUB_PATH,
  SUBJECT_PAGES,
  getSubjectPage,
  subjectPath,
} from "@/lib/seo/content/subjects";
import { GUIDES, guidePath } from "@/lib/seo/content/guides";

export const dynamicParams = false;

export function generateStaticParams() {
  return SUBJECT_PAGES.map((s) => ({ subject: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subject: string }>;
}): Promise<Metadata> {
  const page = getSubjectPage((await params).subject);
  if (!page) return {};
  return buildPageMetadata({
    title: page.metaTitle,
    description: page.metaDescription,
    path: subjectPath(page.slug),
  });
}

function yearList(years: number[]): string {
  return years.length > 1
    ? `${years.slice(0, -1).join(", ")} and ${years[years.length - 1]}`
    : String(years[0] ?? "");
}

export default async function SubjectPage({
  params,
}: {
  params: Promise<{ subject: string }>;
}) {
  const page = getSubjectPage((await params).subject);
  if (!page) notFound();

  const path = subjectPath(page.slug);
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "ICSE Class 10", path: SUBJECT_HUB_PATH },
    { name: page.name, path },
  ];
  const { coverage } = page;
  const others = SUBJECT_PAGES.filter((s) => s.slug !== page.slug);
  const guides = GUIDES.filter((g) => g.relatedSubjects.includes(page.slug));
  // Not signed in → middleware sends this to /login?next=…, which returns here.
  const practiceHref = `/evaluate?subject=${encodeURIComponent(page.name)}`;

  return (
    <PublicShell>
      <JsonLd
        data={[
          organizationNode(),
          websiteNode(),
          webPageNode({
            path,
            name: page.metaTitle,
            description: page.metaDescription,
            about: `ICSE Class 10 ${page.name}`,
            dateModified: page.updated,
          }),
          breadcrumbNode(crumbs),
          faqNode(page.faqs),
        ]}
      />

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-10 sm:pt-14">
        {/* ─── Masthead ──────────────────────────────────────────────────── */}
        <div className="border-b border-border pb-10">
          <Breadcrumbs items={crumbs} />
          <p className={`${sectionLabel} mt-8`}>
            ICSE Class 10 · {page.paper}
          </p>
          <h1 className="display-section mt-3 max-w-[22ch] text-balance">
            ICSE Class 10 {page.name} past papers, marked against the official scheme
          </h1>
          <p className="mt-6 max-w-[var(--measure)] text-lg leading-relaxed text-muted-foreground">
            {page.intro}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signup" className={`${btnPrimary} h-12 px-6 text-sm`}>
              Start marking free →
            </Link>
            <Link href={practiceHref} className={`${btnSecondary} h-12 px-6 text-sm`}>
              Practise {page.name}
            </Link>
          </div>
        </div>

        {/* ─── Coverage ──────────────────────────────────────────────────── */}
        <section aria-labelledby="coverage" className="mt-14">
          <h2 id="coverage" className="font-display text-2xl text-foreground sm:text-[1.75rem]">
            What’s covered
          </h2>
          <dl className="mt-6 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-3">
            {[
              { label: "Past-paper questions", value: coverage.questions.toLocaleString("en-IN") },
              { label: "Written-answer questions", value: coverage.written.toLocaleString("en-IN") },
              { label: "Board exam years", value: String(coverage.years.length) },
            ].map((stat) => (
              <div key={stat.label} className="bg-background px-6 py-6">
                <dt className="text-sm text-muted-foreground">{stat.label}</dt>
                <dd className={`mt-1 font-display text-3xl text-foreground ${numericFigures}`}>
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 max-w-[var(--measure)] text-sm leading-relaxed text-muted-foreground">
            Questions from the {yearList(coverage.years)} ICSE Class 10 {page.name} papers. Every
            question carries its official CISCE marking scheme.
          </p>

          <h3 className="mt-10 text-lg font-semibold tracking-tight text-foreground">
            Questions by {page.slug === "english-literature" ? "text" : "chapter"}
          </h3>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[20rem] text-left text-sm">
              <thead className="bg-card">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold text-foreground">
                    {page.slug === "english-literature" ? "Text" : "Chapter"}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-foreground">
                    Questions
                  </th>
                </tr>
              </thead>
              <tbody>
                {coverage.chapters.map(([chapter, n]) => (
                  <tr key={chapter} className="border-t border-border">
                    <td className="px-4 py-2.5 text-foreground/90">{chapter}</td>
                    <td className={`px-4 py-2.5 text-right text-muted-foreground ${numericFigures}`}>
                      {n}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {coverage.chapterNote ? (
            <p className="mt-3 text-sm text-muted-foreground">…{coverage.chapterNote}.</p>
          ) : null}
        </section>

        {/* ─── Where marks are lost ──────────────────────────────────────── */}
        <section aria-labelledby="mark-leaks" className="mt-16 border-t border-border pt-12">
          <h2 id="mark-leaks" className="font-display text-2xl text-foreground sm:text-[1.75rem]">
            Where ICSE {page.name} answers lose marks
          </h2>
          <p className="mt-4 max-w-[var(--measure)] leading-relaxed text-muted-foreground">
            These are the rules BoardEdge marks {page.name} by, taken from how the official schemes
            award marks. Each one is a way a correct-sounding answer still comes back short.
          </p>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2">
            {page.markLeaks.map((leak, i) => (
              <li key={leak.title} className="rounded-2xl border border-border bg-card p-6">
                <p className={`text-xs font-bold text-accent ${numericFigures}`}>
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-2 font-semibold text-foreground">{leak.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{leak.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ─── How it works ──────────────────────────────────────────────── */}
        <section aria-labelledby="how" className="mt-16 border-t border-border pt-12">
          <h2 id="how" className="font-display text-2xl text-foreground sm:text-[1.75rem]">
            How BoardEdge marks a {page.name} answer
          </h2>
          <ol className="mt-6 max-w-[var(--measure)] list-decimal space-y-3 pl-6 leading-relaxed text-foreground/90 marker:text-muted-foreground">
            <li>Pick a real {page.name} question by year or by chapter.</li>
            <li>Write your answer as you would in the exam, or upload a photo of a handwritten one.</li>
            <li>
              Get it back in seconds, marked only against the official scheme: marks awarded, scheme
              points hit and missed, and what to change next time.
            </li>
          </ol>
        </section>

        {/* ─── FAQ ───────────────────────────────────────────────────────── */}
        <section aria-labelledby="faq" className="mt-16 border-t border-border pt-12">
          <h2 id="faq" className="font-display text-2xl text-foreground sm:text-[1.75rem]">
            {page.name} FAQs
          </h2>
          <dl className="mt-6 max-w-[var(--measure)] space-y-6">
            {page.faqs.map((faq) => (
              <div key={faq.question}>
                <dt className="font-semibold text-foreground">{faq.question}</dt>
                <dd className="mt-2 leading-relaxed text-muted-foreground">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ─── Related ───────────────────────────────────────────────────── */}
        <section aria-labelledby="related" className="mt-16 border-t border-border pt-12">
          <h2 id="related" className={sectionLabel}>
            Other ICSE Class 10 subjects
          </h2>
          <ul className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
            {others.map((s) => (
              <li key={s.slug}>
                <Link
                  href={subjectPath(s.slug)}
                  className="text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-accent"
                >
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
          {guides.length ? (
            <>
              <p className={`${sectionLabel} mt-10`}>Guides</p>
              <ul className="mt-4 space-y-2">
                {guides.map((g) => (
                  <li key={g.slug}>
                    <Link
                      href={guidePath(g.slug)}
                      className="text-sm font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                    >
                      {g.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      </main>
    </PublicShell>
  );
}
