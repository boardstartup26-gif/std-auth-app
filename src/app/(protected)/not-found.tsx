// A signed-in page that doesn't exist — or that belongs to someone else, which
// the data layer deliberately reports the same way (a guessed result or paper
// id reads as "not found"; it must not reveal that the row exists). The copy
// therefore doesn't claim which of the two it was.

import Link from "next/link";
import { btnPrimary, btnSecondary, sectionLabel } from "@/lib/ui";

export default function ProtectedNotFound() {
  return (
    <div className="mx-auto min-h-[60vh] max-w-2xl px-6 py-16">
      <p className={sectionLabel}>Not available</p>
      <h1 className="display-section mt-3 text-balance">We can’t find that page</h1>
      <p className="mt-5 max-w-[var(--measure)] text-muted-foreground">
        It may have been removed, or the link may be incomplete. Your results and papers are all still in
        your account.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link href="/dashboard" className={btnPrimary}>
          Back to dashboard
        </Link>
        <Link href="/history" className={btnSecondary}>
          View your results
        </Link>
      </div>
    </div>
  );
}
