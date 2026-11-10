// An empty state is a prompt, not an apology: say what this place is for, and
// put the next step one click away. Server-safe — actions are links, or an
// onClick when the caller is itself a client component (e.g. "Clear filters").
//
// Same dashed-hairline panel the app already used for its one hand-rolled
// empty state on /history, so these read as the same family.

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { btnPrimary, btnSecondary } from "@/lib/ui";

export interface EmptyAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

function ActionButton({ action, className }: { action: EmptyAction; className: string }) {
  if (action.href) {
    return (
      <Link href={action.href} className={className}>
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={className}>
      {action.label}
    </button>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  primary,
  secondary,
  compact = false,
  className = "",
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  primary?: EmptyAction;
  secondary?: EmptyAction;
  /** Tighter padding, for a section inside a page rather than the page's whole body. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-dashed border-border text-center ${
        compact ? "px-5 py-7" : "px-6 py-12"
      } ${className}`}
    >
      {Icon ? (
        <Icon size={22} strokeWidth={1.5} aria-hidden className="mx-auto mb-3 text-muted-foreground" />
      ) : null}
      <p className="font-display text-lg leading-snug text-foreground">{title}</p>
      {description ? (
        <p className="mx-auto mt-2 max-w-[var(--measure)] text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {primary || secondary ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {primary ? <ActionButton action={primary} className={btnPrimary} /> : null}
          {secondary ? <ActionButton action={secondary} className={btnSecondary} /> : null}
        </div>
      ) : null}
    </div>
  );
}
