// /guides/[slug] — one public guide. Static; unknown slugs are a real 404.
// Prose: content/guides/*.md. Metadata: src/lib/seo/content/guides.ts.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { btnPrimary, numericFigures, sectionLabel } from "@/lib/ui";
import { Breadcrumbs, PublicShell } from "@/app/_components/PublicShell";
import { LegalMarkdown, loadContentDoc } from "@/lib/legal/markdown";
import { formatPolicyDate } from "@/lib/legal/policies";
import { buildPageMetadata } from "@/lib/seo/metadata";
import {
  JsonLd,
  articleNode,
  breadcrumbNode,
  organizationNode,
  websiteNode,
} from "@/lib/seo/json-ld";
import { GUIDES, GUIDES_HUB_PATH, getGuide, guidePath } from "@/lib/seo/content/guides";
import { getSubjectPage, subjectPath } from "@/lib/seo/content/subjects";

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const guide = getGuide((await params).slug);
  if (!guide) return {};
  return buildPageMetadata({
    title: guide.title,
    description: guide.description,
    path: guidePath(guide.slug),
    type: "article",
    publishedTime: guide.published,
    modifiedTime: guide.updated,
  });
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const guide = getGuide((await params).slug);
  if (!guide) notFound();

  const doc = loadContentDoc("guides", guide.file);
  const path = guidePath(guide.slug);
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Guides", path: GUIDES_HUB_PATH },
    { name: guide.title, path },
  ];
  const subjects = guide.relatedSubjects
    .map((slug) => getSubjectPage(slug))
    .filter((s): s is NonNullable<typeof s> => !!s);
  const otherGuides = GUIDES.filter((g) => g.slug !== guide.slug);

  return (
    <PublicShell>
      <JsonLd
        data={[
          organizationNode(),
          websiteNode(),
          articleNode({
            path,
            headline: guide.title,
            description: guide.description,
            datePublished: guide.published,
            dateModified: guide.updated,
          }),
          breadcrumbNode(crumbs),
        ]}
      />

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-10 sm:pt-14">
        <div className="border-b border-border pb-8">
          <Breadcrumbs items={crumbs} />
          <p className={`${sectionLabel} mt-8`}>Guide</p>
          <h1 className="display-section mt-3 max-w-[24ch] text-balance">{guide.title}</h1>
          <p className={`mt-6 text-sm text-muted-foreground ${numericFigures}`}>
            By BoardEdge · Updated{" "}
            <time dateTime={guide.updated}>{formatPolicyDate(guide.updated)}</time>
          </p>
        </div>

        <div className="mt-10 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16">
          {doc.toc.length > 0 ? (
            <nav aria-label="On this page" className="mb-10 lg:mb-0">
              <div className="lg:sticky lg:top-24">
                <p className={sectionLabel}>On this page</p>
                <ol className="mt-3 space-y-2 border-l border-border text-sm">
                  {doc.toc.map((entry) => (
                    <li key={entry.id}>
                      <a
                        href={`#${entry.id}`}
                        className="-ml-px block border-l border-transparent pl-3 text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                      >
                        {entry.text}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            </nav>
          ) : null}

          <div className="min-w-0">
            <article className="max-w-[var(--measure)] text-[17px] leading-[1.7] text-foreground/90">
              <LegalMarkdown doc={doc} />
            </article>

            <aside className="mt-14 max-w-[var(--measure)] rounded-2xl border border-border bg-card p-6">
              <p className="font-display text-xl text-foreground">
                See exactly which points your answer missed.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Write an answer to a real ICSE past-paper question and get it marked against the
                official scheme in seconds.
              </p>
              <Link href="/signup" className={`${btnPrimary} mt-5 h-11 px-5 text-sm`}>
                Start marking free →
              </Link>
            </aside>

            {subjects.length || otherGuides.length ? (
              <div className="mt-12 max-w-[var(--measure)] border-t border-border pt-8">
                {subjects.length ? (
                  <>
                    <p className={sectionLabel}>Subject pages</p>
                    <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                      {subjects.map((s) => (
                        <li key={s.slug}>
                          <Link
                            href={subjectPath(s.slug)}
                            className="text-sm font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-accent"
                          >
                            ICSE Class 10 {s.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {otherGuides.length ? (
                  <>
                    <p className={`${sectionLabel} mt-8`}>More guides</p>
                    <ul className="mt-3 space-y-2">
                      {otherGuides.map((g) => (
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
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </PublicShell>
  );
}
