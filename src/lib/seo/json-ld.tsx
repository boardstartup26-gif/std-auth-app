// src/lib/seo/json-ld.tsx
//
// schema.org structured data. Rendered as a plain <script type="application/
// ld+json"> in the page (the Next 16 recommendation, see
// node_modules/next/dist/docs/01-app/02-guides/json-ld.md), never next/script:
// it is data, not code.
//
// Rule for everything built here: describe only what the page visibly says.
// FAQ entries must be the same questions and answers rendered on the page,
// and nothing claims ratings, reviews or prices that aren't real. Structured
// data that disagrees with the page is a spam signal, and for answer engines
// it is a way of putting words in BoardEdge's mouth.

import { SITE, absoluteUrl } from "@/lib/seo/site";

type JsonLdNode = Record<string, unknown>;

// Stable @ids so nodes on different pages refer to the same entity.
export const ORG_ID = `${SITE.origin}/#organization`;
export const WEBSITE_ID = `${SITE.origin}/#website`;
export const APP_ID = `${SITE.origin}/#app`;

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * `<` is escaped so a string containing "</script>" can't close the tag early.
 * Every value here is authored in this repo, never user input, but the escape
 * costs nothing and keeps that true if it ever stops being the case.
 */
export function JsonLd({ data }: { data: JsonLdNode | JsonLdNode[] }) {
  const payload = Array.isArray(data)
    ? { "@context": "https://schema.org", "@graph": data }
    : { "@context": "https://schema.org", ...data };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload).replace(/</g, "\\u003c") }}
    />
  );
}

// ─── Entities ────────────────────────────────────────────────────────────────

export function organizationNode(): JsonLdNode {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE.name,
    url: SITE.origin,
    logo: { "@type": "ImageObject", url: absoluteUrl(SITE.logoPath) },
    email: SITE.email,
    sameAs: [...SITE.sameAs],
  };
}

export function websiteNode(): JsonLdNode {
  // No SearchAction: the site has no public search to point it at.
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE.name,
    url: SITE.origin,
    description: SITE.description,
    inLanguage: "en-IN",
    publisher: { "@id": ORG_ID },
  };
}

/**
 * The product itself. The offer is the free tier the landing page promises
 * ("No payment required"); add paid offers here only once they are live.
 */
export function webApplicationNode(subjects: readonly string[]): JsonLdNode {
  return {
    "@type": "WebApplication",
    "@id": APP_ID,
    name: SITE.name,
    url: SITE.origin,
    description: SITE.description,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web browser",
    inLanguage: "en-IN",
    audience: {
      "@type": "EducationalAudience",
      educationalRole: "student",
      audienceType: "ICSE Class 10 students",
    },
    about: subjects.map((name) => ({ "@type": "Thing", name: `ICSE Class 10 ${name}` })),
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR", category: "Free tier" },
    publisher: { "@id": ORG_ID },
  };
}

// ─── Page-level nodes ────────────────────────────────────────────────────────

export interface Crumb {
  name: string;
  path: string;
}

export function breadcrumbNode(crumbs: Crumb[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

export function faqNode(items: readonly { question: string; answer: string }[]): JsonLdNode {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export function webPageNode(input: {
  path: string;
  name: string;
  description: string;
  type?: "WebPage" | "CollectionPage";
  about?: string;
  dateModified?: string;
}): JsonLdNode {
  return {
    "@type": input.type ?? "WebPage",
    "@id": `${absoluteUrl(input.path)}#webpage`,
    url: absoluteUrl(input.path),
    name: input.name,
    description: input.description,
    inLanguage: "en-IN",
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORG_ID },
    ...(input.about ? { about: { "@type": "Thing", name: input.about } } : {}),
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
  };
}

export function itemListNode(items: { name: string; path: string }[]): JsonLdNode {
  return {
    "@type": "ItemList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  };
}

export function articleNode(input: {
  path: string;
  headline: string;
  description: string;
  datePublished: string;
  dateModified: string;
}): JsonLdNode {
  return {
    "@type": "Article",
    "@id": `${absoluteUrl(input.path)}#article`,
    headline: input.headline,
    description: input.description,
    url: absoluteUrl(input.path),
    mainEntityOfPage: absoluteUrl(input.path),
    image: absoluteUrl("/opengraph-image"),
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    inLanguage: "en-IN",
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    isPartOf: { "@id": WEBSITE_ID },
  };
}
