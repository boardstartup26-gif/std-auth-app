import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  ChartNoAxesColumn,
  ChartPie,
  ClipboardList,
  Gift,
  MailCheck,
  TrendingUp,
} from "lucide-react";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readCredits } from "@/lib/credits";
import { numericFigures, scoreBadgeClass } from "@/lib/ui";
import type { SetSummary } from "@/lib/practice-sets/read";
import { fmtMarks } from "@/lib/practice-sets/results";
import { REFERRAL_WEEKLY_BONUS } from "@/lib/constants";
import { readFirstWeekChecklist } from "@/lib/onboarding/checklist";
import { readReferralSummary, type ReferralSummary } from "@/lib/referrals/service";
import { readProgressAttempts } from "@/lib/progress/read";
import { buildProgressSnapshot, type ProgressSnapshot } from "@/lib/progress";
import { getEvaluationGateState } from "@/lib/parent-consent/service";
import { parentReportsLive, readReportRow, reportState, type ReportState } from "@/lib/parent-report/service";
import { ensureWeeklyPlan, viewPlan, type PlanView } from "@/lib/board-plan/service";
import { EVENTS } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";
import { EmptyState } from "@/app/_components/states/EmptyState";
import { ReloadableError } from "@/app/_components/states/ErrorState";
import { readDashboardPractice, type RecentItem } from "./_lib/recent";
import { dashCard, dashEyebrow, dashHeading, dashLink } from "./_lib/styles";
import { FirstWeekChecklist } from "./_components/FirstWeekChecklist";
import { BoardPlanCard } from "./_components/BoardPlanCard";
import { ProgressSummary } from "./_components/ProgressSummary";
import { PrimaryActions } from "./_components/PrimaryActions";
import { SubjectGrid } from "./_components/SubjectGrid";
import { ToolShortcuts, type ToolTile } from "./_components/ToolShortcuts";
import { HallSketch } from "./_components/Illustrations";

export const dynamic = "force-dynamic";

// Practice first: greeting, then the two ways to practise, then the shortcuts
// to the preparation tools, then subjects. Below that, only what this student
// has: this week's Board Plan and progress for a returning student, the
// first-week checklist for a new one. No section renders an empty statistic.
// Headings are Fraunces; everything else is Inter (font-body on the shell).
const dashboardShell = "mx-auto min-h-screen max-w-5xl px-4 py-8 font-body sm:px-6 sm:py-10";

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
  return date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" });
}

