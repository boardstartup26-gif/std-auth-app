"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FilePlus2, History, User, LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/evaluate", label: "New Evaluation", icon: FilePlus2 },
  { href: "/history", label: "History", icon: History },
  { href: "/account", label: "Account", icon: User },
];

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof LayoutDashboard; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-r-lg px-4 py-2.5 text-sm font-medium transition-colors border-l-[3px] ${active
          ? "bg-white/10 border-accent text-foreground"
          : "border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground"
        }`}
    >
      <Icon size={18} strokeWidth={1.75} />
      {label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-dvh w-60 flex-col bg-card border-r border-border md:flex">
      <div className="flex items-center justify-center py-8">
        <Image src="/be-logo1.png" alt="BoardEdge" width={44} height={44} priority />
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} active={pathname === item.href || pathname.startsWith(item.href + "/")} />
        ))}
      </nav>

      <form action={signOut} className="border-t border-border px-2 py-4">
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-r-lg border-l-[3px] border-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <LogOut size={18} strokeWidth={1.75} />
          Sign out
        </button>
      </form>
    </aside>
  );
}