// src/lib/onboarding/checklist.ts
//
// "Your first week" — the dashboard checklist that walks a new student from
// signup to a habit. Server-only.
//
// Every item is derived from data that already exists (answers, papers,
// consent, referrals); there is no checklist table to drift out of step with
// what the student actually did. Reads use the service-role client keyed on
// the verified user id, like the rest of the dashboard.

import { createAdminClient } from "@/lib/supabase/server";
import { getParentConsentState } from "@/lib/parent-consent/service";

/** The checklist disappears this long after onboarding, finished or not. */
const SHOW_FOR_DAYS = 14;

export type ChecklistKey = "first_answer" | "handwritten" | "paper" | "parent" | "invite";

export interface ChecklistItem {
  key: ChecklistKey;
  done: boolean;
  /** Started but not finished — e.g. a friend joined but hasn't counted yet. */
  inProgress?: boolean;
}

export interface FirstWeekChecklist {
  items: ChecklistItem[];
  done: number;
  total: number;
}

/** Null when the checklist shouldn't show: complete, past its window, or unreadable. */
export async function readFirstWeekChecklist(userId: string): Promise<FirstWeekChecklist | null> {
  const admin = createAdminClient();

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("onboarded_at")
    .eq("id", userId)
    .maybeSingle();
  if (profileError || !profile?.onboarded_at) return null;
  if (Date.now() - Date.parse(profile.onboarded_at as string) > SHOW_FOR_DAYS * 86_400_000) return null;

  const count = (res: { count: number | null; error: unknown }) => (res.error ? 0 : (res.count ?? 0));

  // While the consent kill switch is on, nothing is asking for a parent, so
  // the checklist doesn't either.
  const consentEnforced = process.env.DISABLE_PARENT_CONSENT_GATE !== "true";

  const [answers, handwritten, papers, referrals, qualified, consent] = await Promise.all([
    admin.from("student_answers").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin
      .from("student_answers")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("input_method", "handwritten"),
    admin
      .from("practice_sets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["marking", "marked"]),
    admin.from("referrals").select("id", { count: "exact", head: true }).eq("referrer_id", userId),
    admin
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", userId)
      .eq("status", "qualified"),
    consentEnforced ? getParentConsentState(userId) : Promise.resolve(null),
  ]);

  const items: ChecklistItem[] = [
    { key: "first_answer", done: count(answers) > 0 },
    { key: "handwritten", done: count(handwritten) > 0 },
    { key: "paper", done: count(papers) > 0 },
    ...(consent
      ? [{ key: "parent" as const, done: consent.status === "confirmed", inProgress: consent.status === "pending" }]
      : []),
    { key: "invite", done: count(qualified) > 0, inProgress: count(referrals) > 0 },
  ];
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;
  return { items, done, total: items.length };
}
