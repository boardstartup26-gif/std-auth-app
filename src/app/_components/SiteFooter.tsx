// src/app/_components/SiteFooter.tsx
//
// The public-site footer: landing page and the legal pages. Lifted out of
// page.tsx so the Privacy Policy and Terms links exist in one place rather
// than being retyped wherever a footer appears.
//
// `faqHref` exists because the FAQ is an in-page anchor on the landing page
// but has to point back at "/#faq" from anywhere else.

import Image from "next/image";
import Link from "next/link";
import { numericFigures } from "@/lib/ui";
import { HomeLogoLink } from "@/app/_components/HomeLogoLink";
import { POLICIES } from "@/lib/legal/policies";

export function SiteFooter({ faqHref = "/#faq" }: { faqHref?: string }) {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        {/* Icon only here, not the lockup — the adjacent text is the
            copyright line, and "BoardEdge © 2026 BoardEdge" would repeat
            the wordmark right next to itself. */}
        <HomeLogoLink className="flex items-center gap-2">
          <Image src="/logo-icon.png" alt="BoardEdge" width={24} height={24} />
          <span className={numericFigures + " text-xs text-muted-foreground"}>
            © {new Date().getFullYear()} BoardEdge
          </span>
        </HomeLogoLink>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <a href="mailto:contact.boardedge@gmail.com" className="hover:text-foreground">
            contact.boardedge@gmail.com
          </a>
          <span className="opacity-50" aria-disabled title="Coming soon">Instagram</span>
          <span className="opacity-50" aria-disabled title="Coming soon">LinkedIn</span>
          <Link href={POLICIES.privacy.href} className="hover:text-foreground">
            {POLICIES.privacy.title}
          </Link>
          <Link href={POLICIES.terms.href} className="hover:text-foreground">
            {POLICIES.terms.title}
          </Link>
          <a href={faqHref} className="hover:text-foreground">FAQs</a>
        </div>
      </div>

      {/* The page names CISCE throughout, and names other companies' products
          in the comparison. None of them endorse this one, and a student
          should not have to infer that. */}
      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-6 py-5 text-xs leading-relaxed text-muted-foreground">
          BoardEdge is an independent learning platform and is not affiliated with
          CISCE. ICSE and CISCE are trademarks of the Council for the Indian School
          Certificate Examinations. Other product and company names mentioned are the
          trademarks of their respective owners and imply no endorsement.
        </p>
      </div>
    </footer>
  );
}
