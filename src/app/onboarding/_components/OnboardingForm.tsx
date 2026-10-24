"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { btnPrimary, errorAlert, inputBase } from "@/lib/ui";
import { EVENTS } from "@/lib/analytics/events";
import { track } from "@/lib/analytics/track";
import { REFERRAL_QUALIFY_AT, REFERRAL_WEEKLY_BONUS } from "@/lib/constants";
import { OnboardingProgress } from "./OnboardingProgress";
import { HEARD_FROM, STUDY_STAGES, type StudyStage } from "@/lib/onboarding/constants";
import { SUBJECTS } from "@/app/(protected)/evaluate/_lib/question";
import { completeOnboarding, type OnboardingResult } from "../actions";

const choiceCard =
  "flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm transition-colors hover:border-foreground/30 has-[:checked]:border-accent has-[:checked]:bg-accent-subtle has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent";
const choicePill =
  "inline-flex cursor-pointer items-center rounded-full border border-border bg-card px-3.5 py-2 text-sm transition-colors hover:border-foreground/30 has-[:checked]:border-accent has-[:checked]:bg-accent-subtle has-[:checked]:text-foreground has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent";
const fieldLabel = "text-xs font-medium text-muted-foreground";
const legendText = "font-display text-lg text-foreground";

// The question number sits in the margin, the way a marked script numbers its
// answers — and, like a marked script, turns into a tick once it's answered.
// Collapses above the field on narrow screens.
function Step({ n, done, children }: { n: number; done: boolean; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 border-t border-rule py-7 sm:grid-cols-[2.5rem_1fr] sm:gap-4">
      <span
        className={`font-display text-lg tabular-nums transition-colors duration-[180ms] ${done ? "text-status-correct" : "text-accent"}`}
        aria-hidden
      >
        {done ? "✓" : `${n}.`}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// One line of encouragement under an answered step, in the same left-rule
// style as the class note. Announced politely so it doesn't interrupt typing.
function Cue({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <p
      className={`max-w-[var(--measure)] border-l-2 border-status-correct/60 pl-3 text-sm leading-relaxed text-muted-foreground ${show ? "mt-4" : "sr-only"}`}
      aria-live="polite"
    >
      {show ? children : null}
    </p>
  );
}

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <button type="submit" className={`${btnPrimary} h-12 w-full px-6 sm:w-auto`} disabled={pending}>
      {pending ? "Saving…" : "Start marking →"}
    </button>
  );
}

function stageNote(stage: StudyStage | ""): string | null {
  switch (stage) {
    case "icse_9":
      return "Every question here comes from an ICSE Class 10 board paper. Practise the chapters you've already covered in Class 9 — they're marked the same way.";
    case "isc_11":
    case "isc_12":
      return "BoardEdge covers ICSE Class 10 papers for now. You're welcome to use it, but ISC papers aren't here yet.";
    case "other_board":
      return "Answers are marked against CISCE's official ICSE schemes, so your marks won't match how your own board would grade them.";
    default:
      return null;
  }
}

