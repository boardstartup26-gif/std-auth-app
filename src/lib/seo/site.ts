// src/lib/seo/site.ts
//
// The facts every SEO surface (metadata, robots, sitemap, JSON-LD, llms.txt)
// agrees on. One place, so a canonical URL in a <link> tag can never disagree
// with the one in the sitemap or the structured data.
//
// The canonical origin is a constant, deliberately not getSiteUrl(): that
// helper follows NEXT_PUBLIC_SITE_URL, which has been set to a *.vercel.app
// host before. An email link pointing there still works; a canonical tag
// pointing there tells Google the real site is the duplicate.

export const SITE = {
  name: "BoardEdge",
  origin: "https://www.boardedge.co.in",
  // ≤160 chars: the default search snippet and og:description.
  description:
    "Write answers to real ICSE Class 10 past-paper questions and get them marked against the official CISCE marking scheme, point by point, in seconds.",
  tagline: "The AI examiner that knows ICSE inside out",
  locale: "en_IN",
  email: "contact.boardedge@gmail.com",
  logoPath: "/logo-icon.png",
  sameAs: ["https://www.instagram.com/boardedge.icse/"],
} as const;

/** Absolute URL on the canonical origin for a site-relative path. */
export function absoluteUrl(path = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return clean === "/" ? SITE.origin : `${SITE.origin}${clean}`;
}

/**
 * Whether this deployment should be indexed at all. Vercel preview builds
 * (every branch push) serve a full copy of the site on a *.vercel.app URL;
 * left indexable, they compete with production. Outside Vercel (local builds)
 * this is true so production output can be tested as-is.
 */
export function isIndexableDeployment(): boolean {
  const env = process.env.VERCEL_ENV;
  return env ? env === "production" : true;
}
