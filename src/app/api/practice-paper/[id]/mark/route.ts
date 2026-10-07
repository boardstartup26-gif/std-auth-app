// src/app/api/practice-paper/[id]/mark/route.ts
//
// POST marks a submitted practice paper (src/lib/practice-sets/mark.ts) for up
// to MARK_BUDGET_MS, then reports progress; the browser calls again until the
// paper is done. Short runs keep every call well inside the function time
// limit, and the marker is resumable, so a closed tab or a dropped request
// loses nothing: opening the paper again carries on.
//
// GET reports progress only, for the live counter on the marking screen.
//
// No credits are reserved here: submitPaper() reserved the whole paper's cost
// when it was handed in. The consent gate was checked then too; a withdrawal
// since then stops marking here.

import { after, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { markPaper } from "@/lib/practice-sets/mark";
import { isPaperId } from "@/lib/practice-sets/read";
import { getParentConsentState } from "@/lib/parent-consent/service";
import { EVENTS } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MARK_BUDGET_MS = 35_000;

async function sessionUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPaperId(id)) return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const consent = await getParentConsentState(userId);
  if (consent.status === "revoked") {
    return NextResponse.json(
      { error: "Marking is paused because your parent or guardian withdrew consent.", code: "parent_consent_required" },
      { status: 403 },
    );
  }

  let progress;
  try {
    progress = await markPaper(userId, id, Date.now() + MARK_BUDGET_MS);
  } catch (err) {
    console.error("[BoardEdge] paper marking run failed:", err);
    return NextResponse.json({ error: "Marking stopped unexpectedly. It will carry on when you retry." }, { status: 500 });
  }
  if (!progress) return NextResponse.json({ error: "Paper not found" }, { status: 404 });

  // One evaluation_completed per marked answer, as /api/evaluate records, so
  // the activation funnel counts paper answers too (src: "practice_paper").
  const graded = progress.graded ?? [];
  if (graded.length) {
    after(async () => {
      const { count } = await createAdminClient()
        .from("student_answers")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      await Promise.all(
        graded.map((g, i) => {
          const evalIndex = count === null ? null : count - (graded.length - 1 - i);
          return recordServerEvent({
            eventName: EVENTS.EVALUATION_COMPLETED,
            userId,
            properties: {
              src: "practice_paper",
              set_id: id,
              question_id: g.questionId,
              question_type: g.questionType,
              is_subjective: g.isSubjective,
              marks_awarded: g.marksAwarded,
              total_marks: g.totalMarks,
              eval_index: evalIndex,
              is_first_evaluation: evalIndex === 1,
            },
            path: `/practice-paper/${id}`,
          });
        }),
      );
    });
  }

  if (progress.finished) {
    const { score, outOf } = progress.finished;
    after(() =>
      recordServerEvent({
        eventName: EVENTS.PRACTICE_SET_MARKED,
        userId,
        properties: {
          set_id: id,
          questions: progress.total,
          score,
          out_of: outOf,
          percent: outOf ? Math.round((score / outOf) * 100) : null,
        },
        path: `/practice-paper/${id}`,
      }),
    );
  }
  return NextResponse.json({ status: progress.status, done: progress.done, total: progress.total });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPaperId(id)) return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: set } = await admin
    .from("practice_sets")
    .select("user_id, status, question_ids")
    .eq("id", id)
    .maybeSingle();
  if (!set || set.user_id !== userId) return NextResponse.json({ error: "Paper not found" }, { status: 404 });

  const total = (set.question_ids as string[]).length;
  const { count } = await admin
    .from("practice_set_answers")
    .select("question_id", { count: "exact", head: true })
    .eq("set_id", id)
    .in("mark_state", ["marked", "failed", "skipped"]);
  return NextResponse.json({
    status: set.status,
    done: set.status === "marked" ? total : Math.min(total, count ?? 0),
    total,
  });
}
