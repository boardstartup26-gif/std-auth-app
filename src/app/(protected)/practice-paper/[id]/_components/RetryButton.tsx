"use client";

import { useFormStatus } from "react-dom";

export function RetryButton({ className, count }: { className: string; count: number }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "Building your retry paper…" : `Retry Missed Questions (${count})`}
    </button>
  );
}
