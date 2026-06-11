import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Student dashboard
        </h1>
        <form action={signOut}>
          <button
            className="h-10 rounded-md border border-zinc-200 px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {/* Profile Card */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Signed in as
          </div>
          <div className="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            {user?.email ?? "Unknown"}
          </div>
          {user?.created_at ? (
            <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Created: {new Date(user.created_at).toLocaleDateString()}
            </div>
          ) : null}
        </div>

        {/* Action Card */}
        <div className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              AI Evaluation Engine
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Submit your past paper answers against official board marking schemes to receive instant, examiner-grade feedback.
            </p>
          </div>
          
          <div className="mt-6">
            <Link
              href="/evaluate"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-zinc-950 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              Start New Evaluation →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}