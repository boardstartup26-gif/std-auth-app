"use client";

// Primary navigation. Three groups — the app itself, the student's subjects,
// and the study surfaces — so the subject list is reachable in one click
// instead of living three dropdowns deep inside /evaluate.
//
// Subjects are passed in from the server layout rather than fetched here: the
// list is the same for every student and never changes between renders, so a
// client round-trip would only make the sidebar pop in after the page.

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Atom,
  BookOpen,
  FlaskConical,
  Globe2,
  Landmark,
  LayoutGrid,
  Leaf,
  LibraryBig,
  LogOut,
  type LucideIcon,
  PanelLeft,
  ScrollText,
  User,
} from "lucide-react";
import { signOut } from "@/app/(auth)/actions";

const SUBJECT_ICONS: Record<string, LucideIcon> = {
  Physics: Atom,
  Chemistry: FlaskConical,
  Biology: Leaf,
  Geography: Globe2,
  "History & Civics": Landmark,
  "English Literature": BookOpen,
};

const STUDY = [
  { href: "/evaluate", label: "Questions", icon: LibraryBig },
  { href: "/history", label: "Results", icon: ScrollText },
];

const ACCOUNT = [{ href: "/account", label: "Account", icon: User }];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

function GroupLabel({ children, expanded }: { children: string; expanded: boolean }) {
  if (!expanded) return <div className="my-2 h-px bg-border" aria-hidden />;
  return (
    <p className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </p>
  );
}

function NavRow({
  href,
  label,
  icon: Icon,
  active,
  expanded,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  expanded: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={expanded ? undefined : label}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-accent-subtle font-medium text-accent"
          : "text-muted-foreground hover:bg-surface-raised hover:text-foreground"
      } ${expanded ? "" : "justify-center"}`}
    >
      <Icon size={17} strokeWidth={1.75} className="shrink-0" aria-hidden />
      {expanded ? <span className="truncate">{label}</span> : null}
    </Link>
  );
}

/** Shared by the desktop rail and the mobile drawer. */
export function SidebarNav({
  subjects,
  expanded,
  onNavigate,
}: {
  subjects: string[];
  expanded: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
      <NavRow
        href="/dashboard"
        label="Dashboard"
        icon={LayoutGrid}
        active={isActive(pathname, "/dashboard")}
        expanded={expanded}
        onNavigate={onNavigate}
      />

      {subjects.length ? (
        <>
          <GroupLabel expanded={expanded}>My subjects</GroupLabel>
          {subjects.map((name) => (
            <NavRow
              key={name}
              // Plain /evaluate: the picker does not read a subject from the
              // URL yet, and a link that looks like a deep link but silently
              // lands on an unfiltered page is worse than an honest one.
              href="/evaluate"
              label={name}
              icon={SUBJECT_ICONS[name] ?? BookOpen}
              active={false}
              expanded={expanded}
              onNavigate={onNavigate}
            />
          ))}
        </>
      ) : null}

      <GroupLabel expanded={expanded}>Study</GroupLabel>
      {STUDY.map((item) => (
        <NavRow
          key={item.href}
          {...item}
          active={isActive(pathname, item.href)}
          expanded={expanded}
          onNavigate={onNavigate}
        />
      ))}

      <GroupLabel expanded={expanded}>Account</GroupLabel>
      {ACCOUNT.map((item) => (
        <NavRow
          key={item.href}
          {...item}
          active={isActive(pathname, item.href)}
          expanded={expanded}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

export function Sidebar({ subjects }: { subjects: string[] }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <aside
      className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 md:flex ${
        expanded ? "w-60" : "w-[4.5rem]"
      }`}
    >
      <div
        className={`flex items-center gap-2 px-3 py-4 ${expanded ? "" : "justify-center"}`}
      >
        <Image src="/be-logo1.png" alt="" width={28} height={28} className="shrink-0" />
        {expanded ? (
          <span className="truncate text-sm font-semibold text-foreground">BoardEdge</span>
        ) : null}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          className={`rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground ${
            expanded ? "ml-auto" : "hidden"
          }`}
        >
          <PanelLeft size={16} strokeWidth={1.75} />
        </button>
      </div>

      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Expand sidebar"
          className="mx-auto mb-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
        >
          <PanelLeft size={16} strokeWidth={1.75} />
        </button>
      ) : null}

      <SidebarNav subjects={subjects} expanded={expanded} />

      <form action={signOut} className="border-t border-border p-2">
        <button
          type="submit"
          title={expanded ? undefined : "Sign out"}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground ${
            expanded ? "" : "justify-center"
          }`}
        >
          <LogOut size={17} strokeWidth={1.75} className="shrink-0" aria-hidden />
          {expanded ? "Sign out" : null}
        </button>
      </form>
    </aside>
  );
}
