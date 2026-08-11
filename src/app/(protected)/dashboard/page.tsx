import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import Link from "next/link";
import { btnPrimary, btnSecondary, cardPadded, pageShell, sectionLabel } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const firstName = (user?.user_metadata?.first_name as string | undefined)?.trim();
  const greetingName = firstName || user?.email?.split("@")[0] || "there";

  return (
    <div className={pageShell}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-foreground/50">BoardEdge</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Student dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/account" className="h-10 rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-raised flex items-center">
            Account
          </Link>
          <form action={signOut}>
            <button className="h-10 rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-raised" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="mt-12 grid gap-8 md:grid-cols-2">
        <div
          className="rounded-2xl border border-border p-8"
          style={{ background: "linear-gradient(135deg, #1E3A5F 0%, var(--card) 70%)" }}
        >
          <p className={sectionLabel}>Welcome back</p>
          <p className="mt-3 text-xl font-semibold text-foreground">
            Hello, {greetingName}!
          </p>
          <p className="mt-2 text-sm text-foreground/70">
            {user?.email ?? "Unknown"}
          </p>
          {user?.created_at ? (
            <p className="mt-2 text-sm text-foreground/60">
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
            <h2 className="mt-3 text-lg font-semibold tracking-tight text-foreground">
              AI-powered marking
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-foreground/60">
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