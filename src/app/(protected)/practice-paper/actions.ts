"use server";

// Practice-paper server actions: build a paper, start it, autosave answers,
// hand it in, and build a retry paper from the questions that lost marks.
//
// Every write goes through the service-role client keyed on the verified
// session user, and every paper is re-read and checked against that user
// before anything is written. There is no client write path to
// practice_sets or practice_set_answers.

import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { SUBJECTS } from "@/app/(protected)/evaluate/_lib/question";
import {
  DIFFICULTIES,
  LENGTHS,
  MAX_QUESTIONS,
  MAX_TARGET_MARKS,
  SET_TYPES,
  type SetSpec,
} from "@/lib/practice-sets/constants";
import { loadPool, masteredQuestionIds, selectQuestions } from "@/lib/practice-sets/build";
import { creditCost } from "@/lib/practice-sets/mark";
import { isPaperId, readPaper } from "@/lib/practice-sets/read";
import { refundTokens, reserveTokens } from "@/lib/evaluation/grading";
import { getEvaluationGateState } from "@/lib/parent-consent/service";
import { getUsageDateIST } from "@/lib/usage-date";
import { EVENTS } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";

const MAX_ANSWER_CHARS = 12_000;

async function currentUserId(next: string): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user.id;
}

// ─── Build ───────────────────────────────────────────────────────────────────

export type BuildState = { ok: false; message: string } | null;

const count = (max: number) => z.coerce.number().int().min(0).max(max);

const SpecSchema = z
  .object({
    subject: z.enum(SUBJECTS),
    objective: count(SET_TYPES[0].max),
    short: count(SET_TYPES[1].max),
    long: count(SET_TYPES[2].max),
    target_marks: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : Number(v)))
      .pipe(z.number().int().min(1).max(MAX_TARGET_MARKS).nullable()),
    difficulty: z.enum(DIFFICULTIES),
    length: z.enum(LENGTHS),
    chapters: z.array(z.string().max(200)).max(60),
    skip_mastered: z.boolean(),
  })
  .refine((s) => s.objective + s.short + s.long >= 1, { message: "Add at least one question." })
  .refine((s) => s.objective + s.short + s.long <= MAX_QUESTIONS, {
    message: `A paper can have up to ${MAX_QUESTIONS} questions.`,
  });

