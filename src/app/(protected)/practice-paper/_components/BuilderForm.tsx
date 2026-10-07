"use client";

import { startTransition, useActionState, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { btnPrimary, errorAlert, inputBase, numericFigures } from "@/lib/ui";
import { CREDIT_COST_OBJECTIVE, CREDIT_COST_SUBJECTIVE } from "@/lib/constants";
import {
  approxMinutes,
  fitPreset,
  LENGTH_PRESETS,
  MAX_QUESTIONS,
  MAX_TARGET_MARKS,
  SET_TYPES,
  type Difficulty,
  type PaperLength,
  type SetType,
  type SubjectAvailability,
} from "@/lib/practice-sets/constants";
import { buildPracticeSet, type BuildState } from "../actions";

// ─── Small controls ──────────────────────────────────────────────────────────

const pill =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm transition-colors hover:border-foreground/30 has-[:checked]:border-accent has-[:checked]:bg-accent-subtle has-[:checked]:text-foreground has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent";

const segmentWrap = "grid auto-cols-fr grid-flow-col rounded-xl border border-border bg-card p-1";
const segment =
  "relative flex cursor-pointer flex-col items-center justify-center rounded-lg px-3 py-2 text-center text-sm text-muted-foreground transition-colors hover:text-foreground has-[:checked]:bg-accent-subtle has-[:checked]:font-medium has-[:checked]:text-foreground has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent";

function Field({ label, aside, children }: { label: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-rule py-6 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-4">
        <legend className="text-sm font-semibold text-foreground">{label}</legend>
        {aside ? <span className="text-xs text-muted-foreground">{aside}</span> : null}
      </div>
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}

function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: { value: T; label: string; detail?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className={segmentWrap}>
      {options.map((o) => (
        <label key={o.value} className={segment}>
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          <span>{o.label}</span>
          {o.detail ? <span className="mt-0.5 text-[11px] font-normal text-muted-foreground">{o.detail}</span> : null}
        </label>
      ))}
    </div>
  );
}

const DIFFICULTY_LABEL: Record<Difficulty, string> = { any: "Mixed", easier: "Easier", harder: "Harder" };

function clampTo(counts: Record<SetType, number>, cap: Record<SetType, number>): Record<SetType, number> {
  return {
    objective: Math.min(counts.objective, cap.objective),
    short: Math.min(counts.short, cap.short),
    long: Math.min(counts.long, cap.long),
  };
}

// ─── Builder ─────────────────────────────────────────────────────────────────

export function BuilderForm({
  availability,
  creditsRemaining,
  initialSubject,
}: {
  availability: SubjectAvailability[];
  creditsRemaining: number | null;
  initialSubject?: string;
}) {
  const [state, formAction, pending] = useActionState<BuildState, FormData>(buildPracticeSet, null);
  const [subject, setSubject] = useState(
    availability.find((a) => a.subject === initialSubject)?.subject ?? availability[0]?.subject ?? "",
  );
  const [scope, setScope] = useState<"whole" | "chapters">("whole");
  const [chapters, setChapters] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>("any");
  const [length, setLength] = useState<PaperLength>("standard");
  const [custom, setCustom] = useState<Record<SetType, number>>(LENGTH_PRESETS.standard);
  const [target, setTarget] = useState("");
  const [skipMastered, setSkipMastered] = useState(true);

  const info = availability.find((a) => a.subject === subject);
  const level: Difficulty = info?.difficultyLabelled ? difficulty : "any";
  const cap = info?.available[level] ?? { objective: 0, short: 0, long: 0 };

  // Presets are recipes fitted to the subject; Custom is whatever the student
  // set, kept within what the subject can supply.
  const counts = length === "custom" ? clampTo(custom, cap) : fitPreset(LENGTH_PRESETS[length], cap);
  const total = counts.objective + counts.short + counts.long;
  const targetMarks = length === "custom" && target ? Number(target) : null;
  const estimatedMarks = info
    ? Math.round(SET_TYPES.reduce((s, t) => s + counts[t.key] * info.avgMarks[t.key], 0))
    : 0;
  const marks = targetMarks ?? estimatedMarks;
  const credits = counts.objective * CREDIT_COST_OBJECTIVE + (counts.short + counts.long) * CREDIT_COST_SUBJECTIVE;
  const needsChapters = scope === "chapters" && chapters.length === 0;

  const presetSize = (p: Exclude<PaperLength, "custom">) => {
    const c = fitPreset(LENGTH_PRESETS[p], cap);
    return c.objective + c.short + c.long;
  };

  const changeSubject = (next: string) => {
    setSubject(next);
    setChapters([]);
    setScope("whole");
  };

  const startCustom = () => {
    // Custom opens on what was showing, so switching doesn't reset the paper.
    if (length !== "custom") setCustom(counts);
    setLength("custom");
  };

  const step = (key: SetType, delta: number) =>
    setCustom(() => {
      const current = counts;
      const limit = Math.min(SET_TYPES.find((t) => t.key === key)!.max, cap[key]);
      const next = Math.max(0, Math.min(limit, current[key] + delta));
      const others = total - current[key];
      return { ...current, [key]: Math.min(next, MAX_QUESTIONS - others) };
    });

  return (
    // onSubmit + startTransition rather than <form action>: React resets a form
    // after an action-prop submission, which would wipe these controlled
    // choices when the server says "not enough questions".
    <form
      className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <Field label="Subject">
          <div className="flex flex-wrap gap-2">
            {availability.map((a) => (
              <label key={a.subject} className={pill}>
                <input
                  type="radio"
                  name="subject"
                  value={a.subject}
                  checked={subject === a.subject}
                  onChange={() => changeSubject(a.subject)}
                  className="sr-only"
                />
                {a.subject}
              </label>
            ))}
          </div>
        </Field>

        <Field
          label="Syllabus"
          aside={scope === "chapters" && chapters.length ? `${chapters.length} selected` : undefined}
        >
          <Segmented
            name="scope"
            value={scope}
            onChange={setScope}
            options={[
              { value: "whole", label: "Whole syllabus" },
              { value: "chapters", label: "Selected chapters" },
            ]}
          />
          {scope === "chapters" ? (
            <div className="mt-4 flex max-h-64 flex-wrap gap-2 overflow-y-auto pr-1">
              {info?.chapters.map((c) => (
                <label key={c.name} className={pill}>
                  <input
                    type="checkbox"
                    name="chapters"
                    value={c.name}
                    checked={chapters.includes(c.name)}
                    onChange={(e) =>
                      setChapters((prev) => (e.target.checked ? [...prev, c.name] : prev.filter((x) => x !== c.name)))
                    }
                    className="sr-only"
                  />
                  {c.name}
                </label>
              ))}
            </div>
          ) : null}
        </Field>

        <Field label="Difficulty">
          {info?.difficultyLabelled ? (
            <>
              <Segmented
                name="difficulty"
                value={difficulty}
                onChange={setDifficulty}
                options={[
                  { value: "any", label: "Mixed" },
                  { value: "easier", label: "Easier" },
                  { value: "harder", label: "Harder" },
                ]}
              />
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Our estimate for a Class 10 student, not an official CISCE label. Easier is mostly direct
                recall; harder needs explaining, applying or working through steps.
              </p>
            </>
          ) : (
            <>
              <input type="hidden" name="difficulty" value="any" />
              <p className="text-sm text-muted-foreground">
                Difficulty levels for {subject} are still being prepared, so this paper mixes all levels.
              </p>
            </>
          )}
        </Field>

        <Field label="Paper length">
          <Segmented
            name="length"
            value={length}
            onChange={(v) => (v === "custom" ? startCustom() : setLength(v))}
            options={[
              { value: "quick", label: "Quick", detail: `${presetSize("quick")} questions` },
              { value: "standard", label: "Standard", detail: `${presetSize("standard")} questions` },
              { value: "custom", label: "Custom", detail: "Your mix" },
            ]}
          />

          {length === "custom" ? (
            <div className="mt-5 rounded-xl border border-rule bg-background/40 px-4">
              <ul className="divide-y divide-rule">
                {SET_TYPES.map((t) => (
                  <li key={t.key} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{t.label}</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {t.hint} <span className={numericFigures}>{cap[t.key]}</span> available.
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => step(t.key, -1)}
                        disabled={counts[t.key] === 0}
                        aria-label={`One fewer ${t.label.toLowerCase()} question`}
                        className="grid h-8 w-8 place-items-center rounded-full border border-border text-foreground transition-colors hover:bg-surface-raised disabled:opacity-40"
                      >
                        <Minus size={14} aria-hidden />
                      </button>
                      <output
                        className={`${numericFigures} w-6 text-center font-semibold`}
                        aria-live="polite"
                        aria-label={`${counts[t.key]} ${t.label.toLowerCase()} questions`}
                      >
                        {counts[t.key]}
                      </output>
                      <button
                        type="button"
                        onClick={() => step(t.key, 1)}
                        disabled={counts[t.key] >= Math.min(t.max, cap[t.key]) || total >= MAX_QUESTIONS}
                        aria-label={`One more ${t.label.toLowerCase()} question`}
                        className="grid h-8 w-8 place-items-center rounded-full border border-border text-foreground transition-colors hover:bg-surface-raised disabled:opacity-40"
                      >
                        <Plus size={14} aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule py-3">
                <label htmlFor="target_marks" className="text-sm">
                  <span className="font-medium text-foreground">Total marks</span>{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </label>
                <input
                  id="target_marks"
                  name="target_marks"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_TARGET_MARKS}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder={`About ${estimatedMarks}`}
                  className={`${inputBase} h-9 w-28 text-right`}
                />
              </div>
            </div>
          ) : null}
        </Field>

        <div className="border-t border-rule pt-6">
          <label className="flex items-start gap-3 text-sm text-foreground">
            <input
              type="checkbox"
              name="skip_mastered"
              checked={skipMastered}
              onChange={(e) => setSkipMastered(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-accent"
            />
            <span>Leave out questions I’ve already scored full marks on</span>
          </label>
        </div>

        {SET_TYPES.map((t) => (
          <input key={t.key} type="hidden" name={t.key} value={counts[t.key]} />
        ))}
      </div>

      {/* ── Your paper ── */}
      <aside className="rounded-2xl border border-border bg-card p-6 lg:sticky lg:top-6">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your paper</p>
        <p className="mt-3 font-display text-2xl leading-tight text-foreground">{subject}</p>

        <dl className="mt-5 divide-y divide-rule border-y border-rule text-sm">
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-muted-foreground">Questions</dt>
            <dd className={`${numericFigures} font-semibold text-foreground`}>{total}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-muted-foreground">Marks</dt>
            <dd className={`${numericFigures} font-semibold text-foreground`}>
              {targetMarks ? marks : `about ${marks}`}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-muted-foreground">Time</dt>
            <dd className={`${numericFigures} font-semibold text-foreground`}>about {approxMinutes(marks)} min</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-muted-foreground">Chapters</dt>
            <dd className="text-right font-semibold text-foreground">
              {scope === "whole" ? "Whole syllabus" : chapters.length ? `${chapters.length} selected` : "None yet"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-muted-foreground">Difficulty</dt>
            <dd className="font-semibold text-foreground">{DIFFICULTY_LABEL[level]}</dd>
          </div>
        </dl>

        <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
          {SET_TYPES.map((t) => (
            <li key={t.key} className="flex justify-between gap-3">
              <span>{t.label}</span>
              <span className={numericFigures}>{counts[t.key]}</span>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
          Every question is from a real ICSE board paper. Building and attempting it is free; marking uses
          up to <span className={`${numericFigures} font-semibold text-foreground`}>{credits}</span>{" "}
          {credits === 1 ? "credit" : "credits"}, only for the written answers you attempt
          {creditsRemaining !== null ? (
            <>
              {" "}
              (you have <span className={numericFigures}>{creditsRemaining}</span>)
            </>
          ) : null}
          .
        </p>

        {state?.ok === false ? (
          <p className={`${errorAlert} mt-4`} role="alert">
            {state.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending || total === 0 || needsChapters}
          className={`${btnPrimary} mt-5 h-11 w-full`}
        >
          {pending ? "Building your paper…" : "Build Paper"}
        </button>
        {needsChapters ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">Choose at least one chapter.</p>
        ) : null}
      </aside>
    </form>
  );
}
