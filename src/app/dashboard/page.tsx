import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import Link from "next/link";
import { btnPrimary, btnSecondary, cardPadded, pageShell, sectionLabel } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className={pageShell}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            BoardEdge
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Student dashboard
          </h1>
        </div>
        <form action={signOut}>
          <button
            className="h-10 rounded-xl border border-zinc-200 px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </div>

      <div className="mt-12 grid gap-8 md:grid-cols-2">
        <div className={cardPadded}>
          <p className={sectionLabel}>Signed in as</p>
          <p className="mt-3 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            {user?.email ?? "Unknown"}
          </p>
          {user?.created_at ? (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
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
            <h2 className="mt-3 text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              AI-powered marking
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Submit past paper answers against official board marking schemes for instant,
              examiner-grade feedback.
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
