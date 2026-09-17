"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { btnPrimary } from "@/lib/ui";
import type { ConfirmResult } from "@/lib/parent-consent/service";
import { confirmConsent } from "../actions";
import { ConsentOutcome } from "./ConsentOutcome";

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btnPrimary} h-12 w-full px-6 text-base sm:w-auto`}>
      {pending ? "Confirming…" : "I am their parent or guardian, and I give consent"}
    </button>
  );
}

/**
 * The confirmation is a deliberate POST, not a side effect of opening the
 * link: many email providers and security scanners open links automatically,
 * and a GET that confirmed would let a scanner give consent on a parent's
 * behalf.
 */
export function ConfirmForm({ token }: { token: string }) {
  const [result, action] = useActionState<ConfirmResult | null, FormData>(confirmConsent, null);

  if (result) return <ConsentOutcome state={result.state} />;

  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <ConfirmButton />
    </form>
  );
}
