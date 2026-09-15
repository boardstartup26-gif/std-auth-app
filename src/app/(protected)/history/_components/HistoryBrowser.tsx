"use client";

// The interactive half of the History page: search, filters, sort, and the
// expand-an-entry-into-its-attempts behaviour.
//
// It receives a pre-derived view model, never raw evaluation rows. The card is
// explicitly not allowed to show the student's answer text or the examiner's
// feedback — those stay exclusive to the Results page — so the server hands
// over only the one-line loss summary it derived, and the full evaluation is
// never serialised into the client bundle at all. Keeping the boundary here
// makes that structural rather than a rule someone has to remember.

import { createElement, useMemo, useState } from "react";
import Link from "next/link";
import {
  Atom,
  BookOpen,
  ChevronDown,
  FlaskConical,
  Globe2,
  Landmark,
  Leaf,
  type LucideIcon,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { numericFigures, scoreBadgeClass } from "@/lib/ui";
import type { HistoryGroup } from "@/lib/history";

// One small, consistent mark per subject. Deliberately monochrome — §1 of the
// design system reserves colour for meaning, and a subject is not a status.
const SUBJECT_ICONS: Record<string, LucideIcon> = {
  Physics: Atom,
  Chemistry: FlaskConical,
  Biology: Leaf,
  Geography: Globe2,
  "History & Civics": Landmark,
  "English Literature": BookOpen,
};

// Rendered through createElement rather than aliasing the looked-up icon to a
// capitalised local (`const Icon = ...; <Icon />`). That alias reads to the
// React Compiler as a component created during render, which it rejects — and
// the lint rule is right in general even though this particular value comes
// from a frozen module-level map.
function SubjectMark({ subject, className }: { subject: string; className?: string }) {
  return createElement(SUBJECT_ICONS[subject] ?? BookOpen, {
    size: 16,
    strokeWidth: 1.75,
    className,
    "aria-hidden": true,
  });
}

const SORTS = {
  newest: "Newest",
  oldest: "Oldest",
  lowest: "Lowest score",
  highest: "Highest score",
} as const;
type SortKey = keyof typeof SORTS;

const SCORE_BANDS = {
  all: "Any score",
  full: "Full marks",
  partial: "Partial credit",
  zero: "No marks",
} as const;
type ScoreBand = keyof typeof SCORE_BANDS;

const DATE_RANGES = {
  all: "All time",
  "7": "Last 7 days",
  "30": "Last 30 days",
  "90": "Last 90 days",
} as const;
type DateRange = keyof typeof DATE_RANGES;

const selectClass =
  "h-9 min-w-0 rounded-lg border border-border bg-card px-2.5 text-xs text-foreground " +
  "outline-none transition-colors focus:border-accent";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The score trail across attempts: 3/5 → 4/5 → 5/5 ↑ */
function ScoreTrail({ group }: { group: HistoryGroup }) {
  const arrow = group.trend === "up" ? "↑" : group.trend === "down" ? "↓" : null;
  return (
    <span className={`${numericFigures} text-[11px] text-muted-foreground`}>
      {group.attempts.map((a, i) => (
        <span key={a.id}>
          {i > 0 ? <span className="px-1">→</span> : null}
          <span className={i === group.attempts.length - 1 ? "text-foreground" : undefined}>
            {a.awarded}/{a.totalMarks}
          </span>
        </span>
      ))}
      {arrow ? (
        <span
          className={`ml-1.5 ${group.trend === "up" ? "text-status-correct" : "text-status-wrong"}`}
          title={group.trend === "up" ? "Improving" : "Declining"}
        >
          {arrow}
        </span>
      ) : null}
    </span>
  );
}

function GroupRow({ group }: { group: HistoryGroup }) {
  const [open, setOpen] = useState(false);
  const { latest } = group;
  const repeated = group.attempts.length > 1;

  return (
    <article className="border-b border-border py-5">
      <div className="flex items-start gap-3">
        <SubjectMark
          subject={group.subject}
          className="mt-0.5 shrink-0 text-muted-foreground"
        />

        <div className="min-w-0 flex-1">
          {/* Rail-face metadata: subject, chapter, topic, type */}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            <span className="font-semibold text-foreground">{group.subject}</span>
            {group.chapter ? <span aria-hidden>·</span> : null}
            {group.chapter ? <span>{group.chapter}</span> : null}
            {group.topic && group.topic !== group.chapter ? <span aria-hidden>·</span> : null}
            {group.topic && group.topic !== group.chapter ? <span>{group.topic}</span> : null}
          </p>

          <p className="mt-1.5 line-clamp-2 text-[15px] leading-snug text-foreground">
            {group.questionText || "Question text unavailable"}
          </p>

          {/* The loss summary — a one-line derivative, never the report itself. */}
          <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
            {latest.lossSummary}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className={`${numericFigures} text-[11px] text-muted-foreground`}>
              {group.year ? `${group.year} · ` : ""}Q{group.questionNumber}
            </span>
            <span className={`${numericFigures} text-[11px] text-muted-foreground`}>
              {formatDate(latest.submittedAt)}
            </span>
            {repeated ? (
              <>
                <span className="text-[11px] text-muted-foreground">
                  {group.attempts.length} attempts
                </span>
                <ScoreTrail group={group} />
              </>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className={scoreBadgeClass(latest.awarded, latest.totalMarks)}>
            {latest.awarded}/{latest.totalMarks}
          </span>
          {latest.percent !== null ? (
            <span className={`${numericFigures} text-[11px] text-muted-foreground`}>
              {latest.percent}%
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 pl-7">
        <Link
          href={`/history/${latest.id}`}
          className="text-[13px] font-medium text-accent transition-colors hover:text-accent-hover"
        >
          View Evaluation →
        </Link>

        {repeated ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown
              size={14}
              className={`transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden
            />
            {open ? "Hide attempts" : `All ${group.attempts.length} attempts`}
          </button>
        ) : null}
      </div>

      {open && repeated ? (
        <ol className="mt-3 ml-7 border-l border-border pl-4">
          {/* Newest first here — the collapsed row already says where it ended
              up, so the expanded list is for working backwards. */}
          {[...group.attempts].reverse().map((a, i) => (
            <li key={a.id} className="flex items-start gap-3 py-2">
              <span className={`${numericFigures} w-14 shrink-0 text-[11px] text-muted-foreground`}>
                #{group.attempts.length - i}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`${numericFigures} text-[11px] text-muted-foreground`}>
                  {formatDateTime(a.submittedAt)}
                </p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{a.lossSummary}</p>
              </div>
              <span className={`${numericFigures} shrink-0 text-xs text-foreground`}>
                {a.awarded}/{a.totalMarks}
              </span>
              <Link
                href={`/history/${a.id}`}
                className="shrink-0 text-[12px] text-accent transition-colors hover:text-accent-hover"
              >
                View
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
    </article>
  );
}

export function HistoryBrowser({ groups }: { groups: HistoryGroup[] }) {
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("all");
  const [topic, setTopic] = useState("all");
  const [type, setType] = useState("all");
  const [band, setBand] = useState<ScoreBand>("all");
  const [range, setRange] = useState<DateRange>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  // Date.now() read during render is impure (the React Compiler rejects it),
  // and a cutoff that silently slid forward while the student was reading
  // would be wrong anyway. Fixed once, when the list mounts.
  const [now] = useState(() => Date.now());

  const subjects = useMemo(
    () => [...new Set(groups.map((g) => g.subject))].sort(),
    [groups]
  );

  // Topic options follow the chosen subject — offering every topic across all
  // subjects would list hundreds, most of which filter to nothing.
  const topics = useMemo(() => {
    const pool = subject === "all" ? groups : groups.filter((g) => g.subject === subject);
    return [...new Set(pool.map((g) => g.topic).filter((t): t is string => !!t))].sort();
  }, [groups, subject]);

  const types = useMemo(
    () => [...new Set(groups.map((g) => g.questionType).filter((t): t is string => !!t))].sort(),
    [groups]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cutoff = range === "all" ? null : now - Number(range) * 86_400_000;

    const filtered = groups.filter((g) => {
      if (q && !g.questionText.toLowerCase().includes(q)) return false;
      if (subject !== "all" && g.subject !== subject) return false;
      if (topic !== "all" && g.topic !== topic) return false;
      if (type !== "all" && g.questionType !== type) return false;
      if (cutoff !== null && Date.parse(g.latest.submittedAt) < cutoff) return false;
      if (band !== "all") {
        const p = g.latest.percent;
        if (p === null) return false;
        if (band === "full" && p < 100) return false;
        if (band === "partial" && (p <= 0 || p >= 100)) return false;
        if (band === "zero" && p > 0) return false;
      }
      return true;
    });

    const byDate = (a: HistoryGroup, b: HistoryGroup) =>
      Date.parse(a.latest.submittedAt) - Date.parse(b.latest.submittedAt);
    const byScore = (a: HistoryGroup, b: HistoryGroup) =>
      (a.latest.percent ?? -1) - (b.latest.percent ?? -1);

    const sorted = [...filtered];
    if (sort === "newest") sorted.sort((a, b) => byDate(b, a));
    else if (sort === "oldest") sorted.sort(byDate);
    else if (sort === "lowest") sorted.sort(byScore);
    else sorted.sort((a, b) => byScore(b, a));
    return sorted;
  }, [groups, query, subject, topic, type, band, range, sort, now]);

  const attemptCount = useMemo(
    () => visible.reduce((n, g) => n + g.attempts.length, 0),
    [visible]
  );

  // Changing subject can strand a topic selection that no longer exists.
  const topicValue = topics.includes(topic) ? topic : "all";

  return (
    <div>
      <div className="flex flex-col gap-3">
        <label className="relative block">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search question text"
            aria-label="Search question text"
            className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-accent"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal
            size={14}
            className="shrink-0 text-muted-foreground"
            aria-hidden
          />
          <select
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setTopic("all");
            }}
            aria-label="Filter by subject"
            className={selectClass}
          >
            <option value="all">All subjects</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={topicValue}
            onChange={(e) => setTopic(e.target.value)}
            aria-label="Filter by topic"
            className={selectClass}
            disabled={!topics.length}
          >
            <option value="all">All topics</option>
            {topics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Filter by question type"
            className={selectClass}
          >
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>

          <select
            value={band}
            onChange={(e) => setBand(e.target.value as ScoreBand)}
            aria-label="Filter by score"
            className={selectClass}
          >
            {Object.entries(SCORE_BANDS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={range}
            onChange={(e) => setRange(e.target.value as DateRange)}
            aria-label="Filter by date"
            className={selectClass}
          >
            {Object.entries(DATE_RANGES).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort"
            className={`${selectClass} ml-auto`}
          >
            {Object.entries(SORTS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="mt-4 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        {visible.length === groups.length
          ? `${groups.length} questions · ${attemptCount} attempts`
          : `${visible.length} of ${groups.length} questions`}
      </p>

      <div className="mt-2 border-t border-border">
        {visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nothing matches these filters.
          </p>
        ) : (
          visible.map((g) => <GroupRow key={g.key} group={g} />)
        )}
      </div>
    </div>
  );
}
