import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import Link from "next/link";
import { btnPrimary, btnSecondary, cardPadded, pageShell, sectionLabel } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className={pageShell}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-foreground/50">BoardEdge</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Student dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/account" className="h-10 rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-border flex items-center">
            Account
          </Link>
          <form action={signOut}>
            <button className="h-10 rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-border" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="mt-12 grid gap-8 md:grid-cols-2">
        <div className={cardPadded}>
          <p className={sectionLabel}>Signed in as</p>
          <p className="mt-3 text-lg font-semibold text-[var(--foreground)]">
            {user?.email ?? "Unknown"}
          </p>
          {user?.created_at ? (
            <p className="mt-2 text-sm text-[var(--foreground)]/60">
              Member since{" "}
              {new Date(user.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          ) : null}
        </div>

        <div className={`${cardPadded} flex flex-col justify-between`}>
          <div>
            <p className={sectionLabel}>Evaluation engine</p>
            <h2 className="mt-3 text-lg font-semibold tracking-tight text-[var(--foreground)]">
              AI-powered marking
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--foreground)]/60">
              Evaluated against the official ICSE marking scheme — marks, examiner feedback,
              and exactly what the board expects you to write.
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <Link href="/evaluate" className={`${btnPrimary} w-full`}>
              Start new evaluation
            </Link>
            <Link href="/history" className={`${btnSecondary} w-full`}>
              View history
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}