export function OnboardingForm({
  defaultFirstName,
  defaultLastName,
  questionCounts = {},
  invitedBy = null,
  weeklyCredits,
}: {
  defaultFirstName: string;
  defaultLastName: string;
  /** Markable past-paper questions per subject, for the subjects cue. */
  questionCounts?: Record<string, number>;
  /** First name of whoever invited this student, if anyone. */
  invitedBy?: string | null;
  weeklyCredits: number;
}) {
  const [state, formAction, pending] = useActionState<OnboardingResult, FormData>(completeOnboarding, null);
  const [firstName, setFirstName] = useState(defaultFirstName);
  const [lastName, setLastName] = useState(defaultLastName);
  const [stage, setStage] = useState<StudyStage | "">("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [heardFrom, setHeardFrom] = useState(invitedBy ? "friend" : "");

  const inputClass = `${inputBase} h-11 w-full`;
  const note = stageNote(stage);

  const stepsDone = [
    Boolean(firstName.trim() && lastName.trim()),
    Boolean(stage),
    subjects.length > 0,
    Boolean(heardFrom),
  ];
  const doneCount = stepsDone.filter(Boolean).length;
  const questionTotal = subjects.reduce((sum, s) => sum + (questionCounts[s] ?? 0), 0);

  // Per-step drop-off: each step reports the first time it becomes valid.
  const reported = useRef(new Set<number>());
  useEffect(() => {
    stepsDone.forEach((done, i) => {
      if (done && !reported.current.has(i)) {
        reported.current.add(i);
        track(EVENTS.ONBOARDING_STEP_COMPLETED, { step: i + 1 });
      }
    });
  });

  const toggleSubject = (subject: string, on: boolean) =>
    setSubjects((prev) => (on ? [...prev, subject] : prev.filter((s) => s !== subject)));

  return (
    // Submitted via onSubmit rather than <form action>: React resets a form
    // after an action-prop submission, which clears the DOM of these
    // controlled pills and select while their state stays set — a failed save
    // would then show an empty form that still submits the old choices.
    <form
      className="mt-10"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <div className="sticky top-0 z-10 -mx-6 bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <OnboardingProgress done={doneCount} total={stepsDone.length} label="answered" />
      </div>

      <Step n={1} done={stepsDone[0]}>
        <fieldset>
          <legend className={legendText}>What should we call you?</legend>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className={fieldLabel} htmlFor="first_name">First name</label>
              <input
                id="first_name"
                name="first_name"
                type="text"
                autoComplete="given-name"
                required
                maxLength={60}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="space-y-2">
              <label className={fieldLabel} htmlFor="last_name">Last name</label>
              <input
                id="last_name"
                name="last_name"
                type="text"
                autoComplete="family-name"
                required
                maxLength={60}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <Cue show={stepsDone[0]}>
            Hi {firstName.trim()} — that&rsquo;s the name your marked answers will be addressed to.
          </Cue>
        </fieldset>
      </Step>

      <Step n={2} done={stepsDone[1]}>
        <fieldset>
          <legend className={legendText}>Which class are you in?</legend>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {STUDY_STAGES.map((s) => (
              <label key={s.value} className={choiceCard}>
                <input
                  type="radio"
                  name="study_stage"
                  value={s.value}
                  required
                  checked={stage === s.value}
                  onChange={() => setStage(s.value)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                />
                <span>
                  <span className="block font-medium text-foreground">{s.label}</span>
                  {s.hint ? <span className="block text-xs text-muted-foreground">{s.hint}</span> : null}
                </span>
              </label>
            ))}
          </div>
          {note ? (
            <p className="mt-4 max-w-[var(--measure)] border-l-2 border-rule pl-3 text-sm leading-relaxed text-muted-foreground" aria-live="polite">
              {note}
            </p>
          ) : (
            <Cue show={stage === "icse_10"}>
              Good — every question here is from a real ICSE Class 10 board paper, marked against its scheme.
            </Cue>
          )}
        </fieldset>
      </Step>

      <Step n={3} done={stepsDone[2]}>
        <fieldset>
          <legend className={legendText}>Which subjects do you want marked?</legend>
          <p className="mt-1 text-sm text-muted-foreground">Pick any. You can practise the others too.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {SUBJECTS.map((subject) => (
              <label key={subject} className={choicePill}>
                <input
                  type="checkbox"
                  name="subjects"
                  value={subject}
                  checked={subjects.includes(subject)}
                  onChange={(e) => toggleSubject(subject, e.target.checked)}
                  className="sr-only"
                />
                {subject}
              </label>
            ))}
          </div>
          <Cue show={stepsDone[2]}>
            <span className="font-mono tabular-nums text-foreground">{subjects.length}</span>{" "}
            subject{subjects.length === 1 ? "" : "s"}
            {questionTotal > 0 ? (
              <>
                {" "}· <span className="font-mono tabular-nums text-foreground">{questionTotal.toLocaleString("en-IN")}</span>{" "}
                past-paper questions ready to be marked.
              </>
            ) : (
              " picked."
            )}
          </Cue>
        </fieldset>
      </Step>

      <Step n={4} done={stepsDone[3]}>
        <div className="space-y-2">
          <label className={legendText} htmlFor="heard_from">How did you hear about BoardEdge?</label>
          <select
            id="heard_from"
            name="heard_from"
            required
            value={heardFrom}
            onChange={(e) => setHeardFrom(e.target.value)}
            className={`${inputClass} mt-2 sm:max-w-xs`}
          >
            <option value="" disabled>Choose one</option>
            {HEARD_FROM.map((h) => (
              <option key={h.value} value={h.value}>{h.label}</option>
            ))}
          </select>
          {invitedBy ? (
            <Cue show>
              <span className="text-foreground">Invited by {invitedBy}</span> — get {REFERRAL_QUALIFY_AT} answers marked and
              you both get +{REFERRAL_WEEKLY_BONUS} credits every week.
            </Cue>
          ) : (
            <Cue show={heardFrom === "friend"}>
              Studying with friends? Once you&rsquo;re in, invite them and you both get +{REFERRAL_WEEKLY_BONUS} credits a week.
            </Cue>
          )}
        </div>
      </Step>

      <div className="border-t border-rule pt-7">
        <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
          <span className="text-foreground">Next: your first marked answer</span> — about two minutes. You have{" "}
          <span className="font-mono tabular-nums text-foreground">{weeklyCredits}</span> credits this week.
        </p>
        {state?.ok === false ? <p className={`${errorAlert} mb-5`} role="alert">{state.message}</p> : null}
        <SubmitButton pending={pending} />
      </div>
    </form>
  );
}
