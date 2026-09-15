// src/app/_components/CreditsPill.tsx
//
// The credit balance, as a pill in the top bar. "Credits", not "tokens" —
// the internal column and RPC still say token_count, and that is fine as an
// implementation name, but nothing a student reads should call them tokens.
//
// Server component: the balance is already known during the page render, so it
// arrives with the HTML rather than popping in after a client fetch.

import { Zap } from "lucide-react";
import { WEEKLY_CREDIT_LIMIT } from "@/lib/constants";
import { numericFigures } from "@/lib/ui";

/**
 * Colour is a warning, not decoration, so it only appears once the balance is
 * actually low. A full wallet is ink.
 */
function toneFor(remaining: number): string {
  if (remaining <= 2) return "border-status-wrong text-status-wrong";
  if (remaining <= 5) return "border-status-partial text-foreground";
  return "border-border text-foreground";
}

export function CreditsPill({
  remaining,
  refillsAt,
}: {
  remaining: number;
  refillsAt?: string | null;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 ${toneFor(remaining)}`}
      title={
        refillsAt
          ? `${remaining} of ${WEEKLY_CREDIT_LIMIT} credits left · refills ${refillsAt}`
          : `${remaining} of ${WEEKLY_CREDIT_LIMIT} credits left`
      }
    >
      <Zap
        size={14}
        strokeWidth={2}
        aria-hidden
        className={remaining <= 2 ? "text-status-wrong" : "text-status-partial"}
        fill="currentColor"
      />
      <span className={`${numericFigures} text-sm font-semibold`}>{remaining}</span>
      <span className="sr-only">credits remaining</span>
    </span>
  );
}
