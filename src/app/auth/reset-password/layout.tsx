// Metadata only: the page itself is a client component and can't export it.
// Reached from a recovery email with a session in hand — never indexed.

import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo/metadata";

export const metadata: Metadata = { title: "Choose a new password", robots: NOINDEX };

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
