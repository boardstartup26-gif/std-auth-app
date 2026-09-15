"use client";

// The five-step funnel of handoff §12: Subject → Chapter → Topic → Answer
// format → Browse, then a question commits the choice.
//
// One step is on screen at a time. The previous version put all five inputs in
// a single strip of native <select>s, which meant a student arriving at the
// page met six controls, five of them disabled, with no indication of which to
// touch first — and the question list, the only step where the choosing
// actually happens, was hidden inside a dropdown that clipped the question text
// it existed to show. Here each step is a list of real options with counts, and
// Browse is a list on the page rather than a popover.
//
// Answered choices collapse upward into a breadcrumb; clicking a crumb reopens
// that step and clears everything below it, so a wrong turn costs one click
// rather than a restart. Once a question is picked the whole funnel collapses
// to a single line — the answer view needs the page more than the filters do.
//
// The picker owns chapter/topic/format/year/search and nothing else. Subject
// lives in the page because the query keys off it; the page remounts this
// component when subject changes (key={subject}), which resets the four inner
// filters without a cascade of effects.

import { useState } from "react";
import { ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import {
  ANSWER_FORMAT_LABELS,
  DIAGRAM_FORMAT_DISABLED,
  normalizeAnswerFormat,
  type AnswerFormat,
} from "@/lib/question-format";
import { inputBase, numericFigures } from "@/lib/ui";
import { displayPaper, OTHER_BUCKET, SUBJECTS, totalMarksOf, type Question } from "../_lib/question";

// ─── Bits ─────────────────────────────────────────────────────────────────────

interface Bucket {
  value: string;
  label: string;
  count: number;
  disabled?: boolean;
}

/** Group a list into labelled buckets with counts, "Other" always last. */
function bucketBy(
  list: Question[],
  keyOf: (q: Question) => string,
  labelOf: (q: Question) => string
): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const q of list) {
    const value = keyOf(q);
    const existing = map.get(value);
    if (existing) existing.count += 1;
    else map.set(value, { value, label: labelOf(q), count: 1 });
  }
  return [...map.values()].sort((a, b) =>
    a.value === OTHER_BUCKET ? 1 : b.value === OTHER_BUCKET ? -1 : a.label.localeCompare(b.label)
  );
}

