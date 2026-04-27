import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-dvh bg-zinc-50 font-sans text-zinc-950 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-20">
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight">
            Student Portal
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-300">
            Sign up or log in to access your student dashboard.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            className="inline-flex h-11 items-center justify-center rounded-md bg-black px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            href="/login"
          >
            Log in
          </Link>
          <Link
            className="inline-flex h-11 items-center justify-center rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            href="/signup"
          >
            Create account
          </Link>
          <Link
            className="inline-flex h-11 items-center justify-center rounded-md border border-transparent px-4 text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
            href="/dashboard"
          >
            Go to dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
