// /guides — index of the public educational guides. Static.

import type { Metadata } from "next";
import Link from "next/link";
import { numericFigures, sectionLabel } from "@/lib/ui";
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
import { GUIDES, GUIDES_HUB_PATH, guidePath } from "@/lib/seo/content/guides";
import { formatPolicyDate } from "@/lib/legal/policies";

const TITLE = "ICSE Class 10 Exam Guides";
const DESCRIPTION =
  "Guides for ICSE Class 10 students on how answers are marked and how to practise past papers so the same marks stop slipping away.";

export const metadata: Metadata = buildPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: GUIDES_HUB_PATH,
});

export default function GuidesHubPage() {
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Guides", path: GUIDES_HUB_PATH },
  ];

  return (
    <PublicShell>
      <JsonLd
        data={[
          organizationNode(),
          websiteNode(),
          webPageNode({ path: GUIDES_HUB_PATH, name: TITLE, description: DESCRIPTION, type: "CollectionPage" }),
          breadcrumbNode(crumbs),
          itemListNode(GUIDES.map((g) => ({ name: g.title, path: guidePath(g.slug) }))),
        ]}
      />

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-10 sm:pt-14">
        <div className="border-b border-border pb-10">
          <Breadcrumbs items={crumbs} />
          <p className={`${sectionLabel} mt-8`}>Guides</p>
          <h1 className="display-section mt-3 text-balance">{TITLE}</h1>
          <p className="mt-6 max-w-[var(--measure)] text-lg leading-relaxed text-muted-foreground">
            {DESCRIPTION}
          </p>
        </div>

        <ul className="mt-10 divide-y divide-border">
          {GUIDES.map((g) => (
            <li key={g.slug} className="py-8 first:pt-0">
              <Link href={guidePath(g.slug)} className="group block max-w-[var(--measure)]">
                <h2 className="font-display text-2xl text-foreground transition-colors group-hover:text-accent">
                  {g.title}
                </h2>
                <p className="mt-2 leading-relaxed text-muted-foreground">{g.description}</p>
                <p className={`mt-3 text-xs text-muted-foreground ${numericFigures}`}>
                  Updated <time dateTime={g.updated}>{formatPolicyDate(g.updated)}</time>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </PublicShell>
  );
}