// The eyebrow names the stage rather than numbering it. A step whose only
// option repeats the previous answer is skipped (see below), so a counted
// "Step 3 of 5" would jump from 2 to 4 and read as a bug. The breadcrumb above
// already shows how far along the student is, and it shows it truthfully.
function StepHead({ stage, title, hint }: { stage: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {stage}
      </span>
      <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

/**
 * One option in steps 1–4. A button, not a radio: nothing here is submitted as
 * a form value, and choosing advances the funnel rather than filling a field.
 *
 * min-w-0 sits on the button itself, not only on the label inside it. A grid
 * item defaults to min-width:auto, so the truncated — and therefore nowrap —
 * chapter name set the column's min-content width to the whole string:
 * "Periodic Table, Periodic Properties & Variations in Properties" pushed the
 * page 99px wider than a 375px phone and scrolled the whole thing sideways.
 */
function Choice({
  label,
  count,
  note,
  disabled,
  onClick,
}: {
  label: string;
  count?: number;
  note?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:border-accent hover:bg-accent-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-border disabled:hover:bg-card"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{label}</span>
        {note ? <span className="block text-xs text-muted-foreground">{note}</span> : null}
      </span>
      {count != null ? (
        <span className={`shrink-0 text-xs text-muted-foreground ${numericFigures}`}>{count}</span>
      ) : null}
    </button>
  );
}

/** The answered steps, as a row of crumbs that step back when clicked. */
function Crumbs({ items }: { items: { label: string; onClear: () => void }[] }) {
  if (!items.length) return null;
  return (
    <nav aria-label="Chosen filters" className="flex flex-wrap items-center gap-1.5">
      {items.map((item, i) => (
        <span key={item.label} className="flex items-center gap-1.5">
          {i > 0 ? <ChevronRight size={13} className="text-muted-foreground/60" aria-hidden /> : null}
          <button
            type="button"
            onClick={item.onClear}
            title={`Change: ${item.label}`}
            className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-3 pr-2 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
          >
            <span className="truncate">{item.label}</span>
            <X size={12} className="shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </span>
      ))}
    </nav>
  );
}

function yearChip(active: boolean): string {
  return `rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
    active
      ? "border-accent bg-accent-subtle text-accent"
      : "border-border bg-card text-muted-foreground hover:border-accent hover:text-accent"
  }`;
}

// ─── Picker ───────────────────────────────────────────────────────────────────

export function QuestionPicker({
  subject,
  onSubjectChange,
  questions,
  loading,
  selectedId,
  onSelect,
}: {
  subject: string;
  onSubjectChange: (s: string) => void;
  /** Every question for the chosen subject, all years and papers. */
  questions: Question[];
  loading: boolean;
  selectedId: string;
  /** "" clears the selection and reopens Browse with the filters intact. */
  onSelect: (id: string) => void;
}) {
  const [chapter, setChapter] = useState("");
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState<AnswerFormat | "">("");
  const [year, setYear] = useState<number | "">("");
  const [search, setSearch] = useState("");

  // ── Narrowing, one stage at a time ──
  //
  // A stage offering exactly one option is not a choice, so it resolves itself
  // and the student never sees it. This is not hypothetical tidying: every
  // Chemistry row stores topic identical to chapter, so picking "Electrolysis"
  // as the chapter led to a Topic stage whose single button said
  // "Electrolysis" — a mandatory click that narrowed nothing. The auto-picked
  // value gets no breadcrumb either: a crumb that cleared it would land back
  // on a stage that immediately resolves the same way, so the student would
  // click it and see nothing happen.
  const chapters = bucketBy(
    questions,
    (q) => q.chapter ?? OTHER_BUCKET,
    (q) => q.chapter ?? "Other"
  );
  const autoChapter = !chapter && chapters.length === 1 ? chapters[0].value : "";
  const activeChapter = chapter || autoChapter;

  const inChapter = activeChapter
    ? questions.filter((q) => (q.chapter ?? OTHER_BUCKET) === activeChapter)
    : [];

  const topics = bucketBy(
    inChapter,
    (q) => q.topic?.trim() || OTHER_BUCKET,
    (q) => q.topic?.trim() || "Other"
  );
  const autoTopic = !topic && topics.length === 1 ? topics[0].value : "";
  const activeTopic = topic || autoTopic;

  const inTopic = activeTopic
    ? inChapter.filter((q) => (q.topic?.trim() || OTHER_BUCKET) === activeTopic)
    : [];

  const formats = bucketBy(
    inTopic,
    (q) => normalizeAnswerFormat(q),
    (q) => ANSWER_FORMAT_LABELS[normalizeAnswerFormat(q)]
  ).map((b) => ({ ...b, disabled: b.value === "diagram" && DIAGRAM_FORMAT_DISABLED }));
  // Never auto-pick a format that cannot be graded — that would drop the
  // student straight into an empty Browse with no way back except the crumbs.
  const autoFormat =
    !format && formats.length === 1 && !formats[0].disabled ? formats[0].value : "";
  const activeFormat = (format || autoFormat) as AnswerFormat | "";

  const inFormat = activeFormat
    ? inTopic.filter((q) => normalizeAnswerFormat(q) === activeFormat)
    : [];

  // Year and search refine Browse; they are not steps of their own.
  const years = [...new Set(inFormat.map((q) => q.year))].sort((a, b) => b - a);
  const inYear = year ? inFormat.filter((q) => q.year === year) : inFormat;

  // Substring, not prefix. This was a startsWith match, which made the box
  // useless for the thing it is for: a student hunting the electrolysis
  // questions types "electrolysis" and gets nothing back, because the questions
  // themselves begin "Give a reason why…".
  const term = search.trim().toLowerCase();
  const results = term ? inYear.filter((q) => q.question_text?.toLowerCase().includes(term)) : inYear;

  const step = !subject ? 1 : !activeChapter ? 2 : !activeTopic ? 3 : !activeFormat ? 4 : 5;

  // Clearing a crumb clears every narrower choice with it, and drops any loaded
  // question — that question is no longer inside the filters on screen.
  function clearFromChapter() {
    setChapter("");
    setTopic("");
    setFormat("");
    setYear("");
    setSearch("");
    onSelect("");
  }
  function clearFromTopic() {
    setTopic("");
    setFormat("");
    setYear("");
    setSearch("");
    onSelect("");
  }
  function clearFromFormat() {
    setFormat("");
    setYear("");
    setSearch("");
    onSelect("");
  }

  const crumbs: { label: string; onClear: () => void }[] = [];
  if (subject) crumbs.push({ label: subject, onClear: () => onSubjectChange("") });
  if (chapter) {
    crumbs.push({
      label: chapters.find((c) => c.value === chapter)?.label ?? "Chapter",
      onClear: clearFromChapter,
    });
  }
  if (topic) {
    crumbs.push({
      label: topics.find((t) => t.value === topic)?.label ?? "Topic",
      onClear: clearFromTopic,
    });
  }
  if (format) {
    crumbs.push({ label: ANSWER_FORMAT_LABELS[format], onClear: clearFromFormat });
  }

  // ── Collapsed: a question is loaded, and the page belongs to it ──
  if (selectedId) {
    return (
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Crumbs items={crumbs} />
        <button
          type="button"
          onClick={() => onSelect("")}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
        >
          <SlidersHorizontal size={13} aria-hidden />
          Change question
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 flex flex-col gap-5">
      <Crumbs items={crumbs} />

      {/* ── Step 1 · Subject ── */}
      {step === 1 && (
        <section className="flex flex-col gap-3">
          <StepHead stage="Subject" title="Choose a subject" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SUBJECTS.map((name) => (
              <Choice key={name} label={name} onClick={() => onSubjectChange(name)} />
            ))}
          </div>
        </section>
      )}

      {/* ── Step 2 · Chapter ── */}
      {step === 2 && (
        <section className="flex flex-col gap-3">
          <StepHead
            stage="Chapter"
            title="Choose a chapter"
            hint={loading ? undefined : `${questions.length} questions in ${subject}`}
          />
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading {subject} questions…</p>
          ) : chapters.length ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {chapters.map((c) => (
                <Choice
                  key={c.value}
                  label={c.label}
                  count={c.count}
                  onClick={() => setChapter(c.value)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No questions are loaded for {subject} yet.
            </p>
          )}
        </section>
      )}

      {/* ── Step 3 · Topic ── */}
      {step === 3 && (
        <section className="flex flex-col gap-3">
          <StepHead stage="Topic" title="Choose a topic" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map((t) => (
              <Choice
                key={t.value}
                label={t.label}
                count={t.count}
                onClick={() => setTopic(t.value)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Step 4 · Answer format ── */}
      {step === 4 && (
        <section className="flex flex-col gap-3">
          <StepHead stage="Answer format" title="Choose an answer format" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {formats.map((f) => (
              <Choice
                key={f.value}
                label={f.label}
                count={f.count}
                // Shown disabled rather than hidden: the questions do exist,
                // and dropping them would make the chapter counts look wrong.
                note={f.disabled ? "Not gradeable yet" : undefined}
                disabled={f.disabled}
                onClick={() => setFormat(f.value as AnswerFormat)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Step 5 · Browse ── */}
      {step === 5 && (
        <section className="flex flex-col gap-4">
          <StepHead
            stage="Browse"
            title="Pick a question"
            hint={`${results.length} of ${inFormat.length} shown`}
          />

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[16rem] flex-1">
              <Search
                size={15}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search the question text…"
                aria-label="Search question text"
                className={`${inputBase} h-10 w-full pl-9 pr-3`}
              />
            </div>

            {years.length > 1 ? (
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label="Filter by year"
              >
                <button
                  type="button"
                  aria-pressed={year === ""}
                  onClick={() => setYear("")}
                  className={yearChip(year === "")}
                >
                  All years
                </button>
                {years.map((y) => (
                  <button
                    key={y}
                    type="button"
                    aria-pressed={year === y}
                    onClick={() => setYear(y)}
                    className={`${yearChip(year === y)} ${numericFigures}`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {results.length ? (
            <ul className="flex flex-col gap-2">
              {results.map((q) => {
                const marks = totalMarksOf(q);
                return (
                  <li key={q.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(q.id)}
                      className="flex w-full flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-accent hover:bg-accent-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className={`font-semibold text-foreground ${numericFigures}`}>
                          Q{q.question_number}
                        </span>
                        <span aria-hidden>·</span>
                        <span className={numericFigures}>
                          {q.year} Paper {displayPaper(q.paper)}
                        </span>
                        {marks != null ? (
                          <>
                            <span aria-hidden>·</span>
                            <span className={numericFigures}>
                              {marks} mark{marks === 1 ? "" : "s"}
                            </span>
                          </>
                        ) : null}
                      </div>
                      <p className="m-0 line-clamp-3 text-sm leading-relaxed text-foreground">
                        {q.question_text?.trim() || (
                          <span className="italic text-muted-foreground">
                            Question text not yet available
                          </span>
                        )}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              {term
                ? `No question in this topic contains “${search.trim()}”.`
                : "No questions match these filters."}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
