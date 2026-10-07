// src/app/(protected)/practice-paper/page.tsx
//
// Practice papers: the student's recent papers, and the builder. A paper is
// assembled from real ICSE past-paper questions (never generated), attempted
// in one sitting at /practice-paper/[id], and marked as a whole once handed in.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readCredits } from "@/lib/credits";
import { SUBJECTS } from "@/app/(protected)/evaluate/_lib/question";
import { loadPool, summarise } from "@/lib/practice-sets/build";
import { listRecentSets } from "@/lib/practice-sets/read";
import { errorAlert, sectionLabel } from "@/lib/ui";
import { BuilderForm } from "./_components/BuilderForm";
import { RecentPapers } from "./_components/RecentPapers";

export const dynamic = "force-dynamic";

export default async function PracticePaperPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const { subject } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/practice-paper");

  const [poolResult, credits, recent] = await Promise.all([
    loadPool().then(
      (pool) => ({ ok: true as const, pool }),
      (err: unknown) => {
        console.error("[BoardEdge] practice paper pool failed:", err);
        return { ok: false as const };
      },
    ),
    readCredits(user.id),
    listRecentSets(user.id),
  ]);

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <p className={sectionLabel}>Practice papers</p>
      <h1 className="display-section mt-2 text-balance">Sit a paper, then see exactly where the marks went</h1>
      <p className="mt-4 max-w-[var(--measure)] text-muted-foreground">
        Build a paper from real ICSE board questions, answer it in one sitting, and get the whole
        paper marked point by point when you hand it in.
      </p>

      <RecentPapers sets={recent} />

      {recent.length ? (
        <h2 className="mt-14 font-display text-2xl text-foreground">Build a new paper</h2>
      ) : null}

      {poolResult.ok ? (
        <BuilderForm
          availability={summarise(poolResult.pool, SUBJECTS)}
          creditsRemaining={credits.remaining}
          initialSubject={subject}
        />
      ) : (
        <p className={`${errorAlert} mt-10`} role="alert">
          We couldn’t load the question bank just now. Please refresh in a moment.
        </p>
      )}
    </div>
  );
}
