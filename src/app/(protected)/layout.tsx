// src/app/(protected)/layout.tsx
//
// Shell for every signed-in surface: navigation rail, a top bar carrying the
// credit balance, then the page.
//
// The balance is read here rather than per page so the chrome is identical
// everywhere and each page does not repeat the query. Middleware has already
// refused unauthenticated requests to these prefixes; the getUser call below is
// for identity, not for the gate.

import { createClient } from "@/lib/supabase/server";
import { readCredits } from "@/lib/credits";
import { Sidebar } from "@/app/_components/Sidebar";
import { MobileNav } from "@/app/_components/MobileNav";
import { TopBar } from "@/app/_components/TopBar";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const credits = user ? await readCredits(user.id) : null;

  return (
    <div className="min-h-dvh bg-background md:flex">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav credits={credits} />
        <TopBar credits={credits} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
