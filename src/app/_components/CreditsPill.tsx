"use client";

// The credit balance, as a pill that opens a detail panel on hover.
//
// "Credits", not "tokens" — the column, the increment_usage RPC and the
// /api/usage JSON still say token, which is fine as an implementation name,
// but nothing a student reads should.
//
// Hover alone would make this unreachable by keyboard and unopenable on touch,
// so focus opens it too and a tap toggles it. The pill is a real <button> for
// the same reason.

import { useEffect, useRef, useState } from "react";
import { Zap } from "lucide-react";
import { numericFigures } from "@/lib/ui";
import type { CreditBalance } from "@/lib/credits";

/** Colour is a warning, not decoration, so it only appears once low. */
function toneFor(remaining: number, limit: number): string {
  if (remaining <= 2) return "border-status-wrong text-status-wrong";
  if (remaining <= Math.max(3, Math.round(limit * 0.25)))
    return "border-status-partial text-foreground";
  return "border-border text-foreground";
}

/**
 * Countdown to the next refill. Rendered only while the panel is open, which
 * is also what keeps it out of the server render — a clock formatted on the
 * server is stale by the time it reaches the browser and mismatches on
 * hydration.
 */
function Countdown({ at }: { at: string }) {
  const target = Date.parse(at);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const ms = target - now;
  if (!Number.isFinite(target)) return null;
  if (ms <= 0) return <>any moment now</>;

  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  const parts = [days ? `${days}d` : null, hours ? `${hours}h` : null, `${mins}m`].filter(Boolean);
  return <>in {parts.join(" ")}</>;
}

export function CreditsPill({ credits }: { credits: CreditBalance }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { remaining, limit, used, nextRefill } = credits;

  // A tap opens the panel on touch, where there is no hover; without this it
  // would close again the moment the finger lifts somewhere else.
  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 transition-colors ${toneFor(
          remaining,
          limit
        )} hover:bg-surface-raised`}
      >
        <Zap
          size={14}
          strokeWidth={2}
          aria-hidden
          fill="currentColor"
          className={remaining <= 2 ? "text-status-wrong" : "text-status-partial"}
        />
        <span className={`${numericFigures} text-sm font-semibold`}>{remaining}</span>
        <span className="sr-only">
          credits remaining of {limit}. Open credit details.
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Credit balance"
          className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-border bg-card p-4 shadow-[0_8px_28px_rgba(22,24,29,0.10)]"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">Credits</p>
            {/* Accurate, and not an upsell: there is one plan, and this says
                which one you are on rather than dangling another. */}
            <span className="rounded-full border border-status-correct bg-status-correct-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-status-correct">
              Free plan
            </span>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-status-partial bg-status-partial-subtle">
              <Zap size={16} strokeWidth={2} fill="currentColor" className="text-status-partial" />
            </span>
            <p className="flex items-baseline gap-1.5">
              <span className={`${numericFigures} text-2xl font-bold text-foreground`}>
                {remaining}
              </span>
              <span className="text-sm text-muted-foreground">
                of <span className={numericFigures}>{limit}</span> credits
              </span>
            </p>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            {nextRefill ? (
              <>
                <span className={`${numericFigures} font-semibold text-foreground`}>
                  +{nextRefill.amount}
                </span>{" "}
                <Countdown at={nextRefill.at} />
              </>
            ) : (
              "Full balance available."
            )}
          </p>

          <div className="mt-4 border-t border-border pt-3">
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-border"
              role="img"
              aria-label={`${used} of ${limit} credits used`}
            >
              <div
                className="h-full rounded-full bg-status-partial"
                style={{ width: `${limit > 0 ? Math.min(100, (used / limit) * 100) : 0}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {/* Said plainly because "refills in 3d" invites the assumption
                  that everything comes back at once, which it does not. */}
              Credits roll over a seven-day window — each day&rsquo;s spend returns seven days
              after you use it, not all at once.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
