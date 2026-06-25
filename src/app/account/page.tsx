// app/account/page.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DeleteAccountButton } from "./_components/DeleteAccountButton";
import { ThemeToggle } from "@/app/_components/ThemeToggle";
import { btnPrimary, cardPadded, pageShell, sectionLabel } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { count } = await supabase
    .from("student_answers")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  return (
    <div className={pageShell}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--foreground)]/50">
            BoardEdge
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--foreground)]">
            Account
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/dashboard"
            className="h-10 rounded-xl border border-[var(--border)] px-4 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--border)] flex items-center"
          >
            ← Dashboard
          </Link>
        </div>
      </div>

      <div className="mt-12 grid gap-8 md:grid-cols-2">
        <div className={cardPadded}>
          <p className={sectionLabel}>Account details</p>
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-xs text-[var(--foreground)]/50">Email</p>
              <p className="mt-1 text-sm font-medium text-[var(--foreground)]">{user.email}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--foreground)]/50">Member since</p>
              <p className="mt-1 text-sm font-medium text-[var(--foreground)]">
                {new Date(user.created_at).toLocaleDateString("en-IN", {
                  day: "numeric", month: "long", year: "numeric",
                })}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--foreground)]/50">Total evaluations</p>
              <p className="mt-1 text-sm font-medium text-[var(--foreground)]">{count ?? 0}</p>
            </div>
          </div>
        </div>

        <div className={cardPadded}>
          <p className={sectionLabel}>Danger zone</p>
          <p className="mt-3 text-sm text-[var(--foreground)]/60">
            Permanently deletes your account and all evaluation history. This cannot be undone.
          </p>
          <div className="mt-6">
            <DeleteAccountButton />
          </div>
        </div>
      </div>
    </div>
  );
}