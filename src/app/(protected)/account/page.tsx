import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DeleteAccountButton } from "./_components/DeleteAccountButton";
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
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">BoardEdge</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Account</h1>
        </div>
        <Link href="/dashboard" className="h-10 rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-border flex items-center">
          ← Dashboard
        </Link>
      </div>

      <div className="mt-12 grid gap-8 md:grid-cols-2">
        <div className={cardPadded}>
          <p className={sectionLabel}>Account details</p>
          <div className="mt-4 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="mt-1 text-sm font-medium text-foreground">{user.email}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Member since</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {new Date(user.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total evaluations</p>
              <p className="mt-1 text-sm font-medium text-foreground">{count ?? 0}</p>
            </div>
          </div>
        </div>

        <div className={cardPadded}>
          <p className={sectionLabel}>Danger zone</p>
          <p className="mt-3 text-sm text-muted-foreground">
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