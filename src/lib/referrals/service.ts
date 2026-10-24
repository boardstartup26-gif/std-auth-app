// src/lib/referrals/service.ts
//
// The referral program, server side. Server-only.
//
//   code      getOrCreateReferralCode — a student's personal /i/{code}
//   landing   findReferrerByCode — who a code belongs to (first name only)
//   signup    attachReferral — records who invited a genuinely new account
//   marking   recordWrittenAnswerForReferral — counts the friend's marked
//             written answers and, on the qualifying one, grants both sides
//   /invite   readReferralSummary — the inviter's own view
//
// Every write goes through the service-role client keyed on a user id that
// came from a verified session or the code exchange — never from a form, a
// cookie value alone, or raw_user_meta_data (browser-supplied).
//
// Nothing here throws to its caller: a referral is never worth failing a
// signup or a saved grade over. Failures are logged and dropped.

import { randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { EVENTS } from "@/lib/analytics/events";
import { ANON_COOKIE, recordServerEvent } from "@/lib/analytics/server";
import {
  MAX_REWARDED_REFERRALS,
  REFERRAL_QUALIFY_AT,
  REFERRAL_WEEKLY_BONUS,
} from "@/lib/constants";
import {
  REF_COOKIE,
  REFERRAL_ALPHABET,
  REFERRAL_CODE_LENGTH,
  normaliseReferralCode,
} from "./constants";
import { sendReferralQualifiedEmail } from "./email";

/** More than this many new referrals for one inviter in 24h is flagged, not rewarded. */
const BURST_LIMIT_PER_DAY = 20;
/** How far back an inviter's own devices are compared against a new signup's. */
const SAME_DEVICE_LOOKBACK_DAYS = 90;

// ─── Codes ──────────────────────────────────────────────────────────────────

function generateCode(): string {
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += REFERRAL_ALPHABET[randomInt(REFERRAL_ALPHABET.length)];
  }
  return code;
}

/**
 * The student's code, minted on first use. The update only fills a null
 * column, so two tabs racing here end on the same code; a collision with
 * another student's code (unique index) just retries with a fresh one.
 */
export async function getOrCreateReferralCode(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("referral_code")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[BoardEdge] referral code read failed:", error.message);
    return null;
  }
  if (data?.referral_code) return data.referral_code as string;

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateCode();
    const { error: updateError } = await admin
      .from("profiles")
      .update({ referral_code: candidate })
      .eq("id", userId)
      .is("referral_code", null);
    if (!updateError) {
      // Re-read rather than trust `candidate`: a concurrent request may have
      // set the column first, in which case our update matched nothing.
      const { data: after } = await admin
        .from("profiles")
        .select("referral_code")
        .eq("id", userId)
        .maybeSingle();
      return (after?.referral_code as string | null) ?? null;
    }
    if (updateError.code !== "23505") {
      console.error("[BoardEdge] referral code write failed:", updateError.message);
      return null;
    }
  }
  console.error("[BoardEdge] referral code: gave up after repeated collisions");
  return null;
}

export interface Referrer {
  userId: string;
  firstName: string | null;
}

export async function findReferrerByCode(raw: unknown): Promise<Referrer | null> {
  const code = normaliseReferralCode(raw);
  if (!code) return null;
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id, first_name")
    .eq("referral_code", code)
    .maybeSingle();
  if (error) {
    console.error("[BoardEdge] referral code lookup failed:", error.message);
    return null;
  }
  if (!data) return null;
  return {
    userId: data.id as string,
    firstName: ((data.first_name as string | null) ?? "").trim().split(/\s+/)[0] || null,
  };
}

// ─── Signup attribution ─────────────────────────────────────────────────────

async function readRequestCookie(name: string): Promise<string | null> {
  try {
    return (await cookies()).get(name)?.value ?? null;
  } catch (err) {
    unstable_rethrow(err);
    return null;
  }
}

/**
 * Has the inviter ever used the browser this account was just created from?
 * The same be_anon_id on both sides is the cheapest strong signal of someone
 * inviting themselves with a second email address.
 */
