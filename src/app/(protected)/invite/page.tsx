// /invite — the referral program's home. Reads the student's own referral
// summary and builds their link server-side; InviteView renders it.
// Rules and reward amounts come from lib/constants, never restated by hand.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { inviteUrl } from "@/lib/referrals/constants";
import { readInvitedBy, readReferralSummary } from "@/lib/referrals/service";
import { InviteView } from "./_components/InviteView";

export const dynamic = "force-dynamic";

export default async function InvitePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/invite");

  const [summary, invitedBy] = await Promise.all([readReferralSummary(user.id), readInvitedBy(user.id)]);
  const siteUrl = getSiteUrl();
  const url = summary.code && siteUrl ? inviteUrl(siteUrl, summary.code, { surface: "invite_page" }) : null;
  return <InviteView summary={summary} invitedBy={invitedBy} url={url} />;
}
