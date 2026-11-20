// src/app/_components/PublicShell.tsx
//
// Chrome for the public content pages (legal, subject pages, guides): the
// same sticky header the legal pages have always had, and the site footer.
// The landing page keeps its own masthead (section links, magnetic buttons).
//
// Plain <Link>s, no client state: these pages prerender as static HTML and
// should be fully readable — and crawlable — without JavaScript.

import Image from "next/image";
import Link from "next/link";
import { btnPrimary, btnSecondary } from "@/lib/ui";
import { HomeLogoLink } from "@/app/_components/HomeLogoLink";
import { SiteFooter } from "@/app/_components/SiteFooter";

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <HomeLogoLink>
            <Image src="/logo-lockup.png" alt="BoardEdge" width={101} height={30} priority />
          </HomeLogoLink>
          <div className="flex items-center gap-3">
            <Link href="/login" className={`${btnSecondary} h-9 px-3.5 text-xs`}>
              Log in
            </Link>
            <Link href="/signup" className={`${btnPrimary} h-9 px-3.5 text-xs`}>
              Sign up
            </Link>
          </div>
        </div>
      </header>

      {children}

      <SiteFooter />
    </div>
  );
}

/** Visible breadcrumb trail; pair it with breadcrumbNode() for the JSON-LD. */
export function Breadcrumbs({ items }: { items: { name: string; path: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={item.path} className="flex items-center gap-2">
              {last ? (
                <span aria-current="page" className="text-foreground">
                  {item.name}
                </span>
              ) : (
                <>
                  <Link href={item.path} className="transition-colors hover:text-foreground">
                    {item.name}
                  </Link>
                  <span aria-hidden>/</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
