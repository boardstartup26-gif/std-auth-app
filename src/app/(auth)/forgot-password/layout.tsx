// Metadata only: the page itself is a client component and can't export it.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: true },
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
