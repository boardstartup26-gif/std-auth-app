import Link from "next/link";
import { ArrowRight, FileStack, LibraryBig, type LucideIcon, ScrollText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { readCredits } from "@/lib/credits";
import { btnPrimary, numericFigures, scoreBadgeClass, sectionLabel } from "@/lib/ui";
import type { SetSummary } from "@/lib/practice-sets/read";
import { fmtMarks } from "@/lib/practice-sets/results";
import { readDashboardPractice, type RecentItem } from "./_lib/recent";

export const dynamic = "force-dynamic";

// An exam desk, not a stack of cards: the page is set in type, whitespace and
// hairline rules. The one filled surface is an open paper — the single thing
// on this page that is waiting on the student. Serif carries the academic
// hierarchy (greeting, subjects, scores); sans carries metadata and actions.
const dashboardShell = "mx-auto min-h-screen max-w-5xl px-6 py-12";

/**
 * Greeting by IST clock, not the server's. Vercel runs these functions in
 * whatever region is nearest, so a UTC hour would wish a student in Kolkata
 * good morning at half past five in the evening. The page is force-dynamic and
 * server-only, so there is no client clock to disagree with this.
 */
function greetingFor(date: Date): string {
  const hour = Number(
    date.toLocaleString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false })
  );
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
}