/** A marked paper's score against what was actually marked (failed answers are left out). */
function paperScore(s: SetSummary): { score: number; outOf: number; percent: number } {
  const score = s.score ?? 0;
  const outOf = s.markedTotal ?? s.totalMarks;
  return { score, outOf, percent: outOf ? Math.round((score / outOf) * 100) : 0 };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ─── Preparation tools ───────────────────────────────────────────────────────
// Each tile links to where the feature already lives and carries one fact
// from real data. A tile with nothing behind it is dropped; "Your Progress"
// fills a gap so the row stays a full set.

const REPORT_CAPTION: Record<ReportState, string> = {
  on: "On · every Monday",
  off: "Off · turn on",
  unavailable: "After parent consent",
};

function buildTools({
  snap,
  plan,
  report,
  referrals,
}: {
  snap: ProgressSnapshot;
  plan: PlanView | null;
  report: ReportState | null;
  referrals: ReferralSummary | null;
}): ToolTile[] {
  const tiles: ToolTile[] = [];
  if (plan) {
    tiles.push({
      key: "plan",
      href: "#board-plan",
      label: "Weekly Board Plan",
      icon: CalendarCheck,
      caption: `${plan.completed} of ${plan.items.length} done`,
    });
  }
  if (snap.weakest.length) {
    tiles.push({
      key: "fix",
      href: "/progress/fix-list",
      label: "Fix List",
      icon: ClipboardList,
      caption: plural(snap.weakest.length, "weak chapter", "weak chapters"),
    });
  }
  if (snap.leakage.lost > 0) {
    tiles.push({
      key: "leak",
      href: "/progress/leakage",
      label: "Leakage Map",
      icon: ChartPie,
      caption: `${fmtMarks(snap.leakage.lost)} marks lost`,
    });
  }
  tiles.push({
    key: "gain",
    href: "/progress/reattempt-gain",
    label: "Reattempt Gain",
    icon: TrendingUp,
    caption: snap.gain.reattempted ? `+${fmtMarks(snap.gain.marksRecovered)} won back` : "No rewrites yet",
  });
  if (report) {
    tiles.push({ key: "report", href: "/account#parent-report", label: "Parent Report", icon: MailCheck, caption: REPORT_CAPTION[report] });
  }
  const invite: ToolTile = {
    key: "invite",
    href: "/invite",
    label: "Invite Friends",
    icon: Gift,
    caption: referrals?.friends.length
      ? `${referrals.friends.length} joined`
      : `+${REFERRAL_WEEKLY_BONUS}/week each`,
  };
  if (tiles.length < 5) {
    tiles.push({
      key: "progress",
      href: "/progress",
      label: "Your Progress",
      icon: ChartNoAxesColumn,
      caption: plural(snap.attempts, "answer marked", "answers marked"),
    });
  }
  return [...tiles.slice(0, 5), invite];
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
        <span className="text-xs text-muted-foreground">
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
        <span className="text-xs text-muted-foreground">Not marked</span>
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
    <section className="mt-10" aria-labelledby="recent-practice">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="recent-practice" className={dashHeading}>
          Recent practice
        </h2>
        <Link href="/history" className={dashLink}>
          All results <ArrowRight size={13} strokeWidth={2} aria-hidden />
        </Link>
      </div>
      <ul className={`${dashCard} mt-4 divide-y divide-border`}>
        {recent.map((item) => {
          const r = viewOf(item);
          return (
            <li key={r.key} className="flex items-center gap-4 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-foreground">{r.title}</p>
                <p className={`${numericFigures} truncate text-xs text-muted-foreground`}>
                  {r.kind} · {r.date}
                </p>
              </div>
              <div className={`${numericFigures} shrink-0 text-right text-sm`}>{r.score}</div>
              <Link
                href={r.href}
                className="shrink-0 text-[13px] font-medium text-accent underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {r.action}
                <span className="sr-only">: {r.title}, {r.kind}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Middleware already sends signed-out visitors to /login; this is the
  // page's own guard, so it never renders an empty shell if that ever lapses
  // (it did once — the file sat outside src/ and silently stopped running).
  if (!user) redirect("/login?next=/dashboard");

  const firstName = (user.user_metadata?.first_name as string | undefined)?.trim();
  const greetingName = firstName || user.email?.split("@")[0] || "there";
  const reportsLive = parentReportsLive();
  const [credits, practice, checklist, referrals, progressRead, gate, reportRow] = await Promise.all([
    readCredits(user.id),
    readDashboardPractice(user.id),
    readFirstWeekChecklist(user.id),
    readReferralSummary(user.id),
    readProgressAttempts(user.id),
    getEvaluationGateState(user.id),
    reportsLive ? readReportRow(user.id) : Promise.resolve(null),
  ]);
  // No progress figures until there is something to say, and none on a failed
  // read: a "0 weeks" built from missing data would be a false statement.
  const progress =
    progressRead?.ok && progressRead.attempts.length ? buildProgressSnapshot(progressRead.attempts) : null;
  const progressFailed = progressRead ? !progressRead.ok : false;
  const { openPaper, latestMarked, recent, loadFailed } = practice;
  const report = reportsLive ? reportState(reportRow) : null;

  // This week's Board Plan, created on first view if the Monday run hasn't
  // reached this student (or they're new this week). Only for students who
  // can be graded right now: every task leads to marking. Any failure —
  // including the table not existing yet — means no card, never a broken page.
  let plan: PlanView | null = null;
  if (user && gate?.allowed && progressRead?.ok && progressRead.attempts.length) {
    try {
      const ensured = await ensureWeeklyPlan(user.id, progressRead.attempts);
      if (ensured) {
        plan = viewPlan(ensured.plan, progressRead.attempts);
        if (ensured.created) {
          const userId = user.id;
          const { weekStart, tasks } = ensured.plan;
          after(() =>
            recordServerEvent({
              eventName: EVENTS.BOARD_PLAN_CREATED,
              userId,
              properties: { source: "dashboard", week_start: weekStart, kinds: tasks.map((t) => t.kind) },
              path: "/dashboard",
            }),
          );
        }
      }
    } catch (err) {
      console.warn("[BoardEdge] dashboard board plan unavailable:", err instanceof Error ? err.message : err);
    }
  }

  // "Returning" = has marked work or any practice on record. A failed read is
  // not evidence of a new student, so it never shows the first-run framing.
  const returning = Boolean(progress) || recent.length > 0 || Boolean(openPaper) || progressFailed || loadFailed;
  const tools = progress ? buildTools({ snap: progress, plan, report, referrals }) : [];
  const now = new Date();

  return (
    <div className={dashboardShell}>
      {/* ─── Greeting ─────────────────────────────────────────────────── */}
      <header className="relative flex items-start justify-between gap-6">
        <div className="min-w-0 max-w-xl">
          <p className={dashEyebrow}>{returning ? `Welcome back · ${todayLabel(now)}` : "Welcome to BoardEdge"}</p>
          <h1 className="mt-2.5 font-display text-[2rem] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-[2.6rem]">
            {greetingFor(now)}, {greetingName}.
          </h1>
          <p className="mt-2 font-display text-lg italic text-foreground/80">Let&rsquo;s make today count.</p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            Practice smarter, identify gaps, and steadily recover the marks you&rsquo;re missing.
          </p>
          {/* Phones only: the top bar's pill is the balance's real home. */}
          {credits ? (
            <p className="mt-3 text-xs text-muted-foreground md:hidden">
              <span className={`${numericFigures} font-semibold text-foreground`}>{credits.remaining}</span> of{" "}
              <span className={numericFigures}>{credits.limit}</span> credits left this week
            </p>
          ) : null}
        </div>
        <HallSketch className="-mt-2 hidden w-56 shrink-0 text-accent/55 sm:block lg:w-64" />
      </header>

      {/* ─── Practice ─────────────────────────────────────────────────── */}
      {/* When the practice reads failed, an open paper may exist that we
          couldn't see — say so above the cards, and offer the retry. */}
      {loadFailed && !openPaper ? (
        <ReloadableError
          className="mt-6"
          title="We couldn’t load your practice"
          message="Your papers and answers are safe — we just couldn’t fetch them this time. Try again to see where you left off."
        />
      ) : null}
      <div className="mt-7">
        <PrimaryActions openPaper={openPaper} />
      </div>

      {/* ─── Preparation tools / first week ───────────────────────────── */}
      {tools.length ? <ToolShortcuts tiles={tools} /> : null}
      {checklist ? <FirstWeekChecklist checklist={checklist} /> : null}
      {!progress && !progressFailed ? (
        <p className="mt-4 text-[13px] text-muted-foreground">
          Your Weekly Board Plan, Leakage Map, Fix List and Reattempt Gain appear here after your first marked answer.
        </p>
      ) : null}

      <SubjectGrid />

      {/* ─── This week ────────────────────────────────────────────────── */}
      {progressFailed ? (
        <ReloadableError
          className="mt-10"
          title="We couldn’t load your progress"
          message="Your marked answers are safe — your Board Plan and progress just didn’t load this time."
        />
      ) : progress ? (
        <section className="mt-10" aria-label="This week">
          <div className={plan ? "grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]" : ""}>
            {plan ? <BoardPlanCard view={plan} /> : null}
            <ProgressSummary snap={progress} latestMarked={latestMarked} />
          </div>
        </section>
      ) : null}

      {/* ─── Recent practice ──────────────────────────────────────────── */}
      {/* Hidden while failed-and-empty: the error above already speaks for it. */}
      {recent.length ? (
        <RecentPractice recent={recent.slice(0, 5)} />
      ) : !loadFailed && returning ? (
        <EmptyState
          compact
          className="mt-10"
          title="Your practice will show up here"
          description="Answer a past-paper question or sit a full paper, and each attempt is listed here with a link to its marked result."
          primary={{ label: "Practice a question", href: "/evaluate" }}
          secondary={{ label: "Build a paper", href: "/practice-paper" }}
        />
      ) : null}
    </div>
  );
}
