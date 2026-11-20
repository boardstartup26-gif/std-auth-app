import type { NextConfig } from "next";
import { PRIVATE_PATH_PREFIXES } from "./src/lib/seo/crawlers";

const nextConfig: NextConfig = {
  // X-Robots-Tag on every private path: covers responses that carry no HTML
  // <meta robots> (API JSON, redirects, route handlers), and a crawler that
  // ignores robots.txt still gets told not to index. Same list as robots.txt.
  // /admin is deliberately not in it — see src/lib/seo/crawlers.ts.
  async headers() {
    return PRIVATE_PATH_PREFIXES.map((prefix) => ({
      source: `${prefix.replace(/\/$/, "")}/:path*`,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    }));
  },
};

export default nextConfig;