function todayLabel(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** A marked paper's score against what was actually marked (failed answers are left out). */
function paperScore(s: SetSummary): { score: number; outOf: number; percent: number } {
  const score = s.score ?? 0;
  const outOf = s.markedTotal ?? s.totalMarks;
  return { score, outOf, percent: outOf ? Math.round((score / outOf) * 100) : 0 };
}

const textLink =
  "inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 transition-colors hover:text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const rowLabel = "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";

// ─── Primary: the practice paper ─────────────────────────────────────────────
// With a paper open it is that paper, on the page's only filled surface.
// Otherwise it is an invitation set in type that sends the student to the
// builder at /practice-paper — the builder is not duplicated here.

function ContinuePaper({ paper }: { paper: SetSummary }) {
  const marking = paper.status === "marking";
  const progress = Math.round((paper.answeredCount / Math.max(1, paper.questionCount)) * 100);

  return (
    <section
      className="rounded-lg border border-border bg-card px-6 py-7 sm:px-8"
      aria-labelledby="primary-paper"
    >
      <p className={rowLabel}>{marking ? "Practice paper · being marked" : "Continue practice paper"}</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div className="min-w-0">
          <h2 id="primary-paper" className="font-display text-[2rem] leading-tight text-foreground">
            {paper.subject}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            <span className={numericFigures}>{paper.questionCount}</span> questions ·{" "}
            <span className={numericFigures}>{fmtMarks(paper.totalMarks)}</span> marks ·{" "}
            {marking ? "handed in" : "started"} {dateLabel(paper.submittedAt ?? paper.createdAt)}
          </p>
        </div>

        <div className="w-full sm:w-64">
          <p className="flex items-baseline justify-between">
            <span className={`${numericFigures} font-display text-2xl text-foreground`}>
              {paper.answeredCount}
              <span className="text-base text-muted-foreground">/{paper.questionCount}</span>
            </span>
            <span className="text-xs text-muted-foreground">answered</span>
          </p>
          <div
            className="mt-2 h-1 overflow-hidden rounded-full bg-rule"
            role="img"
            aria-label={`${paper.answeredCount} of ${paper.questionCount} questions answered`}
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {marking ? (
        <p className="mt-5 max-w-[var(--measure)] text-sm text-muted-foreground">
          Your answers are being marked point by point. Results appear on the paper as soon as
          marking finishes.
        </p>
      ) : null}

      <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-5">
        <Link href={`/practice-paper/${paper.id}`} className={`${btnPrimary} gap-2 rounded-lg`}>
          {marking ? "See marking" : "Continue Practice Paper"}
          <ArrowRight size={15} strokeWidth={2} aria-hidden />
        </Link>
        <Link href="/practice-paper" className="text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline">
          Build a new paper
        </Link>
      </div>
    </section>
  );
}

function BuildPaper() {
  return (
    <section className="border-t border-foreground/80 pt-6" aria-labelledby="primary-paper">
      <p className={rowLabel}>Practice papers</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div className="max-w-[var(--measure)]">
          <h2 id="primary-paper" className="font-display text-[2rem] leading-tight text-foreground text-balance">
            Sit a full paper built from real ICSE questions
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Pick a subject and a length, answer the whole paper in one sitting, and get every answer
            marked point by point against the board&rsquo;s scheme when you hand it in.
          </p>
        </div>
        <Link href="/practice-paper" className={`${btnPrimary} gap-2 rounded-lg`}>
          Build a practice paper
          <ArrowRight size={15} strokeWidth={2} aria-hidden />
        </Link>
      </div>
    </section>
  );
}

// ─── Latest result ───────────────────────────────────────────────────────────

function LatestResult({ paper }: { paper: SetSummary }) {
  const { score, outOf, percent } = paperScore(paper);
  return (
    <section
      className="grid items-center gap-x-8 gap-y-3 border-b border-border py-5 sm:grid-cols-[9rem_minmax(0,1fr)_auto_auto]"
      aria-labelledby="latest-result"
    >
      <p id="latest-result" className={rowLabel}>
        Latest result
      </p>
      <div className="min-w-0">
        <p className="truncate font-display text-lg leading-tight text-foreground">{paper.subject} paper</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className={numericFigures}>{paper.questionCount}</span> questions ·{" "}
          {dateLabel(paper.submittedAt ?? paper.createdAt)}
        </p>
      </div>
      <p className="flex items-baseline gap-3">
        <span className={`${numericFigures} font-display text-3xl leading-none text-foreground`}>
          {fmtMarks(score)}
          <span className="text-lg text-muted-foreground">/{fmtMarks(outOf)}</span>
        </span>
        <span className={scoreBadgeClass(score, outOf)}>{percent}%</span>
      </p>
      <Link href={`/practice-paper/${paper.id}`} className={textLink}>
        View full analysis
        <ArrowRight size={14} strokeWidth={2} aria-hidden />
      </Link>
    </section>
  );
}

// ─── Quick start ─────────────────────────────────────────────────────────────

const QUICK_START: { href: string; icon: LucideIcon; label: string; note: string }[] = [
  { href: "/evaluate", icon: LibraryBig, label: "Practice a question", note: "One past-paper question, marked" },
  { href: "/practice-paper", icon: FileStack, label: "Build a paper", note: "A full sitting from real PYQs" },
  { href: "/history", icon: ScrollText, label: "View results", note: "Every answer you have submitted" },
];

function QuickStart() {
  return (
    <section
      className="grid gap-x-8 gap-y-3 border-b border-border py-5 sm:grid-cols-[9rem_minmax(0,1fr)]"
      aria-labelledby="quick-start"
    >
      <p id="quick-start" className={`${rowLabel} sm:pt-0.5`}>
        Quick start
      </p>
      <ul className="grid gap-y-3 sm:grid-cols-3 sm:divide-x sm:divide-border">
        {QUICK_START.map(({ href, icon: Icon, label, note }) => (
          <li key={href} className="sm:px-5 sm:first:pl-0 sm:last:pr-0">
            <Link
              href={href}
              className="group flex items-start gap-2.5 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground transition-colors group-hover:text-accent" />
              <span>
                <span className="block text-sm font-medium text-foreground underline-offset-4 group-hover:underline">
                  {label}
                </span>
                <span className="block text-xs text-muted-foreground">{note}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Recent practice ─────────────────────────────────────────────────────────

interface RowView {
  key: string;
  href: string;
  kind: string;
  title: string;
  score: React.ReactNode;
  date: string;
  action: string;
}

function viewOf(item: RecentItem): RowView {
  if (item.kind === "paper") {
    const p = item.paper;
    const marked = p.status === "marked" && p.score !== null;
    let score: React.ReactNode;
    if (marked) {
      const { score: s, outOf, percent } = paperScore(p);
      score = (
        <span className={scoreBadgeClass(s, outOf)}>
          {fmtMarks(s)}/{fmtMarks(outOf)} · {percent}%
        </span>
      );
    } else {
      score = (
        <span className="font-sans text-xs text-muted-foreground">
          {p.status === "marking" ? "Marking" : `${p.answeredCount}/${p.questionCount} answered`}
        </span>
      );
    }
    return {
      key: `p-${p.id}`,
      href: `/practice-paper/${p.id}`,
      kind: `Practice paper · ${p.questionCount} questions`,
      title: p.subject,
      score,
      date: dateLabel(item.at),
      action: p.status === "in_progress" ? "Continue" : "View",
    };
  }
  const a = item.attempt;
  return {
    key: `q-${a.id}`,
    href: `/history/${a.id}`,
    kind: `Question ${a.questionNumber ?? "—"}${a.year ? ` · ${a.year}` : ""}`,
    title: a.subject,
    score:
      a.awarded === null ? (
        <span className="font-sans text-xs text-muted-foreground">Not marked</span>
      ) : (
        <span className={scoreBadgeClass(a.awarded, a.totalMarks)}>
          {fmtMarks(a.awarded)}/{fmtMarks(a.totalMarks)}
        </span>
      ),
    date: dateLabel(item.at),
    action: "View",
  };
}

function RecentPractice({ recent }: { recent: RecentItem[] }) {
  return (
    <section className="mt-14" aria-labelledby="recent-practice">
      <div className="flex items-baseline justify-between gap-4 border-b border-foreground/80 pb-3">
        <h2 id="recent-practice" className="font-display text-xl text-foreground">
          Recent practice
        </h2>
        {recent.length ? (
          <Link href="/history" className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline">
            All results
          </Link>
        ) : null}
      </div>

      {recent.length ? (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className={`${rowLabel} py-2.5 font-semibold`}>Activity</th>
              <th scope="col" className={`${rowLabel} py-2.5 pl-4 text-right font-semibold`}>Score</th>
              <th scope="col" className={`${rowLabel} hidden py-2.5 pl-6 text-right font-semibold sm:table-cell`}>Date</th>
              <th scope="col" className="py-2.5 pl-6">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {recent.map((item) => {
              const r = viewOf(item);
              return (
                <tr key={r.key} className="align-middle">
                  <td className="py-3.5 pr-2">
                    <p className="font-display text-base leading-snug text-foreground">{r.title}</p>
                    <p className={`${numericFigures} text-xs text-muted-foreground`}>
                      {r.kind}
                      <span className="sm:hidden"> · {r.date}</span>
                    </p>
                  </td>
                  <td className={`${numericFigures} whitespace-nowrap py-3.5 pl-4 text-right font-display text-base text-foreground`}>
                    {r.score}
                  </td>
                  <td className={`${numericFigures} hidden whitespace-nowrap py-3.5 pl-6 text-right text-xs text-muted-foreground sm:table-cell`}>
                    {r.date}
                  </td>
                  <td className="whitespace-nowrap py-3.5 pl-6 text-right">
                    <Link
                      href={r.href}
                      className="text-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {r.action}
                      <span className="sr-only">: {r.title}, {r.kind}</span>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="border-b border-border py-6 text-sm text-muted-foreground">
          Nothing here yet. Papers and questions you attempt will be listed here, with a link to
          each result.
        </p>
      )}
    </section>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const firstName = (user?.user_metadata?.first_name as string | undefined)?.trim();
  const greetingName = firstName || user?.email?.split("@")[0] || "there";
  const [credits, practice] = user
    ? await Promise.all([readCredits(user.id), readDashboardPractice(user.id)])
    : [null, { openPaper: null, latestMarked: null, recent: [] }];
  const { openPaper, latestMarked, recent } = practice;
  const now = new Date();

  return (
    <div className={dashboardShell}>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className={`${sectionLabel} font-medium normal-case tracking-normal`}>{todayLabel(now)}</p>
          <h1 className="mt-1.5 font-display text-3xl leading-tight text-foreground sm:text-[2.25rem]">
            {greetingFor(now)}, {greetingName}
          </h1>
        </div>
        {/* Secondary on purpose: the top bar's pill is the balance's real home
            (and its detail panel); this line is for phones, where that bar is hidden. */}
        {credits ? (
          <p className="pb-1 text-xs text-muted-foreground">
            <span className={`${numericFigures} font-semibold text-foreground`}>{credits.remaining}</span> of{" "}
            <span className={numericFigures}>{credits.limit}</span> credits left this week
          </p>
        ) : null}
      </header>

      <div className="mt-10">{openPaper ? <ContinuePaper paper={openPaper} /> : <BuildPaper />}</div>

      <div className={openPaper ? "mt-6 border-t border-border" : "mt-8 border-t border-border"}>
        {latestMarked ? <LatestResult paper={latestMarked} /> : null}
        <QuickStart />
      </div>

      <RecentPractice recent={recent} />
    </div>
  );
}
