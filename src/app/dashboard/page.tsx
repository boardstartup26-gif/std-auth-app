import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: subjects, error: subjectsError } = await supabase
    .from("subjects")
    .select("*");

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

      <div className="mt-10 grid gap-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Signed in as
          </div>
          <div className="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            {user?.email ?? "Unknown"}
          </div>
          {user?.created_at ? (
            <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Created: {new Date(user.created_at).toLocaleString()}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
              Subjects
            </h2>
            <div className="text-sm text-zinc-500 dark:text-zinc-400">
              {Array.isArray(subjects) ? subjects.length : 0}
            </div>
          </div>

          {subjectsError ? (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
              Failed to load subjects: {subjectsError.message}
            </p>
          ) : !subjects || subjects.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
              No subjects found.
            </p>
          ) : (
            <ul className="mt-4 grid gap-2">
              {subjects.map((s: any) => {
                const label =
                  (typeof s?.name === "string" && s.name) ||
                  (typeof s?.title === "string" && s.title) ||
                  (typeof s?.subject_name === "string" && s.subject_name) ||
                  JSON.stringify(s);
                const key =
                  (typeof s?.id === "string" || typeof s?.id === "number") &&
                  s.id !== null
                    ? String(s.id)
                    : label;

                return (
                  <li
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
                    key={key}
                  >
                    {label}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

