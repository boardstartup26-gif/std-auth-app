"use client";

// One card per question, each opening in place.
//
// The numbering that used to sit before each question is gone: with the cards
// separated the count is visible from the stack itself, and a column of "01 02
// 03" next to the plus buttons gave every row two leading glyphs competing for
// the same job.

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

export interface FaqItem {
  question: string;
  answer: string;
}

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => {
        const open = openIndex === i;
        return (
          <div
            key={i}
            className={`rounded-2xl border bg-card transition-colors ${
              open ? "border-accent/40" : "border-border"
            }`}
          >
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : i)}
              aria-expanded={open}
              className="flex w-full cursor-pointer items-center gap-4 px-4 py-4 text-left sm:px-5"
            >
              <span
                aria-hidden
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors ${
                  open ? "bg-accent text-background" : "bg-foreground text-background"
                }`}
              >
                {open ? <Minus size={15} strokeWidth={2.5} /> : <Plus size={15} strokeWidth={2.5} />}
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium text-foreground sm:text-base">
                {item.question}
              </span>
            </button>

            {open ? (
              <div className="px-4 pb-5 sm:px-5">
                {/* Indented to the question's text, not to the card edge, so
                    the answer reads as belonging to the question above it. */}
                <p className="pl-12 text-sm leading-relaxed text-muted-foreground">
                  {item.answer}
                </p>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
