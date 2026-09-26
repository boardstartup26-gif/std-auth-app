// src/app/(protected)/layout.tsx
//
// Shell for every signed-in surface: navigation rail, a top bar carrying the
// credit balance, the parent-consent notice, then the page.
//
// The balance is read here rather than per page so the chrome is identical
// everywhere and each page does not repeat the query. Middleware has already
// refused unauthenticated requests to these prefixes; the getUser call below is
// for identity, not for the gate.
//
// The consent notice is guidance, not enforcement: layouts don't re-render on
// every client navigation, so the authoritative check is per request in
// src/app/api/evaluate/route.ts.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readCredits } from "@/lib/credits";
import { readOnboardingProfile } from "@/lib/onboarding/profile";
import { readUnreadCount } from "@/lib/notifications/service";
import { getEvaluationGateState } from "@/lib/parent-consent/service";
import { Sidebar } from "@/app/_components/Sidebar";
import { MobileNav } from "@/app/_components/MobileNav";
import { TopBar } from "@/app/_components/TopBar";
import { ParentConsentNotice } from "./_parent-consent/ParentConsentNotice";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [credits, gate, profile, unread] = user
    ? await Promise.all([
        readCredits(user.id),
        getEvaluationGateState(user.id),
        readOnboardingProfile(user.id),
        readUnreadCount(user.id),
      ])
    : [null, null, null, 0];

  // A null profile (read failed) falls through rather than redirecting —
  // onboarding is a first-run experience, not a gate on the product.
  if (profile && !profile.onboarded) redirect("/onboarding");

  return (
    <div className="min-h-dvh bg-background md:flex">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav credits={credits} unread={unread} />
        <TopBar credits={credits} unread={unread} />
        {gate ? <ParentConsentNotice gate={gate} /> : null}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
