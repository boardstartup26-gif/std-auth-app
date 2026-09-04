// src/app/admin/page.tsx
//
// The telemetry dashboard. A Server Component: every figure below is computed
// on the server from a service-role read, and only the finished numbers are
// serialised into HTML. No aggregation query, table name or key reaches the
// browser, and there is no client-side fetch to point at.

import Link from "next/link";
import { requireAdmin } from "@/lib/analytics/admin";
import { getDashboardMetrics } from "@/lib/analytics/aggregate";
import { numericMono, pageShellWide, sectionLabel } from "@/lib/ui";
import {
  BarRow,
  EmptyState,
  FunnelRow,
  Panel,
  StatCard,
  formatNumber,
  formatPercent,
  formatRelative,
} from "./_components/Panels";

const WINDOWS = [7, 30, 90] as const;
const DEFAULT_WINDOW = 30;

function parseWindow(raw: string | undefined): number {
  const parsed = Number(raw);
  return WINDOWS.includes(parsed as (typeof WINDOWS)[number]) ? parsed : DEFAULT_WINDOW;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  // Second of the three guards (layout → here → getDashboardMetrics). Layouts
  // and pages render in parallel in the App Router, so the page cannot lean on
  // the layout having already refused.
  const admin = await requireAdmin();

  const { days } = await searchParams;
  const windowDays = parseWindow(days);
  const metrics = await getDashboardMetrics(windowDays);

  const { kpis, funnel, subjects, errors, abandonment, acquisition, retention, feedback } = metrics;
  const topSubject = subjects[0]?.evaluations ?? 0;
  const topError = errors[0]?.count ?? 0;
  const topSource = acquisition[0]?.visitors ?? 0;
  const topBucket = Math.max(1, ...metrics.evalIndexBuckets.map((b) => b.count));

  return (
    <div className={pageShellWide}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className={sectionLabel}>BoardEdge · Internal</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Product telemetry
          </h1>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {admin.email ?? "Admin"} · {formatNumber(metrics.totalEvents)} events in the last{" "}
            {metrics.windowDays} days · updated {formatRelative(metrics.generatedAt)}
          </p>
        </div>

        {/* Plain links, not a client component — the whole page is a server
            render, so changing the window is just another request. */}
        <nav className="flex shrink-0 gap-2" aria-label="Time window">
          {WINDOWS.map((w) => {
            const active = w === metrics.windowDays;
            return (
              <Link
                key={w}
                href={`/admin?days=${w}`}
                aria-current={active ? "page" : undefined}
                className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                  active
                    ? "border-accent bg-accent-subtle text-accent"
                    : "border-border bg-card text-muted-foreground hover:bg-surface-raised"
                }`}
              >
                {w}d
              </Link>
            );
          })}
        </nav>
      </header>

      {metrics.truncated ? (
        <p className="mt-6 rounded-xl border border-status-partial bg-status-partial-subtle px-4 py-3 text-xs text-status-partial">
          Row cap reached for this window — every figure below is a lower bound.
          Narrow the window for exact numbers.
        </p>
      ) : null}

      {/* ── KPIs ──────────────────────────────────────────────────────── */}
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Visitors"
          value={formatNumber(kpis.visitors)}
          sub="Unique browsers"
        />
        <StatCard
          label="Signups"
          value={formatNumber(kpis.signups)}
          sub={`${formatPercent(kpis.visitors ? kpis.signups / kpis.visitors : null, 1)} of visitors`}
        />
        <StatCard
          label="Evaluations"
          value={formatNumber(kpis.evaluations)}
          sub={
            kpis.evaluationsPerStudent !== null
              ? `${kpis.evaluationsPerStudent.toFixed(1)} per active student`
              : "No activity yet"
          }
        />
        <StatCard
          label="Failure rate"
          value={formatPercent(kpis.failureRate, 1)}
          sub={`${formatNumber(metrics.errorTotal)} failed evaluations`}
          tone={kpis.failureRate !== null && kpis.failureRate > 0.05 ? "bad" : "good"}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* ── Funnel ──────────────────────────────────────────────────── */}
        <Panel
          title="Lifecycle funnel"
          subtitle="Distinct people per step. Anonymous visitors are stitched to their account once they sign up, so one student counts once end to end."
        >
          <div className="divide-y divide-border">
            {funnel.map((step) => (
              <FunnelRow
                key={step.key}
                label={step.label}
                count={step.count}
                share={step.conversionFromTop ?? 0}
                fromPrevious={step.conversionFromPrevious}
                hint={step.hint}
              />
            ))}
          </div>
        </Panel>

        {/* ── Subjects ────────────────────────────────────────────────── */}
        <Panel title="Subject popularity" subtitle="Completed evaluations by subject.">
          {subjects.length === 0 ? (
            <EmptyState>No evaluations in this window.</EmptyState>
          ) : (
            <div className="divide-y divide-border">
              {subjects.map((s) => (
                <BarRow
                  key={s.subject}
                  label={s.subject}
                  value={formatNumber(s.evaluations)}
                  share={topSubject ? s.evaluations / topSubject : 0}
                  meta={`${formatPercent(s.share)} · ${formatNumber(s.students)} students${
                    s.averageScore !== null ? ` · avg ${formatPercent(s.averageScore)}` : ""
                  }`}
                />
              ))}
            </div>
          )}
        </Panel>

        {/* ── Errors ──────────────────────────────────────────────────── */}
        <Panel
          title="Evaluation failures"
          subtitle="Where evaluations died, by stage. Recorded server-side, so a student who never saw a result is still counted."
        >
          {errors.length === 0 ? (
            <EmptyState>No failed evaluations in this window.</EmptyState>
          ) : (
            <div className="divide-y divide-border">
              {errors.map((e) => (
                <div key={e.stage} className="py-2">
                  <BarRow
                    label={e.label}
                    value={formatNumber(e.count)}
                    share={topError ? e.count / topError : 0}
                    meta={formatRelative(e.lastSeen)}
                    // Running out of tokens is the product working as designed;
                    // colouring it like a crash would bury the real crashes.
                    tone={e.stage === "quota_exceeded" ? "warn" : "bad"}
                  />
                  {e.sampleReason ? (
                    <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                      {e.sampleReason}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* ── Retention ───────────────────────────────────────────────── */}
        <Panel
          title="Retention"
          subtitle="Cohorts are signups old enough to have had the chance to return — a student who joined this morning is not counted as a D1 loss."
        >
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "D1 return", stat: retention.d1 },
              { label: "D7 return", stat: retention.d7 },
              { label: "Within 7d", stat: retention.within7d },
            ].map(({ label, stat }) => (
              <div key={label} className="rounded-xl border border-border bg-card/60 p-3">
                <p className={sectionLabel}>{label}</p>
                <p className={`mt-2 text-xl font-bold ${numericMono} text-foreground`}>
                  {formatPercent(stat.rate)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {formatNumber(stat.returned)} of {formatNumber(stat.cohortSize)}
                </p>
              </div>
            ))}
          </div>

          {metrics.windowDays < 8 ? (
            <p className="mt-3 text-[11px] text-muted-foreground">
              A D7 cohort needs at least 8 days of history — switch to 30d or 90d to populate it.
            </p>
          ) : null}

          <div className="mt-5 border-t border-border pt-4">
            <p className={sectionLabel}>Repeat usage</p>
            <div className="mt-2 divide-y divide-border">
              {metrics.evalIndexBuckets.map((b) => (
                <BarRow
                  key={b.label}
                  label={b.label}
                  value={formatNumber(b.count)}
                  share={b.count / topBucket}
                />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {formatPercent(kpis.repeatEvaluationRate)} of students who got one evaluation came
              back for a second.
            </p>
          </div>
        </Panel>

        {/* ── Acquisition ─────────────────────────────────────────────── */}
        <Panel
          title="Acquisition"
          subtitle="First-touch source: UTM tag if present, otherwise the external referrer."
        >
          {acquisition.length === 0 ? (
            <EmptyState>No traffic recorded in this window.</EmptyState>
          ) : (
            <div className="divide-y divide-border">
              {acquisition.map((a) => (
                <BarRow
                  key={a.source}
                  label={a.source}
                  value={formatNumber(a.visitors)}
                  share={topSource ? a.visitors / topSource : 0}
                  meta={`${formatNumber(a.signups)} signups`}
                />
              ))}
            </div>
          )}
        </Panel>

        {/* ── Drop-off + feedback ─────────────────────────────────────── */}
        <Panel
          title="Drop-off and feedback"
          subtitle="Abandonment excludes questions the student came back and submitted later, so it under-reports rather than over-reports."
        >
          <p className={sectionLabel}>Abandoned attempts</p>
          {abandonment.length === 0 ? (
            <div className="mt-2">
              <EmptyState>Nothing abandoned in this window.</EmptyState>
            </div>
          ) : (
            <div className="mt-2 divide-y divide-border">
              {abandonment.map((a) => (
                <BarRow
                  key={a.stage}
                  label={a.label}
                  value={formatNumber(a.count)}
                  share={metrics.abandonmentTotal ? a.count / metrics.abandonmentTotal : 0}
                  tone="warn"
                />
              ))}
            </div>
          )}

          <div className="mt-5 border-t border-border pt-4">
            <p className={sectionLabel}>Student feedback</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
              <span className={`font-semibold ${numericMono} text-foreground`}>
                {formatNumber(feedback.total)} total
              </span>
              <span className={`${numericMono} text-status-correct`}>
                {formatNumber(feedback.thumbsUp)} up
              </span>
              <span className={`${numericMono} text-status-wrong`}>
                {formatNumber(feedback.thumbsDown)} down
              </span>
            </div>

            {feedback.tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {feedback.tags.map((t) => (
                  <span
                    key={t.tag}
                    className="rounded-full border border-border bg-card px-3 py-1 text-[11px] text-muted-foreground"
                  >
                    {t.tag} · <span className={numericMono}>{t.count}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground">No issue tags reported yet.</p>
            )}
          </div>
        </Panel>
      </div>

      <p className="mt-8 text-center text-[11px] text-muted-foreground">
        Server-rendered from public.analytics_events · visible to admin accounts only
      </p>
    </div>
  );
}
