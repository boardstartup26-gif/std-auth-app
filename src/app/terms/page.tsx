// app/terms/page.tsx
//
// Public, static. The text lives in content/legal/terms.md and the version
// and date in src/lib/legal/policies.ts. Middleware lists this path in
// PUBLIC_PATHS so it can never be caught by an auth redirect.

import type { Metadata } from "next";
import { LegalPage } from "@/app/_components/LegalPage";
import { POLICIES } from "@/lib/legal/policies";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: POLICIES.terms.title,
  description: POLICIES.terms.description,
  path: POLICIES.terms.href,
});

export default function TermsPage() {
  return <LegalPage policy="terms" />;
}
