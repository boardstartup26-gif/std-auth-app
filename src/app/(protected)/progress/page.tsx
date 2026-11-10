// src/app/(protected)/progress/page.tsx
//
// Progress: the Leakage Map (where and why marks are lost) and Reattempt Gain
// (marks won back by trying again). Every figure comes from
// buildProgressSnapshot(), the same derivation the dashboard, the weekly plan
// and the parent report will use, so a number here can't disagree with one
// elsewhere.
//
// Server-rendered throughout, with no client components: the components below
// receive derived numbers only. Answer text, examiner feedback and model
// answers are never read here, so they can't reach the browser from this page.

import Link from "next/link";
import { redirect } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { readProgressAttempts } from "@/lib/progress/read";
import { buildProgressSnapshot, LEAK_REASON_LABELS, topReasons, weakestChapters } from "@/lib/progress";
import { FixListPanel, type FixNotice, type FixTarget } from "./_components/FixListPanel";
import { fmtMarks } from "@/lib/practice-sets/results";
import { EmptyState } from "@/app/_components/states/EmptyState";
import { ReloadableError } from "@/app/_components/states/ErrorState";
import { numericFigures, sectionLabel } from "@/lib/ui";
import { LeakageMap } from "./_components/LeakageMap";
import { ReattemptGainList } from "./_components/ReattemptGainList";

export const dynamic = "force-dynamic";

const shell = "mx-auto min-h-screen max-w-5xl px-6 py-12";

function Header() {
  return (
    <>
      <p className={sectionLabel}>Where your marks go</p>
      <h1 className="display-section mt-2">Your Progress</h1>
      <p className="mt-4 max-w-[var(--measure)] text-muted-foreground">
        Where you&rsquo;re losing marks, why, and how many you&rsquo;ve won back by trying again. Worked out from
        your marked answers only.
      </p>
    </>
  );
}

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; fix?: string }>;
}) {
  const { subject: subjectParam, fix } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/progress");

  const read = await readProgressAttempts(user.id);
  if (!read.ok) {
    return (
      <div className={shell}>
        <Header />
        <ReloadableError
          className="mt-10"
          title="We couldn’t load your progress"
          message="Your answers are safe — we just couldn’t fetch them this time. Try again in a moment."
          secondary={{ label: "Back to dashboard", href: "/dashboard" }}
        />
      </div>
    );
  }

  if (read.attempts.length === 0) {
    return (
      <div className={shell}>
        <Header />
        <EmptyState
          className="mt-10"
          icon={TrendingUp}
          title="Nothing to map yet"
          description="Once a few answers are marked, this page shows which chapters cost you marks, what kind of mistakes cost them, and how much you win back on reattempts."
          primary={{ label: "Practice a question", href: "/evaluate" }}
          secondary={{ label: "Build a practice paper", href: "/practice-paper" }}
        />
      </div>
    );
  }

  // Subject filter: only subjects the student has actually answered, and an
  // unknown ?subject= falls back to "All" instead of an empty page.
  const subjects = [...new Set(read.attempts.map((a) => a.subject))].sort();
  const subject = subjectParam && subjects.includes(subjectParam) ? subjectParam : null;
  const attempts = subject ? read.attempts.filter((a) => a.subject === subject) : read.attempts;
  const snap = buildProgressSnapshot(attempts);
  const { leakage, gain } = snap;
  const top = topReasons(leakage.reasons, 1)[0];

  // Fix List targets: per subject, the two chapters planFixList starts from.
  // Ranked within each subject (leakage is per question, so a subset's
  // ranking is the same whether computed from all subjects or one).
  const fixTargets: FixTarget[] = (subject ? [subject] : subjects)
    .map((s) => ({ subject: s, chapters: weakestChapters(leakage, { subject: s, limit: 2 }) }))
    .filter((t) => t.chapters.length > 0);
  const fixNotice: FixNotice | null = fix === "none" || fix === "thin" || fix === "error" ? fix : null;

  const STATS = [
    {
      label: "Marks still on the table",
      value: `${fmtMarks(leakage.lost)}`,
      sub: `of ${fmtMarks(leakage.possible)} on your latest attempts`,
    },
    {
      label: "Marks recovered",
      value: gain.marksRecovered > 0 ? `+${fmtMarks(gain.marksRecovered)}` : "0",
      sub: gain.reattempted ? `across ${gain.reattempted} reattempted question${gain.reattempted === 1 ? "" : "s"}` : "No reattempts yet",
    },
    {
      label: "Questions improved",
      value: gain.reattempted ? `${gain.improved}/${gain.reattempted}` : "—",
      sub: "Scored higher on a later try",
    },
    {
      label: "Most common slip",
      value: top ? LEAK_REASON_LABELS[top.reason] : "—",
      sub: top ? `${top.count} time${top.count === 1 ? "" : "s"} on your latest attempts` : "Nothing flagged",
    },
  ];

  return (
    <div className={shell}>
      <Header />

      {subjects.length > 1 ? (
        <nav aria-label="Filter by subject" className="mt-8 flex flex-wrap gap-2">
          {[null, ...subjects].map((s) => {
            const active = s === subject;
            return (
              <Link
                key={s ?? "all"}
                href={s ? `/progress?subject=${encodeURIComponent(s)}` : "/progress"}
                aria-current={active ? "page" : undefined}
                className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {s ?? "All subjects"}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border py-5 lg:grid-cols-4">
        {STATS.map(({ label, value, sub }) => (
          <div key={label} className="min-w-0">
            <p className={sectionLabel}>{label}</p>
            <p className={`mt-1.5 text-xl font-semibold text-foreground ${numericFigures}`}>{value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>

      <FixListPanel targets={fixTargets} notice={fixNotice} noticeSubject={subject} />
      <LeakageMap leakage={leakage} showSubject={subject === null && subjects.length > 1} />
      <ReattemptGainList gain={gain} />
    </div>
  );
}
