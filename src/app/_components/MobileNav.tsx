"use client";

// Mobile header plus the drawer behind it. The drawer reuses SidebarNav so the
// two breakpoints cannot drift into different navigation structures — adding a
// study surface updates both.

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { SidebarNav } from "./Sidebar";
import { SignOutButton } from "./SignOutButton";
import { CreditsPill } from "./CreditsPill";
import { NotificationBell } from "./NotificationBell";
import type { CreditBalance } from "@/lib/credits";

export function MobileNav({ credits, unread }: { credits: CreditBalance | null; unread: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="text-foreground"
        >
          <Menu size={22} />
        </button>
        {/* Mobile header renders only inside (protected)/layout.tsx, already
            gated to a signed-in user by middleware — /dashboard unconditionally. */}
        <Link href="/dashboard" aria-label="Dashboard">
          <Image src="/logo-icon.png" alt="" width={30} height={30} priority />
        </Link>
        <div className="flex min-w-[22px] items-center gap-1.5">
          <NotificationBell unread={unread} />
          {credits ? <CreditsPill credits={credits} /> : null}
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            className="absolute inset-0 bg-ink/40"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            tabIndex={-1}
          />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-border bg-card">
            <div className="flex items-center justify-between px-4 py-4">
              <Link href="/dashboard" onClick={() => setOpen(false)}>
                <Image src="/logo-lockup.png" alt="BoardEdge" width={81} height={24} />
              </Link>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="text-muted-foreground"
              >
                <X size={20} />
              </button>
            </div>

            <SidebarNav expanded onNavigate={() => setOpen(false)} />

            <form action={signOut} className="border-t border-border p-2">
              <SignOutButton />
            </form>
          </div>
        </div>
      )}
    </>
  );
}
