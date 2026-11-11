// "Your first week": five things that turn a first visit into a habit, set
// like a marked answer sheet — a tick in the margin for each one done, one
// action per row for the next. Hidden once everything is done or two weeks
// after onboarding (readFirstWeekChecklist decides).

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { REFERRAL_WEEKLY_BONUS } from "@/lib/constants";
import type { ChecklistKey, FirstWeekChecklist as Checklist } from "@/lib/onboarding/checklist";
import { OnboardingProgress } from "@/app/onboarding/_components/OnboardingProgress";
import { dashButton, dashCard, dashHeading } from "../_lib/styles";

const COPY: Record<ChecklistKey, { title: string; note: string; progressNote?: string; href: string; cta: string }> = {
  first_answer: {
    title: "Get your first answer marked",
    note: "Pick any past-paper question and see it marked point by point.",
    href: "/evaluate",
    cta: "Answer a question",
  },
  handwritten: {
    title: "Try a handwritten answer",
    note: "Write on paper like the exam, snap a photo, and get it marked the same way.",
    href: "/evaluate",
    cta: "Upload a photo",
  },
  paper: {
    title: "Sit a practice paper",
    note: "A full paper from real ICSE questions, marked when you hand it in.",
    href: "/practice-paper",
    cta: "Build a paper",
  },
  parent: {
    title: "Ask a parent to confirm",
    note: "Marking continues after your 2 free answers once a parent or guardian approves.",
    progressNote: "Link sent — waiting for your parent or guardian to click it.",
    href: "/account",
    cta: "Check status",
  },
  invite: {
    title: "Invite a friend",
    note: `You both get +${REFERRAL_WEEKLY_BONUS} credits every week once they've had 2 answers marked.`,
    progressNote: "A friend has joined — they count once 2 of their answers are marked.",
    href: "/invite",
    cta: "Invite",
  },
};

const rowLabel = "text-[11px] font-semibold uppercase tracking-[0.14em] text-accent";

export function FirstWeekChecklist({ checklist }: { checklist: Checklist }) {
  // The first unfinished item gets the filled button; the rest stay quiet.
  const nextKey = checklist.items.find((i) => !i.done)?.key;

  return (
    <section className={`${dashCard} mt-4 p-5 sm:p-6`} aria-labelledby="first-week">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <p className={rowLabel}>Getting started</p>
          <h2 id="first-week" className={`${dashHeading} mt-1`}>
            Your first week
          </h2>
        </div>
        <OnboardingProgress done={checklist.done} total={checklist.total} className="w-full sm:w-56" />
      </div>

      <ol className="mt-4 divide-y divide-border border-t border-border">
        {checklist.items.map((item, i) => {
          const c = COPY[item.key];
          const isNext = item.key === nextKey;
          return (
            <li key={item.key} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 py-3 last:pb-0 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center">
              <span
                className={`font-display text-base tabular-nums ${item.done ? "text-status-correct" : "text-accent"}`}
                aria-hidden
              >
                {item.done ? "✓" : `${i + 1}.`}
              </span>
              <div className="min-w-0">
                <p className={`text-sm font-medium ${item.done ? "text-muted-foreground line-through decoration-1" : "text-foreground"}`}>
                  {c.title}
                  <span className="sr-only">{item.done ? " — done" : ""}</span>
                </p>
                {!item.done ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.inProgress && c.progressNote ? c.progressNote : c.note}
                  </p>
                ) : null}
              </div>
              {!item.done ? (
                <Link
                  href={c.href}
                  className={`col-start-2 mt-2 justify-self-start sm:col-start-3 sm:mt-0 sm:justify-self-end ${
                    isNext ? dashButton : "inline-flex items-center gap-1.5 text-[13px] font-medium text-accent underline-offset-4 hover:underline"
                  }`}
                >
                  {c.cta}
                  <ArrowRight size={14} strokeWidth={2} aria-hidden />
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
