"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FilePlus2, History, User, LogOut, ChevronsLeft, ChevronsRight } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/evaluate", label: "New Evaluation", icon: FilePlus2 },
  { href: "/history", label: "History", icon: History },
  { href: "/account", label: "Account", icon: User },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  expanded,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
  expanded: boolean;
}) {
  return (
    <Link
      href={href}
      title={expanded ? undefined : label}
      className={`flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
        active
          ? "bg-accent-subtle text-accent"
          : "text-muted-foreground hover:bg-surface-raised hover:text-foreground"
      } ${expanded ? "" : "justify-center"}`}
    >
      <Icon size={18} strokeWidth={1.75} className="shrink-0" />
      {expanded && <span>{label}</span>}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      className={`sticky top-0 hidden h-dvh shrink-0 flex-col bg-card border-r border-border md:flex transition-[width] duration-200 ${
        expanded ? "w-60" : "w-[4.5rem]"
      }`}
    >
      <div className="flex items-center justify-center py-8">
        <Image src="/be-logo1.png" alt="BoardEdge" width={36} height={36} priority />
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            {...item}
            expanded={expanded}
            active={pathname === item.href || pathname.startsWith(item.href + "/")}
          />
        ))}
      </nav>

      <form action={signOut} className="border-t border-border px-3 py-4">
        <button
          type="submit"
          title={expanded ? undefined : "Sign out"}
          className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition-colors cursor-pointer hover:bg-surface-raised hover:text-foreground ${
            expanded ? "" : "justify-center"
          }`}
        >
          <LogOut size={18} strokeWidth={1.75} className="shrink-0" />
          {expanded && "Sign out"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
        className={`flex items-center gap-3 border-t border-border px-3 py-3.5 text-muted-foreground transition-colors cursor-pointer hover:bg-surface-raised hover:text-foreground ${
          expanded ? "justify-end" : "justify-center"
        }`}
      >
        {expanded ? <ChevronsLeft size={18} strokeWidth={1.75} /> : <ChevronsRight size={18} strokeWidth={1.75} />}
      </button>
    </aside>
  );
}
