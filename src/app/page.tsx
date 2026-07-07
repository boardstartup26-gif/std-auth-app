import Link from "next/link";
import { btnPrimary, btnSecondary, pageShell, sectionLabel } from "@/lib/ui";

export default function Home() {
  return (
    <main className={`${pageShell} relative flex min-h-dvh flex-col justify-center py-20`}>
      <div className="space-y-4">
        <p className={sectionLabel}>BoardEdge</p>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">
          ICSE answer evaluation, examiner-grade.
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
          Submit past paper answers against official marking schemes and receive instant,
          structured feedback built for serious board exam prep.
        </p>
      </div>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link href="/login" className={btnPrimary}>Log in</Link>
        <Link href="/signup" className={btnSecondary}>Create account</Link>
        <Link href="/dashboard" className="inline-flex h-11 items-center justify-center px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}