export async function buildPracticeSet(_prev: BuildState, formData: FormData): Promise<BuildState> {
  const userId = await currentUserId("/practice-paper");

  const parsed = SpecSchema.safeParse({
    subject: formData.get("subject"),
    objective: formData.get("objective") ?? 0,
    short: formData.get("short") ?? 0,
    long: formData.get("long") ?? 0,
    target_marks: String(formData.get("target_marks") ?? ""),
    difficulty: formData.get("difficulty") ?? "any",
    length: formData.get("length") ?? "custom",
    chapters: formData.getAll("chapters").map(String),
    skip_mastered: formData.get("skip_mastered") === "on",
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check your choices and try again." };
  }
  const p = parsed.data;
  const spec: SetSpec = {
    subject: p.subject,
    counts: { objective: p.objective, short: p.short, long: p.long },
    // A marks target is a Custom-only control; presets never send one.
    targetMarks: p.length === "custom" ? p.target_marks : null,
    difficulty: p.difficulty,
    chapters: p.chapters,
    skipMastered: p.skip_mastered,
    length: p.length,
  };

  let result;
  try {
    const [pool, mastered] = await Promise.all([
      loadPool(spec.subject),
      spec.skipMastered ? masteredQuestionIds(userId) : Promise.resolve(new Set<string>()),
    ]);
    result = selectQuestions(pool, spec, { mastered });
  } catch (err) {
    console.error("[BoardEdge] practice set build failed:", err);
    return { ok: false, message: "We couldn't build that paper just now. Please try again." };
  }
  if (!result.ok) return { ok: false, message: result.message };

  const { data: row, error } = await createAdminClient()
    .from("practice_sets")
    .insert({
      user_id: userId,
      subject: spec.subject,
      spec,
      question_ids: result.questions.map((q) => q.id),
      total_marks: result.totalMarks,
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("[BoardEdge] practice set insert failed:", error?.message);
    return { ok: false, message: "We couldn't save that paper just now. Please try again." };
  }

  after(() =>
    recordServerEvent({
      eventName: EVENTS.PRACTICE_SET_CREATED,
      userId,
      properties: {
        set_id: row.id,
        subject: spec.subject,
        length: spec.length,
        counts: spec.counts,
        target_marks: spec.targetMarks,
        total_marks: result.totalMarks,
        exact_fit: result.exactFit,
        difficulty: spec.difficulty,
        chapters: spec.chapters.length,
        skip_mastered: spec.skipMastered,
      },
      path: "/practice-paper",
    }),
  );

  redirect(`/practice-paper/${row.id}${result.exactFit ? "" : "?fit=closest"}`);
}

// ─── Attempt ─────────────────────────────────────────────────────────────────

/** The paper, if it belongs to this user. Read with the service role, checked here. */
async function ownPaper(userId: string, setId: string) {
  if (!isPaperId(setId)) return null;
  const { data } = await createAdminClient()
    .from("practice_sets")
    .select("id, user_id, subject, status, question_ids, started_at")
    .eq("id", setId)
    .maybeSingle();
  if (!data || data.user_id !== userId) return null;
  return data as {
    id: string;
    user_id: string;
    subject: string;
    status: "in_progress" | "marking" | "marked";
    question_ids: string[];
    started_at: string | null;
  };
}

export async function startPaper(setId: string): Promise<{ ok: boolean }> {
  const userId = await currentUserId(`/practice-paper/${setId}`);
  const paper = await ownPaper(userId, setId);
  if (!paper || paper.status !== "in_progress") return { ok: false };
  if (paper.started_at) return { ok: true };
  const { data } = await createAdminClient()
    .from("practice_sets")
    .update({ started_at: new Date().toISOString() })
    .eq("id", setId)
    .is("started_at", null)
    .select("id");
  if (data?.length) {
    after(() =>
      recordServerEvent({
        eventName: EVENTS.PRACTICE_SET_STARTED,
        userId,
        properties: { set_id: setId, subject: paper.subject, questions: paper.question_ids.length },
        path: `/practice-paper/${setId}`,
      }),
    );
  }
  return { ok: true };
}

export type SaveResult = { ok: true; savedAt: string } | { ok: false; reason: "closed" | "locked" | "invalid" | "error" };

/**
 * Autosave for one answer. Drafts are a minor's answers being stored, so the
 * same consent gate as grading applies (CLAUDE.md, DPDP): a student who can't
 * be graded right now can't have answers kept either.
 */
export async function saveAnswer(input: {
  setId: string;
  questionId: string;
  text: string;
  flagged: boolean;
}): Promise<SaveResult> {
  const parsed = z
    .object({
      setId: z.string().uuid(),
      questionId: z.string().uuid(),
      text: z.string().max(MAX_ANSWER_CHARS),
      flagged: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { setId, questionId, text, flagged } = parsed.data;

  const userId = await currentUserId(`/practice-paper/${setId}`);
  const [paper, gate] = await Promise.all([ownPaper(userId, setId), getEvaluationGateState(userId)]);
  if (!paper || !paper.question_ids.includes(questionId)) return { ok: false, reason: "invalid" };
  if (paper.status !== "in_progress") return { ok: false, reason: "closed" };
  if (!gate.allowed) return { ok: false, reason: "locked" };

  const savedAt = new Date().toISOString();
  const admin = createAdminClient();
  const { error } =
    !text && !flagged
      ? await admin.from("practice_set_answers").delete().eq("set_id", setId).eq("question_id", questionId)
      : await admin.from("practice_set_answers").upsert(
          {
            set_id: setId,
            question_id: questionId,
            user_id: userId,
            answer_text: text,
            flagged,
            mark_state: "draft",
            updated_at: savedAt,
          },
          { onConflict: "set_id,question_id" },
        );
  if (error) {
    console.error("[BoardEdge] practice answer save failed:", error.message);
    return { ok: false, reason: "error" };
  }
  return { ok: true, savedAt };
}

// ─── Submit ──────────────────────────────────────────────────────────────────

export type SubmitResult = { ok: true } | { ok: false; message: string };

/**
 * Hands the paper in. Order matters, as in /api/evaluate: consent gate first,
 * then the paper is claimed (in_progress -> marking, so a double click can't
 * submit twice), then the whole paper's credits are reserved in one atomic
 * call. Marking itself happens in /api/practice-paper/[id]/mark.
 */
export async function submitPaper(setId: string): Promise<SubmitResult> {
  const userId = await currentUserId(`/practice-paper/${setId}`);
  const paper = await ownPaper(userId, setId);
  if (!paper) return { ok: false, message: "We couldn't find that paper." };
  if (paper.status !== "in_progress") return { ok: true };

  const admin = createAdminClient();
  const [{ data: rows, error: rowsError }, { data: qs, error: qError }, gate] = await Promise.all([
    admin.from("practice_set_answers").select("question_id, answer_text, flagged").eq("set_id", setId),
    admin.from("questions").select("id, is_subjective, question_type").in("id", paper.question_ids),
    getEvaluationGateState(userId),
  ]);
  if (rowsError || qError) {
    console.error("[BoardEdge] paper submit read failed:", rowsError?.message ?? qError?.message);
    return { ok: false, message: "We couldn't submit your paper just now. Please try again." };
  }

  const answers = new Map(
    ((rows ?? []) as { question_id: string; answer_text: string; flagged: boolean }[]).map((r) => [r.question_id, r]),
  );
  const answered = paper.question_ids.filter((id) => answers.get(id)?.answer_text.trim());
  if (!answered.length) return { ok: false, message: "Answer at least one question before you submit." };

  if (!gate.allowed) {
    return {
      ok: false,
      message:
        gate.consent.status === "revoked"
          ? "Marking is paused because your parent or guardian withdrew consent."
          : gate.consent.status === "unavailable"
            ? "We couldn't check your parent or guardian consent. Please try again in a moment."
            : "Marking unlocks once your parent or guardian confirms consent. Check the notice at the top of the page.",
    };
  }
  // Inside the free quota, a paper can't spend more free evaluations than are left.
  if (gate.consent.status !== "confirmed" && answered.length > gate.freeEvaluationsRemaining) {
    return {
      ok: false,
      message: `Until your parent or guardian confirms consent, you can have ${gate.freeEvaluationsRemaining} more ${
        gate.freeEvaluationsRemaining === 1 ? "answer" : "answers"
      } marked. Check the notice at the top of the page.`,
    };
  }

  const byId = new Map(((qs ?? []) as { id: string; is_subjective: boolean; question_type: string | null }[]).map((q) => [q.id, q]));
  const cost = answered.reduce((sum, id) => sum + (byId.has(id) ? creditCost(byId.get(id)!) : 0), 0);

  const submittedAt = new Date().toISOString();
  const { data: claimed } = await admin
    .from("practice_sets")
    .update({ status: "marking", submitted_at: submittedAt })
    .eq("id", setId)
    .eq("status", "in_progress")
    .select("id");
  if (!claimed?.length) return { ok: true }; // already handed in (double click, second tab)

  const reopen = () =>
    admin.from("practice_sets").update({ status: "in_progress", submitted_at: null }).eq("id", setId).eq("status", "marking");

  const today = getUsageDateIST();
  if (cost > 0) {
    const reservation = await reserveTokens(admin, userId, today, cost);
    if (!reservation.ok) {
      await reopen();
      return {
        ok: false,
        message: `Marking this paper needs ${cost} ${cost === 1 ? "credit" : "credits"}, and you don’t have enough left this week. Clear some answers or try again when your credits refill.`,
      };
    }
  }

  const { error: upsertError } = await admin.from("practice_set_answers").upsert(
    paper.question_ids.map((id) => {
      const a = answers.get(id);
      const text = a?.answer_text ?? "";
      return {
        set_id: setId,
        question_id: id,
        user_id: userId,
        answer_text: text,
        flagged: a?.flagged ?? false,
        mark_state: text.trim() ? "pending" : "skipped",
        updated_at: submittedAt,
      };
    }),
    { onConflict: "set_id,question_id" },
  );
  if (upsertError) {
    console.error("[BoardEdge] paper submit write failed:", upsertError.message);
    if (cost > 0) await refundTokens(admin, userId, today, cost);
    await reopen();
    return { ok: false, message: "We couldn't submit your paper just now. Please try again." };
  }

  after(() =>
    recordServerEvent({
      eventName: EVENTS.PRACTICE_SET_SUBMITTED,
      userId,
      properties: {
        set_id: setId,
        subject: paper.subject,
        questions: paper.question_ids.length,
        answered: answered.length,
        blank: paper.question_ids.length - answered.length,
        credits_reserved: cost,
        duration_s: paper.started_at ? Math.round((Date.parse(submittedAt) - Date.parse(paper.started_at)) / 1000) : null,
      },
      path: `/practice-paper/${setId}`,
    }),
  );
  return { ok: true };
}

// ─── Retry missed ────────────────────────────────────────────────────────────

/** A new paper made of the questions that didn't get full marks. */
export async function retryMissed(setId: string): Promise<void> {
  const userId = await currentUserId(`/practice-paper/${setId}`);
  const paper = await readPaper(userId, setId);
  if (!paper || paper.status !== "marked") redirect(`/practice-paper/${setId}`);

  const missed = paper.questions.filter((q) => {
    const r = paper.results[q.id];
    return !r || r.awarded < q.marks;
  });
  if (!missed.length) redirect(`/practice-paper/${setId}`);

  const spec: SetSpec = { ...paper.spec, targetMarks: null, retryOf: setId };
  const { data: row, error } = await createAdminClient()
    .from("practice_sets")
    .insert({
      user_id: userId,
      subject: paper.subject,
      spec,
      question_ids: missed.map((q) => q.id),
      total_marks: missed.reduce((s, q) => s + q.marks, 0),
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("[BoardEdge] retry paper insert failed:", error?.message);
    redirect(`/practice-paper/${setId}`);
  }

  after(() =>
    recordServerEvent({
      eventName: EVENTS.PRACTICE_SET_CREATED,
      userId,
      properties: { set_id: row.id, subject: paper.subject, retry_of: setId, questions: missed.length },
      path: `/practice-paper/${setId}`,
    }),
  );
  redirect(`/practice-paper/${row.id}`);
}
