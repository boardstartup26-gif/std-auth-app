// /progress/leakage — the Leakage Map: why marks are lost (causes) and where
// (chapters), on the latest attempt at each question. Filterable by subject.

import Link from "next/link";
import { computeLeakage } from "@/lib/progress";
import { MagnifierSketch } from "@/app/(protected)/dashboard/_components/Illustrations";
import { ProgressFrame } from "../_components/ProgressFrame";
import { NothingMarkedYet, ProgressLoadFailed } from "../_components/ProgressStates";
import { LeakageByChapter, LeakageCauses } from "../_components/LeakageMap";
import { loadProgress } from "../_lib/load";

export const dynamic = "force-dynamic";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <ProgressFrame
      eyebrow="Leakage map"
      title="Where you’re losing marks."
      subtitle="A breakdown of your missed marks by cause, across all your evaluated answers."
      art={<MagnifierSketch className="w-full" />}
    >
      {children}
    </ProgressFrame>
  );
}

export default async function LeakagePage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const { subject: subjectParam } = await searchParams;
  const { read } = await loadProgress("/progress/leakage");
  if (!read.ok) {
    return (
      <Frame>
        <ProgressLoadFailed />
      </Frame>
    );
  }
  if (!read.attempts.length) {
    return (
      <Frame>
        <NothingMarkedYet what="the Leakage Map shows which chapters cost you marks and what kind of mistakes cost them." />
      </Frame>
    );
  }

  // Only subjects the student has answered; an unknown ?subject= falls back
  // to "All" instead of an empty page.
  const subjects = [...new Set(read.attempts.map((a) => a.subject))].sort();
  const subject = subjectParam && subjects.includes(subjectParam) ? subjectParam : null;
  const leakage = computeLeakage(subject ? read.attempts.filter((a) => a.subject === subject) : read.attempts);

  return (
    <Frame>
      {subjects.length > 1 ? (
        <nav aria-label="Filter by subject" className="mb-5 flex flex-wrap gap-2">
          {[null, ...subjects].map((s) => {
            const active = s === subject;
            return (
              <Link
                key={s ?? "all"}
                href={s ? `/progress/leakage?subject=${encodeURIComponent(s)}` : "/progress/leakage"}
                aria-current={active ? "page" : undefined}
                className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
                  active
                    ? "border-accent bg-accent text-background"
                    : "border-border bg-card text-muted-foreground hover:border-accent/40 hover:text-foreground"
                }`}
              >
                {s ?? "All subjects"}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <LeakageCauses leakage={leakage} />
      <LeakageByChapter leakage={leakage} showSubject={subject === null && subjects.length > 1} />
      <p className="mt-4 text-xs text-muted-foreground">
        Based on your latest attempt at each question — marks you&rsquo;ve since won back don&rsquo;t count as lost.
      </p>
    </Frame>
  );
}
