// src/app/(protected)/practice-paper/[id]/page.tsx
//
// One practice paper, at every stage of its life, on one URL:
//   in_progress  cover page, then the attempt (answer, navigate, review, submit)
//   marking      the marking screen, which drives /api/practice-paper/[id]/mark
//   marked       the results
// "Continue Paper" and "View Results" both land here.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readCredits } from "@/lib/credits";
import { readPaper } from "@/lib/practice-sets/read";
import { FREE_EVALUATIONS_BEFORE_CONSENT, getEvaluationGateState } from "@/lib/parent-consent/service";
import { btnSecondary, sectionLabel } from "@/lib/ui";
import { PaperAttempt } from "./_components/PaperAttempt";
import { MarkingScreen } from "./_components/MarkingScreen";
import { PaperResults } from "./_components/PaperResults";

export const dynamic = "force-dynamic";

export default async function PracticePaperPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fit?: string }>;
}) {
  const [{ id }, { fit }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/practice-paper/${id}`);

  const paper = await readPaper(user.id, id);
  if (!paper) notFound();

  if (paper.status === "marked") return <PaperResults paper={paper} />;

  if (paper.status === "marking") {
    return (
      <div className="mx-auto min-h-screen max-w-2xl px-6 py-16">
        <MarkingScreen setId={paper.id} subject={paper.subject} total={paper.questions.length} />
      </div>
    );
  }

  // Answering stores a minor's answers, so it needs the same consent gate as
  // marking does (UX here; saveAnswer and submitPaper enforce it).
  const [gate, credits] = await Promise.all([getEvaluationGateState(user.id), readCredits(user.id)]);
  if (!gate.allowed) {
    const consent = gate.consent;
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <p className={sectionLabel}>Practice paper · {paper.subject}</p>
        <h1 className="display-section mt-3 text-balance">
          {consent.status === "revoked"
            ? "Practice is paused"
            : consent.status === "unavailable"
              ? "We couldn’t check your account just now"
              : "Practice papers unlock after parent confirmation"}
        </h1>
        <p className="mt-5 max-w-[var(--measure)] text-muted-foreground">
          {consent.status === "revoked"
            ? "Your parent or guardian withdrew consent, so new answers can’t be saved or marked. Your past results are still available."
            : consent.status === "unavailable"
              ? "Please refresh the page in a moment."
              : `You’ve used your ${FREE_EVALUATIONS_BEFORE_CONSENT} free evaluations. Once your parent or guardian confirms consent from the notice at the top of the page, this paper unlocks.`}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/practice-paper" className={btnSecondary}>
            Practice papers
          </Link>
          <Link href="/privacy#students-under-18" className={btnSecondary}>
            Why is this needed?
          </Link>
        </div>
      </div>
    );
  }

  return (
    <PaperAttempt
      paper={{
        id: paper.id,
        subject: paper.subject,
        totalMarks: paper.totalMarks,
        startedAt: paper.startedAt,
        targetMarks: fit === "closest" ? paper.spec.targetMarks : null,
        retry: Boolean(paper.spec.retryOf),
        questions: paper.questions,
        answers: Object.fromEntries(
          Object.entries(paper.answers).map(([qid, a]) => [qid, { text: a.text, flagged: a.flagged, updatedAt: a.updatedAt }]),
        ),
      }}
      creditsRemaining={credits.remaining}
      answerLimit={gate.consent.status === "confirmed" ? null : gate.freeEvaluationsRemaining}
    />
  );
}
