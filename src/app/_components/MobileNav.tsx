"use client";

// Mobile header plus the drawer behind it. The drawer reuses SidebarNav so the
// two breakpoints cannot drift into different navigation structures — adding a
// subject or a study surface updates both.

import { useState } from "react";
import Image from "next/image";
import { LogOut, Menu, X } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { SidebarNav } from "./Sidebar";
import { CreditsPill } from "./CreditsPill";
import type { CreditBalance } from "@/lib/credits";

export function MobileNav({
  subjects,
  credits,
}: {
  subjects: string[];
  credits: CreditBalance | null;
}) {
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
        <Image src="/be-logo1.png" alt="BoardEdge" width={30} height={30} />
        <div className="min-w-[22px]">
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
              <div className="flex items-center gap-2">
                <Image src="/be-logo1.png" alt="" width={26} height={26} />
                <span className="text-sm font-semibold text-foreground">BoardEdge</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="text-muted-foreground"
              >
                <X size={20} />
              </button>
            </div>

            <SidebarNav subjects={subjects} expanded onNavigate={() => setOpen(false)} />

            <form action={signOut} className="border-t border-border p-2">
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
              >
                <LogOut size={17} strokeWidth={1.75} aria-hidden />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
