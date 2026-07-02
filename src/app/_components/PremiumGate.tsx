"use client";

// ─── PremiumGate ──────────────────────────────────────────────────────────────
// Presentational only. Blurs children until `unlocked` is true. Does NOT own
// email state or fetch logic — that lives once in the parent (see
// WaitlistCapture) so submitting one email unlocks every gated section on the
// page in a single action, instead of each PremiumGate instance running its
// own independent waitlist form.
//
// Usage:
//   const [unlocked, setUnlocked] = useState(false);
//   <PremiumGate label="Model answer" unlocked={unlocked}>
//     <p>{result.model_answer}</p>
//   </PremiumGate>
//   <WaitlistCapture onUnlock={() => setUnlocked(true)} />

interface PremiumGateProps {
  label: string; // e.g. "Model answer", "Conceptual errors"
  unlocked: boolean;
  children: React.ReactNode;
}

export function PremiumGate({ label, unlocked, children }: PremiumGateProps) {
  return (
    <div className="relative min-h-[80px]">
      <div
        className={unlocked ? "" : "pointer-events-none select-none blur-sm"}
        aria-hidden={!unlocked}
      >
        {children}
      </div>

      {!unlocked && (
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-white/80 px-4 py-5 dark:bg-zinc-900/80">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-base dark:border-zinc-700 dark:bg-zinc-900">
            🔒
          </div>
          <p className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {label} — Premium
          </p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Free during beta — join the waitlist below to unlock.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── WaitlistCapture ──────────────────────────────────────────────────────────
// The single, shared email capture form. Render exactly ONE of these per
// evaluation result (not one per PremiumGate). On success, calls onUnlock()
// once — the parent flips one boolean that every PremiumGate on the page
// reads.

import { useState } from "react";

interface WaitlistCaptureProps {
  onUnlock: () => void;
  unlocked: boolean;
}

export function WaitlistCapture({ onUnlock, unlocked }: WaitlistCaptureProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  if (unlocked || status === "success") {
    return (
      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <span>✓</span> You&apos;re on the waitlist — premium unlocked for beta.
      </div>
    );
  }

  async function handleJoinWaitlist() {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) return;

    setStatus("submitting");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, feature: "premium_bundle" }),
      });
      if (!res.ok) throw new Error();
      setStatus("success");
      onUnlock();
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-3 rounded-xl border border-zinc-200 px-4 py-5 text-center dark:border-zinc-700">
      <div>
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Unlock conceptual errors, model answer &amp; improvement tips
        </p>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Free during beta — join the waitlist to unlock instantly.
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleJoinWaitlist()}
          placeholder="your@email.com"
          className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-zinc-100"
        />
        <button
          onClick={handleJoinWaitlist}
          disabled={status === "submitting" || !email.trim().includes("@")}
          className="h-9 w-full rounded-lg bg-zinc-900 text-xs font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {status === "submitting" ? "Joining…" : "Join waitlist to unlock"}
        </button>
        {status === "error" && (
          <p className="text-xs text-red-500">Something went wrong. Try again.</p>
        )}
      </div>
    </div>
  );
}