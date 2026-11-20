// /robots.txt — generated from src/lib/seo/crawlers.ts.
//
// A crawler obeys only the most specific group naming it, and ignores `*`
// once one does. So every named group restates the private paths: a bare
// "User-agent: OAI-SearchBot / Allow: /" would quietly open everything the
// `*` group closes.

import type { MetadataRoute } from "next";
import { absoluteUrl, isIndexableDeployment } from "@/lib/seo/site";
import {
  AI_SEARCH_CRAWLERS,
  GPTBOT_POLICY,
  PRIVATE_PATH_PREFIXES,
} from "@/lib/seo/crawlers";

export default function robots(): MetadataRoute.Robots {
  // Preview deployments: nothing is crawlable, and no sitemap is advertised.
  if (!isIndexableDeployment()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  const disallow = [...PRIVATE_PATH_PREFIXES];

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      { userAgent: [...AI_SEARCH_CRAWLERS], allow: "/", disallow },
      GPTBOT_POLICY === "allow-public"
        ? { userAgent: "GPTBot", allow: "/", disallow }
        : { userAgent: "GPTBot", disallow: "/" },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
