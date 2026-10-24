// GET /i/{code}[?q=<question id>&utm_…]
//
// A student's personal invite link. Remembers the code in the be_ref cookie
// (read once at signup) and sends the visitor straight to /signup, where the
// inviter's first name and the offer are shown. One step fewer than a separate
// landing page, on the path most of these visits come from: a WhatsApp tap on
// a phone.
//
// A `q` makes it a challenge link: the question is remembered too, and the new
// student is sent to it when onboarding finishes.
//
// An unknown or malformed code still lands on /signup, just without the cookie
// — so the link can't be used to test which codes exist.

import { after, NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { EVENTS } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";
import { CHALLENGE_COOKIE, REF_COOKIE, REF_COOKIE_MAX_AGE } from "@/lib/referrals/constants";
import { findReferrerByCode } from "@/lib/referrals/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** /evaluate deep link for a challenge question, or null if it doesn't resolve. */
async function challengePath(questionId: string | null): Promise<string | null> {
  if (!questionId || !UUID.test(questionId)) return null;
  const { data, error } = await createAdminClient()
    .from("questions")
    .select("id, subjects ( name )")
    .eq("id", questionId)
    .maybeSingle();
  if (error || !data) return null;
  const subject = (data.subjects as { name?: string } | { name?: string }[] | null);
  const name = Array.isArray(subject) ? subject[0]?.name : subject?.name;
  if (!name) return null;
  return `/evaluate?subject=${encodeURIComponent(name)}&q=${encodeURIComponent(questionId)}&src=challenge`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const incoming = request.nextUrl;

  // UTM tags ride along to /signup so first-touch attribution (captured in the
  // browser on the first page it runs on) still sees them.
  const target = new URL("/signup", incoming.origin);
  for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
    const value = incoming.searchParams.get(key);
    if (value) target.searchParams.set(key, value.slice(0, 128));
  }
  const response = NextResponse.redirect(target);

  const referrer = await findReferrerByCode(rawCode);
  if (!referrer) return response;

  const secure = incoming.protocol === "https:";
  response.cookies.set(REF_COOKIE, rawCode.trim().toUpperCase(), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: REF_COOKIE_MAX_AGE,
  });

  const challenge = await challengePath(incoming.searchParams.get("q"));
  if (challenge) {
    response.cookies.set(CHALLENGE_COOKIE, challenge, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: REF_COOKIE_MAX_AGE,
    });
  }

  after(() =>
    recordServerEvent({
      eventName: EVENTS.REFERRAL_LINK_OPENED,
      properties: {
        has_challenge: Boolean(challenge),
        utm_campaign: incoming.searchParams.get("utm_campaign")?.slice(0, 64) ?? null,
      },
      path: "/i",
    }),
  );
  return response;
}