async function sharesDeviceWithReferrer(referrerId: string, anonId: string | null): Promise<boolean> {
  if (!anonId) return false;
  const since = new Date(Date.now() - SAME_DEVICE_LOOKBACK_DAYS * 86_400_000).toISOString();
  const { count, error } = await createAdminClient()
    .from("analytics_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", referrerId)
    .eq("anon_id", anonId)
    .gte("created_at", since);
  if (error) {
    console.warn("[BoardEdge] referral device check failed:", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

async function recentReferralCount(referrerId: string): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error } = await createAdminClient()
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("referrer_id", referrerId)
    .gte("created_at", since);
  if (error) {
    console.warn("[BoardEdge] referral burst check failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Called once, for a genuinely new account only (the same isRealNewUser /
 * isNewAccount flags that gate the welcome email). Reads the be_ref cookie set
 * by /i/{code}; the caller deletes it.
 */
export async function attachReferral(refereeId: string): Promise<{ attached: boolean }> {
  try {
    const code = normaliseReferralCode(await readRequestCookie(REF_COOKIE));
    if (!code) return { attached: false };

    const referrer = await findReferrerByCode(code);
    if (!referrer || referrer.userId === refereeId) return { attached: false };

    const anonId = (await readRequestCookie(ANON_COOKIE))?.slice(0, 64) ?? null;
    const [sameDevice, recent] = await Promise.all([
      sharesDeviceWithReferrer(referrer.userId, anonId),
      recentReferralCount(referrer.userId),
    ]);
    const flagReason = sameDevice ? "same_device" : recent >= BURST_LIMIT_PER_DAY ? "burst" : null;

    const { error } = await createAdminClient().from("referrals").insert({
      referrer_id: referrer.userId,
      referee_id: refereeId,
      code,
      status: flagReason ? "flagged" : "pending",
      flag_reason: flagReason,
      signup_anon_id: anonId,
    });
    if (error) {
      // 23505: this account already has an inviter. First link wins.
      if (error.code !== "23505") console.error("[BoardEdge] referral attach failed:", error.message);
      return { attached: false };
    }

    await recordServerEvent({
      eventName: EVENTS.REFERRAL_ATTACHED,
      userId: refereeId,
      properties: { flagged: Boolean(flagReason), flag_reason: flagReason },
      path: "/signup",
    });
    return { attached: true };
  } catch (err) {
    unstable_rethrow(err);
    console.error("[BoardEdge] referral attach threw:", err);
    return { attached: false };
  }
}

/** The referee's own view: who invited them (first name) and how far along they are. */
export async function readInvitedBy(
  refereeId: string,
): Promise<{ firstName: string | null; status: string; writtenMarked: number } | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("referrals")
    .select("referrer_id, status, written_marked")
    .eq("referee_id", refereeId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn("[BoardEdge] invited-by read failed:", error.message);
    return null;
  }
  const { data: profile } = await admin
    .from("profiles")
    .select("first_name")
    .eq("id", data.referrer_id as string)
    .maybeSingle();
  return {
    firstName: ((profile?.first_name as string | null) ?? "").trim().split(/\s+/)[0] || null,
    status: data.status as string,
    writtenMarked: data.written_marked as number,
  };
}

// ─── Qualification ──────────────────────────────────────────────────────────

async function grantBonuses(referralId: string, referrerId: string, refereeId: string) {
  const admin = createAdminClient();

  // The friend always gets theirs. The inviter only for their first
  // MAX_REWARDED_REFERRALS friends; later ones still show on /invite.
  const { count: rewarded } = await admin
    .from("credit_bonuses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", referrerId)
    .eq("reason", "referral_referrer");
  const rewardInviter = (rewarded ?? 0) < MAX_REWARDED_REFERRALS;

  const rows = [
    { user_id: refereeId, weekly_amount: REFERRAL_WEEKLY_BONUS, reason: "referral_referee", referral_id: referralId },
    ...(rewardInviter
      ? [{ user_id: referrerId, weekly_amount: REFERRAL_WEEKLY_BONUS, reason: "referral_referrer", referral_id: referralId }]
      : []),
  ];
  // upsert + ignoreDuplicates on the (referral_id, user_id) key: a retried
  // qualification can never grant twice.
  const { error } = await admin
    .from("credit_bonuses")
    .upsert(rows, { onConflict: "referral_id,user_id", ignoreDuplicates: true });
  if (error) console.error("[BoardEdge] referral bonus grant failed:", error.message);
  return { ok: !error, rewardInviter };
}

async function notifyInviter(referralId: string, referrerId: string, refereeId: string, rewarded: boolean) {
  const admin = createAdminClient();
  const { data: friend } = await admin
    .from("profiles")
    .select("first_name")
    .eq("id", refereeId)
    .maybeSingle();
  const friendName = ((friend?.first_name as string | null) ?? "").trim().split(/\s+/)[0] || "Your friend";

  const title = rewarded
    ? `${friendName} joined properly — +5 credits a week for you`
    : `${friendName} is now practising on BoardEdge`;
  const body = rewarded
    ? `${friendName} has had ${REFERRAL_QUALIFY_AT} answers marked, so you both now get 5 extra credits every week, for good.`
    : `${friendName} has had ${REFERRAL_QUALIFY_AT} answers marked. You've already earned the most referral credits there are — thanks for spreading the word.`;

  const { error } = await admin.from("notifications").insert({
    user_id: referrerId,
    kind: "system",
    title,
    body,
    href: "/invite",
    dedupe_key: `referral:${referralId}`,
  });
  if (error && error.code !== "23505") {
    console.error("[BoardEdge] referral notification failed:", error.message);
  }
  if (rewarded) await sendReferralQualifiedEmail({ userId: referrerId, friendName });
}

/**
 * Called after a written (examiner-graded) answer is saved. Advances the
 * student's pending referral, if any; on the qualifying answer, grants both
 * sides and tells the inviter. Idempotent and race-safe: the increment and the
 * status flip are one UPDATE in referral_record_written_answer().
 */
export async function recordWrittenAnswerForReferral(refereeId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("referral_record_written_answer", {
      p_referee_id: refereeId,
      p_qualify_at: REFERRAL_QUALIFY_AT,
    });
    if (error) {
      console.error("[BoardEdge] referral progress failed:", error.message);
      return;
    }
    const row = (data as { referral_id: string; referrer_id: string; newly_qualified: boolean }[] | null)?.[0];
    if (!row) {
      // No pending referral. A flagged one still records progress, so a
      // review can tell a real friend from a throwaway account.
      await admin.rpc("referral_record_flagged_progress", { p_referee_id: refereeId });
      return;
    }
    if (!row.newly_qualified) return;

    const { ok, rewardInviter } = await grantBonuses(row.referral_id, row.referrer_id, refereeId);
    // The referral is already marked qualified, so a failed grant needs a
    // hand fix (runbook in the migration); don't announce credits that
    // weren't added.
    if (!ok) return;
    await notifyInviter(row.referral_id, row.referrer_id, refereeId, rewardInviter);
    await recordServerEvent({
      eventName: EVENTS.REFERRAL_QUALIFIED,
      userId: refereeId,
      properties: { referrer_rewarded: rewardInviter },
    });
  } catch (err) {
    console.error("[BoardEdge] referral progress threw:", err);
  }
}

// ─── The inviter's view ─────────────────────────────────────────────────────

export interface ReferralFriend {
  firstName: string;
  /** joined → counting toward REFERRAL_QUALIFY_AT → counted. Flagged shows as "checking". */
  state: "joined" | "progress" | "counted" | "checking";
  writtenMarked: number;
  joinedAt: string;
}

export interface ReferralSummary {
  code: string | null;
  friends: ReferralFriend[];
  qualified: number;
  /** Weekly credits this student has earned from referrals (both directions). */
  weeklyBonusEarned: number;
}

export async function readReferralSummary(userId: string): Promise<ReferralSummary> {
  const admin = createAdminClient();
  const [code, referralsRes, bonusRes] = await Promise.all([
    getOrCreateReferralCode(userId),
    admin
      .from("referrals")
      .select("referee_id, status, written_marked, created_at")
      .eq("referrer_id", userId)
      .neq("status", "void")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("credit_bonuses")
      .select("weekly_amount, reason, expires_at")
      .eq("user_id", userId)
      .in("reason", ["referral_referrer", "referral_referee"]),
  ]);

  if (referralsRes.error) console.error("[BoardEdge] referral list failed:", referralsRes.error.message);
  if (bonusRes.error) console.error("[BoardEdge] referral bonus read failed:", bonusRes.error.message);

  const rows = referralsRes.data ?? [];
  const names = new Map<string, string>();
  if (rows.length) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, first_name")
      .in("id", rows.map((r) => r.referee_id as string));
    for (const p of profiles ?? []) {
      names.set(p.id as string, ((p.first_name as string | null) ?? "").trim().split(/\s+/)[0] || "A friend");
    }
  }

  const friends: ReferralFriend[] = rows.map((r) => {
    const status = r.status as string;
    const writtenMarked = (r.written_marked as number) ?? 0;
    return {
      firstName: names.get(r.referee_id as string) ?? "A friend",
      state:
        status === "qualified" ? "counted"
        : status === "flagged" ? "checking"
        : writtenMarked > 0 ? "progress"
        : "joined",
      writtenMarked,
      joinedAt: r.created_at as string,
    };
  });

  const now = Date.now();
  const weeklyBonusEarned = (bonusRes.data ?? [])
    .filter((b) => !b.expires_at || Date.parse(b.expires_at as string) > now)
    .reduce((sum, b) => sum + (b.weekly_amount as number), 0);

  return {
    code,
    friends,
    qualified: friends.filter((f) => f.state === "counted").length,
    weeklyBonusEarned,
  };
}
