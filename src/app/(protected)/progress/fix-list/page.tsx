// /progress/fix-list — practice sets aimed at the weakest chapters, one per
// subject. buildFixList (practice-paper/actions.ts) returns here with
// ?subject=&fix=none|thin|error when it can't build one.

import { ClipboardList } from "lucide-react";
import { computeLeakage, weakestChapters } from "@/lib/progress";
import { EmptyState } from "@/app/_components/states/EmptyState";
import { OpenBookSketch } from "@/app/(protected)/dashboard/_components/Illustrations";
import { ProgressFrame } from "../_components/ProgressFrame";
import { NothingMarkedYet, ProgressLoadFailed } from "../_components/ProgressStates";
import { FixListPanel, type FixNotice, type FixTarget } from "../_components/FixListPanel";
import { loadProgress } from "../_lib/load";

export const dynamic = "force-dynamic";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <ProgressFrame
      eyebrow="Fix list"
      title="Your Fix List"
      subtitle="Targeted practice for your weakest areas."
      art={<OpenBookSketch className="w-full" />}
    >
      {children}
    </ProgressFrame>
  );
}

export default async function FixListPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; fix?: string }>;
}) {
  const { subject: noticeSubjectParam, fix } = await searchParams;
  const { read } = await loadProgress("/progress/fix-list");
  if (!read.ok) {
    return (
      <Frame>
        <ProgressLoadFailed />
      </Frame>
    );
  }
  if (!read.attempts.length) {
    return (
      <Frame>
        <NothingMarkedYet what="your Fix List picks the chapters costing you the most and turns them into short practice papers." />
      </Frame>
    );
  }

  // Per subject, the two chapters planFixList starts from. Ranked within each
  // subject (leakage is per question, so the ranking is the same whether
  // computed from all subjects or one).
  const leakage = computeLeakage(read.attempts);
  const subjects = [...new Set(read.attempts.map((a) => a.subject))].sort();
  const targets: FixTarget[] = subjects
    .map((s) => ({ subject: s, chapters: weakestChapters(leakage, { subject: s, limit: 2 }) }))
    .filter((t) => t.chapters.length > 0);
  const notice: FixNotice | null = fix === "none" || fix === "thin" || fix === "error" ? fix : null;
  const noticeSubject = noticeSubjectParam && subjects.includes(noticeSubjectParam) ? noticeSubjectParam : null;
  const anyShown = targets.some((t) => !(notice && notice !== "error" && t.subject === noticeSubject));

  return (
    <Frame>
      <FixListPanel targets={targets} notice={notice} noticeSubject={noticeSubject} />
      {!anyShown ? (
        <EmptyState
          className={notice ? "mt-4" : undefined}
          icon={ClipboardList}
          title="No weak chapters to target yet"
          description="A chapter joins your Fix List once it has at least two marked questions with marks lost. Keep practising and it builds itself."
          primary={{ label: "Practice a question", href: "/evaluate" }}
          secondary={{ label: "See your Leakage Map", href: "/progress/leakage" }}
        />
      ) : null}
    </Frame>
  );
}
