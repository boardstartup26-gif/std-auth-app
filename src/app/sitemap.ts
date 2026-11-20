// /sitemap.xml — every public, indexable page, and nothing else.
//
// Not listed on purpose: /login and /signup (noindex utility pages), every
// signed-in route, token links, and /admin. lastModified comes from each
// page's own content date, not the build time, so the sitemap only says a
// page changed when it did.

import type { MetadataRoute } from "next";
import { absoluteUrl, isIndexableDeployment } from "@/lib/seo/site";
import { SUBJECT_HUB_PATH, SUBJECT_PAGES, subjectPath } from "@/lib/seo/content/subjects";
import { GUIDES, GUIDES_HUB_PATH, guidePath } from "@/lib/seo/content/guides";
import { POLICIES } from "@/lib/legal/policies";

// Bump when the landing page's copy changes meaningfully.
const HOME_UPDATED = "2026-11-20";

const latest = (dates: string[]) => dates.reduce((a, b) => (a > b ? a : b));

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isIndexableDeployment()) return [];

  const subjectsUpdated = latest(SUBJECT_PAGES.map((s) => s.updated));
  const guidesUpdated = latest(GUIDES.map((g) => g.updated));

  return [
    { url: absoluteUrl("/"), lastModified: HOME_UPDATED, changeFrequency: "weekly", priority: 1 },
    {
      url: absoluteUrl(SUBJECT_HUB_PATH),
      lastModified: subjectsUpdated,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    ...SUBJECT_PAGES.map((s) => ({
      url: absoluteUrl(subjectPath(s.slug)),
      lastModified: s.updated,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    {
      url: absoluteUrl(GUIDES_HUB_PATH),
      lastModified: guidesUpdated,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...GUIDES.map((g) => ({
      url: absoluteUrl(guidePath(g.slug)),
      lastModified: g.updated,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...Object.values(POLICIES).map((p) => ({
      url: absoluteUrl(p.href),
      lastModified: p.lastUpdated,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
}
