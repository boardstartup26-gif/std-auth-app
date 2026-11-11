// One headline figure: outline icon, big Fraunces number in the accent, a
// label, and optionally the basis it was worked out on. Server component.

import type { LucideIcon } from "lucide-react";
import { dashCard } from "@/app/(protected)/dashboard/_lib/styles";
import { numericFigures } from "@/lib/ui";

export function StatCard({
  icon: Icon,
  value,
  label,
  note,
}: {
  icon: LucideIcon;
  value: React.ReactNode;
  label: string;
  note?: string;
}) {
  return (
    <div className={`${dashCard} flex flex-col items-center px-3 py-4 text-center sm:py-5`}>
      <Icon size={22} strokeWidth={1.6} aria-hidden className="text-accent" />
      <p className={`${numericFigures} mt-2 font-display text-[1.9rem] font-semibold leading-none text-accent sm:text-[2.2rem]`}>
        {value}
      </p>
      <p className="mt-2 text-[12.5px] font-medium text-foreground">{label}</p>
      {note ? <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{note}</p> : null}
    </div>
  );
}
