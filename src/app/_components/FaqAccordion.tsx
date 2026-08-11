"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

export interface FaqItem {
  question: string;
  answer: string;
}

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-card">
      {items.map((item, i) => {
        const open = openIndex === i;
        return (
          <div key={i}>
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : i)}
              className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left sm:px-6"
              aria-expanded={open}
            >
              <span className="flex items-baseline gap-3">
                <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-sm font-medium text-foreground sm:text-base">{item.question}</span>
              </span>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground">
                {open ? <X size={14} /> : <Plus size={14} />}
              </span>
            </button>
            {open && (
              <div className="px-5 pb-5 sm:px-6">
                <p className="pl-8 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
