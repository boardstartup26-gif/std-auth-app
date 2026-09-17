// app/terms/page.tsx
//
// Public, static. The text lives in content/legal/terms.md and the version
// and date in src/lib/legal/policies.ts. Middleware lists this path in
// PUBLIC_PATHS so it can never be caught by an auth redirect.

import type { Metadata } from "next";
import { LegalPage } from "@/app/_components/LegalPage";
import { POLICIES } from "@/lib/legal/policies";

export const metadata: Metadata = {
  title: `${POLICIES.terms.title} · BoardEdge`,
  description: POLICIES.terms.description,
  alternates: { canonical: POLICIES.terms.href },
};

export default function TermsPage() {
  return <LegalPage policy="terms" />;
}
