"use client";

import { useState } from "react";

type GateVariant = "conceptual" | "model" | "tips";

const VARIANT_STYLES: Record<GateVariant, { minHeight: string; borderAccent: string; icon: string }> = {
  conceptual: { minHeight: "min-h-[110px]", borderAccent: "border-l-4 border-amber-700/60", icon: "⚠️" },
  model:      { minHeight: "min-h-[150px]", borderAccent: "border-l-4 border-sky-700/60",   icon: "📘" },
  tips:       { minHeight: "min-h-[130px]", borderAccent: "border-l-4 border-purple-400/60", icon: "✅" },
};

interface PremiumGateProps {
  label: string;
  unlocked: boolean;
  variant: GateVariant;
  children: React.ReactNode;
}

export function PremiumGate({ label, unlocked, variant, children }: PremiumGateProps) {
  const style = VARIANT_STYLES[variant];

  return (
    <div className={`relative overflow-hidden rounded-xl bg-card ${style.borderAccent} ${style.minHeight}`}>
      <div
        className={unlocked ? "p-4" : "pointer-events-none select-none p-4 blur-[6px] opacity-70"}
        aria-hidden={!unlocked}
      >
        {children}
      </div>

      {!unlocked && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-card/30 backdrop-blur-md">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-purple-400/50 bg-card text-base">
            🔒
          </div>
          <p className="text-sm font-semibold text-purple-400">{label} — Premium</p>
          <p className="text-xs text-muted-foreground">{style.icon} Free during beta — unlock below.</p>
        </div>
      )}
    </div>
  );
}

interface WaitlistCaptureProps {
  onUnlock: () => void;
  unlocked: boolean;
}

export function WaitlistCapture({ onUnlock, unlocked }: WaitlistCaptureProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  if (unlocked || status === "success") {
    return (
      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
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
    <div className="flex w-full flex-col items-center gap-3 rounded-xl border border-purple-400/40 px-4 py-5 text-center">
      <div>
        <p className="text-sm font-semibold text-foreground">
          Unlock conceptual errors, model answer &amp; improvement tips
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
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
          className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-premium"
        />
        <button
          onClick={handleJoinWaitlist}
          disabled={status === "submitting" || !email.trim().includes("@")}
          className="h-9 w-full rounded-lg bg-premium px-3 text-xs font-semibold text-foreground transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {status === "submitting" ? "Joining…" : "Join waitlist to unlock"}
        </button>
        {status === "error" && (
          <p className="text-xs text-red-400">Something went wrong. Try again.</p>
        )}
      </div>
    </div>
  );
}