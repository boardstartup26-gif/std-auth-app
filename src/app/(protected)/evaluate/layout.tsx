// src/app/(protected)/evaluate/layout.tsx
//
// Replaces the question picker with a locked panel once a student has used
// their free evaluations without confirmed parent/guardian consent, so
// nobody spends time writing an answer that can't be submitted.
//
// UX only. The enforcement is the per-request check in
// src/app/api/evaluate/route.ts, which refuses before anything is processed —
// this layout can be stale across client navigations, that route can't.

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FREE_EVALUATIONS_BEFORE_CONSENT, getEvaluationGateState } from "@/lib/parent-consent/service";
import { btnSecondary, sectionLabel } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function EvaluateLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return children; // middleware redirects; nothing to gate

  const gate = await getEvaluationGateState(user.id);
  if (gate.allowed) return children;

  const consent = gate.consent;
  const heading =
    consent.status === "revoked"
      ? "Evaluations are paused"
      : consent.status === "unavailable"
        ? "We couldn't check your account just now"
        : "Evaluations unlock after parent confirmation";

  const usedUpNotice = `You've used your ${FREE_EVALUATIONS_BEFORE_CONSENT} free evaluations.`;

  const body =
    consent.status === "revoked"
      ? "Your parent or guardian withdrew consent, so new answers can't be graded. Your past results are still available."
      : consent.status === "unavailable"
        ? "Please refresh the page in a moment."
        : consent.status === "needs_email"
          ? `${usedUpNotice} Add your parent's or guardian's email using the notice at the top of this page. Once they confirm, you can keep practising.`
          : `${usedUpNotice} We've emailed your parent or guardian a confirmation link. As soon as they confirm, this page unlocks — you can resend the link or change the address from the notice above.`;

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <p className={sectionLabel}>Question practice</p>
      <h1 className="display-section mt-3 text-balance">{heading}</h1>
      <p className="mt-5 max-w-[var(--measure)] text-muted-foreground">{body}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/history" className={btnSecondary}>
          View past results
        </Link>
        <Link href="/privacy#students-under-18" className={btnSecondary}>
          Why is this needed?
        </Link>
      </div>
    </div>
  );
}
