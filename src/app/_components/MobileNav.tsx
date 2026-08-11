"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X, LayoutDashboard, FilePlus2, History, User, LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/evaluate", label: "New Evaluation", icon: FilePlus2 },
  { href: "/history", label: "History", icon: History },
  { href: "/account", label: "Account", icon: User },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="text-foreground">
          <Menu size={22} />
        </button>
        <Image src="/be-logo1.png" alt="BoardEdge" width={32} height={32} />
        <div className="w-[22px]" />
      </header>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col bg-card border-r border-border">
            <div className="flex items-center justify-between px-4 py-5">
              <Image src="/be-logo1.png" alt="BoardEdge" width={36} height={36} />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="text-muted-foreground">
                <X size={20} />
              </button>
            </div>

            <nav className="flex flex-1 flex-col gap-1 px-2">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 rounded-lg mx-1 px-4 py-3 text-sm font-medium transition-colors ${
                      active ? "bg-accent-subtle text-accent" : "text-muted-foreground hover:bg-surface-raised hover:text-foreground"
                    }`}
                  >
                    <Icon size={18} strokeWidth={1.75} />
                    {label}
                  </Link>
                );
              })}
            </nav>

            <form action={signOut} className="border-t border-border px-2 py-4">
              <button type="submit" className="flex w-full items-center gap-3 rounded-lg mx-1 px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground">
                <LogOut size={18} strokeWidth={1.75} />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}