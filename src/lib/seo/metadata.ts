// src/lib/seo/metadata.ts
//
// Page-level Metadata builder. Next merges metadata shallowly: a page that
// sets `openGraph` replaces the root layout's whole openGraph object rather
// than extending it. Building every page's metadata here means each one gets
// the complete set (canonical, og:url, og:site_name, twitter card) instead of
// whatever subset it remembered to restate.

import type { Metadata } from "next";
import { SITE, absoluteUrl } from "@/lib/seo/site";

interface PageMetadataInput {
  /** Without the brand; the root layout's template appends " · BoardEdge". */
  title: string;
  description: string;
  /** Site-relative canonical path, e.g. "/icse-class-10/physics". */
  path: string;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  /** Use the title as-is, without the brand template (the home page). */
  absoluteTitle?: boolean;
}

// The generated card from src/app/opengraph-image.tsx. Restated explicitly:
// a page-level `openGraph` object replaces the inherited one, image included,
// so without this every page except "/" shipped with no og:image.
const SOCIAL_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "BoardEdge — ICSE Class 10 answers marked against the official marking scheme",
};

export function buildPageMetadata({
  title,
  description,
  path,
  type = "website",
  publishedTime,
  modifiedTime,
  absoluteTitle = false,
}: PageMetadataInput): Metadata {
  const socialTitle = absoluteTitle ? title : `${title} · ${SITE.name}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type,
      url: absoluteUrl(path),
      siteName: SITE.name,
      locale: SITE.locale,
      title: socialTitle,
      description,
      images: [SOCIAL_IMAGE],
      ...(type === "article" ? { publishedTime, modifiedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [SOCIAL_IMAGE.url],
    },
  };
}

/** For pages that must never appear in results (auth, signed-in, tokens). */
export const NOINDEX: Metadata["robots"] = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: { index: false, follow: false },
};
