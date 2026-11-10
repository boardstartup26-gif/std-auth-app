"use client";

// The sidebar's and mobile drawer's sign-out control. Signing out is a server
// action followed by a redirect, so without this the click looks dead for the
// length of the round trip — long enough to be pressed twice.

import { useFormStatus } from "react-dom";
import { LogOut } from "lucide-react";

export function SignOutButton({ expanded = true }: { expanded?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      title={expanded ? undefined : "Sign out"}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground disabled:opacity-60 ${
        expanded ? "" : "justify-center"
      }`}
    >
      <LogOut size={17} strokeWidth={1.75} className="shrink-0" aria-hidden />
      {expanded ? (pending ? "Signing out…" : "Sign out") : <span className="sr-only">Sign out</span>}
    </button>
  );
}
