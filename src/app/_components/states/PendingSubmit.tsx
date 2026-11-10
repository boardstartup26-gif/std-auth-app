"use client";

// Submit controls for server-action forms that otherwise give no sign of life
// between click and revalidation. `useFormStatus` reads the enclosing <form>,
// so these drop into the existing forms unchanged.

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/** A button that disables itself and swaps its label while its form is submitting. */
export function PendingSubmit({
  children,
  pendingLabel,
  className,
}: {
  children: ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`${className ?? ""} disabled:opacity-60`}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/**
 * A wash laid over a row-sized submit button (a notification) while its form
 * submits. Swapping the label would shift layout, so the row stays exactly as
 * it is and is simply seen to have been pressed. The button must be `relative`.
 * Absolutely positioned, so it adds nothing to the button's own grid.
 */
export function PendingOverlay() {
  const { pending } = useFormStatus();
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 bg-background/60 transition-opacity duration-150 ${
        pending ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}
