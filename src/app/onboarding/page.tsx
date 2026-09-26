// First-run page for a new student: class, subjects, and how they found us.
//
// Deliberately outside the (protected) route group — that layout redirects
// un-onboarded users here, so living inside it would loop, and a half-set-up
// student has no use for the sidebar yet. Middleware still gates it on a
// session (PROTECTED_PREFIXES).

import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readOnboardingProfile } from "@/lib/onboarding/profile";
import { sectionLabel } from "@/lib/ui";
import { OnboardingForm } from "./_components/OnboardingForm";

export const dynamic = "force-dynamic";

function metaString(meta: Record<string, unknown> | undefined, key: string): string | null {
  const v = meta?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await readOnboardingProfile(user.id);
  if (profile?.onboarded) redirect("/dashboard");

  // Email signups already gave a name; Google ones only have given_name/
  // family_name in their metadata, which the profile trigger never copies.
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const fullName = metaString(meta, "full_name") ?? metaString(meta, "name");
  const firstName =
    profile?.firstName ?? metaString(meta, "first_name") ?? metaString(meta, "given_name") ?? fullName?.split(" ")[0] ?? "";
  const lastName =
    profile?.lastName ??
    metaString(meta, "last_name") ??
    metaString(meta, "family_name") ??
    (fullName?.includes(" ") ? fullName.slice(fullName.indexOf(" ") + 1) : "");

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-3xl items-center px-6 py-3.5">
          <Image src="/logo-lockup.png" alt="BoardEdge" width={101} height={30} priority />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-20 pt-12">
        <p className={sectionLabel}>Welcome to BoardEdge</p>
        <h1 className="display-section mt-3 max-w-[22ch] text-balance">
          Four quick answers before your first marked one.
        </h1>
        <p className="mt-4 max-w-[var(--measure)] leading-relaxed text-muted-foreground">
          This shows you the right papers and keeps your practice in the right place. It stays in your
          account — we never share it.
        </p>

        <OnboardingForm defaultFirstName={firstName} defaultLastName={lastName} />
      </main>
    </div>
  );
}
