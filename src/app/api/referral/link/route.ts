// GET /api/referral/link?surface=<ShareSurface>&q=<question id>
//
// The signed-in student's personal invite link and a ready-to-send message,
// for the share buttons on client pages (/evaluate, results). The origin comes
// from getSiteUrl(), never the request host, like every other link we build.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { getOrCreateReferralCode } from "@/lib/referrals/service";
import { inviteMessage, inviteUrl, type ShareSurface } from "@/lib/referrals/constants";

const SURFACES: ReadonlySet<string> = new Set<ShareSurface>([
  "invite_page",
  "out_of_credits",
  "result",
  "paper_results",
  "dashboard",
  "checklist",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const rawSurface = params.get("surface") ?? "";
  const surface = (SURFACES.has(rawSurface) ? rawSurface : "invite_page") as ShareSurface;
  const rawQ = params.get("q");
  const questionId = rawQ && UUID.test(rawQ) ? rawQ : null;
  const challenge = params.get("challenge")?.slice(0, 120) ?? null;

  const siteUrl = getSiteUrl();
  const code = await getOrCreateReferralCode(user.id);
  if (!siteUrl || !code) {
    return NextResponse.json({ error: "Invite link unavailable" }, { status: 500 });
  }

  const url = inviteUrl(siteUrl, code, { surface, questionId });
  return NextResponse.json({ code, url, message: inviteMessage(url, challenge) });
}
