"use client";

// The student's view of parent/guardian consent, rendered at the top of every
// signed-in page by (protected)/layout.tsx.
//
// Two tiers of copy, driven by gate.allowed (still within the free-evaluation
// quota, or already confirmed/no notice needed) vs. actually locked:
//
//   needs_email → within quota: a soft, dismissible nudge to add the email
//                 early. Past quota: the same modal, worded as the real block
//                 it now is. Dashboard and history stay available either way.
//   pending     → "waiting on confirmation" banner, with resend and change-email
//   expired     → same banner, worded for an expired link
//   revoked     → banner explaining evaluations are paused; no resend, no
//                 quota framing — a withdrawal is absolute regardless of it
//   confirmed / unavailable → nothing (the evaluate route still enforces)
//
// This component is guidance only. The lock itself lives server-side in
// src/app/api/evaluate/route.ts.

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { btnPrimary, btnSecondary, errorAlert, inputBase, sectionLabel } from "@/lib/ui";
import type { EvaluationGateState } from "@/lib/parent-consent/service";
import { submitParentEmail, type ParentConsentActionResult } from "./actions";

function SubmitButton({ label, pendingLabel, className }: { label: string; pendingLabel: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : label}
    </button>
  );
}

function ResultLine({ result }: { result: ParentConsentActionResult | null }) {
  if (!result) return null;
  return result.ok ? (
    <p role="status" className="text-sm text-awarded">{result.message}</p>
  ) : (
    <p role="alert" className={errorAlert}>{result.message}</p>
  );
}

function ParentEmailForm({ submitLabel, autoFocus = false }: { submitLabel: string; autoFocus?: boolean }) {
  const [result, action] = useActionState<ParentConsentActionResult | null, FormData>(submitParentEmail, null);
  return (
    <form action={action} className="space-y-3">
      <div className="space-y-2">
        <label htmlFor="consent_parent_email" className="text-xs font-medium text-muted-foreground">
          Parent or guardian email
        </label>
        <input
          id="consent_parent_email"
          name="parent_email"
          type="email"
          required
          autoComplete="off"
          autoFocus={autoFocus}
          className={`${inputBase} h-11 w-full placeholder:text-muted-foreground`}
          placeholder="parent@example.com"
        />
      </div>
      <ResultLine result={result} />
      <SubmitButton label={submitLabel} pendingLabel="Sending…" className={`${btnPrimary} w-full`} />
    </form>
  );
}

function ResendForm() {
  const [result, action] = useActionState<ParentConsentActionResult | null, FormData>(submitParentEmail, null);
  return (
    <form action={action} className="space-y-2">
      <SubmitButton label="Resend link" pendingLabel="Sending…" className={`${btnSecondary} h-9 px-3.5 text-xs`} />
      <ResultLine result={result} />
    </form>
  );
}

function formatIst(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function NeedsEmailModal({
  onDismiss,
  stillFree,
  freeRemaining,
}: {
  onDismiss: () => void;
  stillFree: boolean;
  freeRemaining: number;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="parent-consent-title"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lg sm:p-8"
      >
        <p className={sectionLabel}>{stillFree ? "Worth doing now" : "One more step"}</p>
        <h2 id="parent-consent-title" className="mt-2 text-xl font-semibold tracking-tight text-foreground">
          {stillFree ? "Add your parent or guardian's email" : "We need your parent or guardian's OK"}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Because most BoardEdge students are under 18, the law requires a parent or guardian to
          agree before we grade your answers.{" "}
          {stillFree
            ? `You can still try ${plural(freeRemaining, "more evaluation")} first — add their email now so it's ready before you need it.`
            : "Enter their email and we'll send them a link to confirm."}{" "}
          Your dashboard and past results stay available in the meantime.
        </p>
        <div className="mt-6">
          <ParentEmailForm submitLabel="Send confirmation link" autoFocus />
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-3 w-full text-center text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

export function ParentConsentNotice({ gate }: { gate: EvaluationGateState }) {
  const [dismissed, setDismissed] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);

  const { consent } = gate;
  if (consent.status === "confirmed" || consent.status === "unavailable") return null;

  const shell = "border-b border-border bg-card px-6 py-3";
  // Whenever the free quota still covers them (and consent isn't revoked —
  // getEvaluationGateState never sets allowed=true for a revoked row), this
  // is a nudge, not a block, and the copy below has to say so honestly.
  const stillFree = gate.allowed;

  if (consent.status === "needs_email") {
    return (
      <>
        {!dismissed ? (
          <NeedsEmailModal
            onDismiss={() => setDismissed(true)}
            stillFree={stillFree}
            freeRemaining={gate.freeEvaluationsRemaining}
          />
        ) : null}
        <div className={shell} role="region" aria-label="Parent consent">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-foreground">
              {stillFree ? (
                <>
                  <span className="font-semibold">Add a parent or guardian email soon.</span>{" "}
                  <span className="text-muted-foreground">
                    You have {plural(gate.freeEvaluationsRemaining, "free evaluation")} left before
                    we&apos;ll need their OK.
                  </span>
                </>
              ) : (
                <>
                  <span className="font-semibold">Evaluations are locked</span>
                  <span className="text-muted-foreground"> until a parent or guardian confirms consent.</span>
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => setDismissed(false)}
              className={`${btnPrimary} h-9 px-3.5 text-xs`}
            >
              Add parent email
            </button>
          </div>
        </div>
      </>
    );
  }

  if (consent.status === "revoked") {
    return (
      <div className={shell} role="region" aria-label="Parent consent">
        <p className="text-sm text-foreground">
          <span className="font-semibold">Evaluations are paused.</span>{" "}
          <span className="text-muted-foreground">
            Your parent or guardian withdrew consent. Your past results are still here. Questions? Write
            to{" "}
            <a href="mailto:contact.boardedge@gmail.com" className="text-foreground underline underline-offset-2">
              contact.boardedge@gmail.com
            </a>
            .
          </span>
        </p>
      </div>
    );
  }

  // pending | expired
  const expired = consent.status === "expired";
  const quotaClause = stillFree
    ? ` You have ${plural(gate.freeEvaluationsRemaining, "free evaluation")} left before this is needed.`
    : "";
  return (
    <div className={shell} role="region" aria-label="Parent consent">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="text-sm">
          <p className="text-foreground">
            <span className="font-semibold">
              {expired ? "The confirmation link expired." : "Waiting for your parent or guardian to confirm."}
            </span>{" "}
            <span className="text-muted-foreground">
              {expired
                ? `Send a new one to ${consent.parentEmailMasked ?? "your parent"}.${
                    stillFree ? quotaClause : " Evaluations stay locked until they confirm."
                  }`
                : `We emailed ${consent.parentEmailMasked ?? "your parent"}${
                    consent.tokenExpiresAt ? `; the link works until ${formatIst(consent.tokenExpiresAt)} IST` : ""
                  }.${stillFree ? quotaClause : " Evaluations unlock as soon as they confirm."}`}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setChangingEmail((v) => !v)}
            className="mt-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {changingEmail ? "Cancel" : "Use a different email"}
          </button>
        </div>
        <div className="shrink-0">
          <ResendForm />
        </div>
      </div>
      {changingEmail ? (
        <div className="mt-4 max-w-sm">
          <ParentEmailForm submitLabel="Send to this email" />
        </div>
      ) : null}
    </div>
  );
}
