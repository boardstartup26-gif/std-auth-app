"use client";

// Primary navigation. Two groups — the study surfaces and the account — plus
// the dashboard on its own at the top.
//
// The subject list used to sit between them, one row per subject. It was
// removed because every row pointed at the same place: /evaluate then read no
// subject from the URL, so six links that looked like six destinations all
// landed on the same unfiltered picker. Subject is the first step of that
// picker, which is where the choice actually does something.

import { useState } from "react";
import Link, { useLinkStatus } from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  FileStack,
  Gift,
  LayoutGrid,
  LibraryBig,
  type LucideIcon,
  PanelLeft,
  ScrollText,
  TrendingUp,
  User,
} from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { SignOutButton } from "./SignOutButton";

const STUDY = [
  { href: "/evaluate", label: "Questions", icon: LibraryBig },
  { href: "/practice-paper", label: "Practice papers", icon: FileStack },
  { href: "/history", label: "Results", icon: ScrollText },
  { href: "/progress", label: "Progress", icon: TrendingUp },
];

const ACCOUNT = [
  // The referral program's permanent entry point. Carries its reward in the
  // row itself so the offer is visible on every page, not only on /invite.
  { href: "/invite", label: "Invite friends", icon: Gift, badge: "+5/wk" },
  { href: "/account", label: "Account", icon: User },
];

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

/**
 * The row's icon, which doubles as its "still loading" hint. useLinkStatus only
 * works in a descendant of the <Link>, and the icon has to stay the same size
 * and place either way — so the hint is a pulse on the icon itself rather than
 * an extra spinner element that would shift the row. When the destination was
 * prefetched, navigation commits at once and this never visibly fires.
 */
function NavIcon({ icon: Icon }: { icon: LucideIcon }) {
  const { pending } = useLinkStatus();
  return (
    <Icon
      size={17}
      strokeWidth={1.75}
      className={`shrink-0 ${pending ? "animate-pulse motion-reduce:animate-none" : ""}`}
      aria-hidden
    />
  );
}

function NavRow({
  href,
  label,
  icon,
  badge,
  active,
  expanded,
  onNavigate,
  onPress,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  active: boolean;
  expanded: boolean;
  onNavigate?: () => void;
  /** Fired on a plain click, so the nav can show the destination as current before it loads. */
  onPress?: (href: string) => void;
}) {
  return (
    <Link
      href={href}
      onClick={(e) => {
        // Modified clicks open a new tab/window; this page isn't going anywhere.
        const plain = e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
        if (plain) onPress?.(href);
        onNavigate?.();
      }}
      title={expanded ? undefined : label}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-accent-subtle font-medium text-accent"
          : "text-muted-foreground hover:bg-surface-raised hover:text-foreground"
      } ${expanded ? "" : "justify-center"}`}
    >
      <NavIcon icon={icon} />
      {expanded ? <span className="truncate">{label}</span> : <span className="sr-only">{label}</span>}
      {expanded && badge ? (
        <span className="ml-auto rounded-full bg-status-correct-subtle px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-status-correct">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

/** Shared by the desktop rail and the mobile drawer. */
export function SidebarNav({
  expanded,
  onNavigate,
}: {
  expanded: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  // Optimistic active state. usePathname() only changes once the new route has
  // *committed*, which for a route that isn't prefetched is a full server round
  // trip after the click — long enough for the nav to still say "you are
  // here" about the page the student just left. So a click records where it is
  // heading, and that wins until the pathname actually changes. The pending
  // target is dropped during render when the pathname moves (React's
  // "adjust state when a value changes" pattern), not in an effect, so there is
  // no frame where the old highlight flashes back.
  const [heading, setHeading] = useState<string | null>(null);
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setHeading(null);
  }
  const current = heading ?? pathname;
  const press = (href: string) => setHeading(href === pathname ? null : href);

  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
      <NavRow
        href="/dashboard"
        label="Dashboard"
        icon={LayoutGrid}
        active={isActive(current, "/dashboard")}
        expanded={expanded}
        onNavigate={onNavigate}
        onPress={press}
      />

      <GroupLabel expanded={expanded}>Study</GroupLabel>
      {STUDY.map((item) => (
        <NavRow
          key={item.href}
          {...item}
          active={isActive(current, item.href)}
          expanded={expanded}
          onNavigate={onNavigate}
          onPress={press}
        />
      ))}

      <GroupLabel expanded={expanded}>Account</GroupLabel>
      {ACCOUNT.map((item) => (
        <NavRow
          key={item.href}
          {...item}
          active={isActive(current, item.href)}
          expanded={expanded}
          onNavigate={onNavigate}
          onPress={press}
        />
      ))}
    </nav>
  );
}

export function Sidebar() {
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
        {/* This rail only ever renders inside (protected)/layout.tsx, which
            middleware has already gated to a signed-in user — so the logo's
            destination here is never in question. */}
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {expanded ? (
            // The full lockup replaces the icon + separate "BoardEdge" span
            // pair that used to sit here — one image instead of two elements
            // saying the same thing side by side. Sized up from an initial
            // 81×24: at that size it left most of the 240px-wide rail empty
            // before the collapse toggle. 108×32 keeps the same 3.37:1 aspect
            // ratio while actually using the header's width.
            <Image src="/logo-lockup.png" alt="BoardEdge" width={108} height={32} priority />
          ) : (
            <Image src="/logo-icon.png" alt="BoardEdge" width={28} height={28} className="shrink-0" priority />
          )}
        </Link>
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

      <SidebarNav expanded={expanded} />

      <form action={signOut} className="border-t border-border p-2">
        <SignOutButton expanded={expanded} />
      </form>
    </aside>
  );
}
