import Link from "next/link";
import { btnPrimary, btnSecondary, pageShell, sectionLabel } from "@/lib/ui";

export default function Home() {
  return (
    <main className={`${pageShell} flex min-h-dvh flex-col justify-center py-20`}>
      <div className="space-y-4">
        <p className={sectionLabel}>BoardEdge</p>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          ICSE answer evaluation, examiner-grade.
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Submit past paper answers against official marking schemes and receive instant,
          structured feedback built for serious board exam prep.
        </p>
      </div>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link href="/login" className={btnPrimary}>
          Log in
        </Link>
        <Link href="/signup" className={btnSecondary}>
          Create account
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex h-11 items-center justify-center px-4 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
