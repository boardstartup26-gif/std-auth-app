// src/app/_components/LegalPage.tsx
//
// Shared layout for /privacy and /terms. The prose comes from
// content/legal/*.md; everything here is chrome — so editing the policy text
// never means touching this file, and restyling never means touching the text.
//
// A server component with no data fetching: the markdown is read at build time
// and both pages prerender as static HTML. Colours are token classes only, so
// the page inverts with `.dark` like the rest of the app.

import Link from "next/link";
import { numericFigures, sectionLabel } from "@/lib/ui";
import { PublicShell } from "@/app/_components/PublicShell";
import { LegalMarkdown, loadLegalDoc } from "@/lib/legal/markdown";
import { POLICIES, formatPolicyDate, type PolicyKey } from "@/lib/legal/policies";

export function LegalPage({ policy }: { policy: PolicyKey }) {
  const meta = POLICIES[policy];
  const other = POLICIES[policy === "privacy" ? "terms" : "privacy"];
  const doc = loadLegalDoc(meta.file);

  return (
    <PublicShell>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-12 sm:pt-16">
        {/* ─── Masthead ──────────────────────────────────────────────────── */}
        <div className="border-b border-border pb-8">
          <p className={sectionLabel}>Legal</p>
          <h1 className="display-section mt-3 text-balance">{meta.title}</h1>
          <dl className={`mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted-foreground ${numericFigures}`}>
            <div className="flex gap-2">
              <dt>Last updated</dt>
              <dd className="font-medium text-foreground">
                <time dateTime={meta.lastUpdated}>{formatPolicyDate(meta.lastUpdated)}</time>
              </dd>
            </div>
            <div className="flex gap-2">
              <dt>Version</dt>
              <dd className="font-medium text-foreground">{meta.version}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-10 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16">
          {/* ─── Contents ────────────────────────────────────────────────── */}
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
                <p className="mt-6 text-sm text-muted-foreground">
                  See also:{" "}
                  <Link href={other.href} className="text-foreground underline underline-offset-2">
                    {other.title}
                  </Link>
                </p>
              </div>
            </nav>
          ) : null}

          {/* ─── Body ────────────────────────────────────────────────────── */}
          <article className="max-w-[var(--measure)] text-[17px] leading-[1.7] text-foreground/90">
            <LegalMarkdown doc={doc} />
          </article>
        </div>
      </main>
    </PublicShell>
  );
}
