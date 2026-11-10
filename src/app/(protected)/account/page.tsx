import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DeleteAccountButton } from "./_components/DeleteAccountButton";
import { btnSecondary, cardPadded, pageShell, sectionLabel } from "@/lib/ui";
import { readEmailReminders } from "@/lib/email/reminder-preferences";
import { PendingSubmit } from "@/app/_components/states/PendingSubmit";
import { inviteParentToReports, updateEmailReminders } from "./actions";
import { maskEmail } from "@/lib/parent-consent/service";
import { parentReportsLive, readReportRow, reportState } from "@/lib/parent-report/service";

const REPORT_NOTICE: Record<string, string> = {
  sent: "Invite sent. Summaries start once your parent or guardian turns them on from that email.",
  cooldown: "An invite was sent in the last 24 hours. Ask them to check their inbox (and spam folder).",
  unavailable: "Weekly summaries need a parent or guardian to have confirmed consent first.",
  error: "We couldn’t send the invite just now. Please try again later.",
};

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string }>;
}) {
  const { report: reportNotice } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const reportsLive = parentReportsLive();
  const [{ count }, remindersOn, reportRow] = await Promise.all([
    supabase
      .from("student_answers")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id),
    readEmailReminders(user.id),
    reportsLive ? readReportRow(user.id) : Promise.resolve(null),
  ]);
  const parentReport = reportsLive ? reportState(reportRow) : null;

  const firstName = (user.user_metadata?.first_name as string | undefined)?.trim();
  const lastName = (user.user_metadata?.last_name as string | undefined)?.trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  return (
    <div className={pageShell}>
      <div className="flex items-center justify-between">
        <div>
          <p className={sectionLabel}>BoardEdge</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Account</h1>
        </div>
        <Link href="/dashboard" className="h-10 rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-raised flex items-center">
          ← Dashboard
        </Link>
      </div>

      <div className="mt-12 grid gap-8 md:grid-cols-2">
        <div className={cardPadded}>
          <p className={sectionLabel}>Account details</p>
          <div className="mt-4 space-y-3">
            {fullName && (
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="mt-1 text-sm font-medium text-foreground">{fullName}</p>
              </div>
            )}
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
          <p className={sectionLabel}>Reminder emails</p>
          <p className="mt-3 text-sm text-muted-foreground">
            {remindersOn
              ? "On. We email you when an answer you dropped marks on is ready for another go, at most once every two days."
              : "Off. You'll still see reminders in the bell at the top of the page."}
          </p>
          <form action={updateEmailReminders} className="mt-6">
            <input type="hidden" name="enabled" value={remindersOn ? "false" : "true"} />
            <PendingSubmit pendingLabel="Saving…" className={btnSecondary}>
              {remindersOn ? "Turn off reminder emails" : "Turn on reminder emails"}
            </PendingSubmit>
          </form>
        </div>

        {parentReport ? (
          <div id="parent-report" className={`${cardPadded} scroll-mt-20`}>
            <p className={sectionLabel}>Weekly summary for your parent</p>
            <p className="mt-3 text-sm text-muted-foreground">
              {parentReport === "on"
                ? `On. Each Monday your parent or guardian gets a short summary at ${maskEmail(reportRow!.parentEmail!)}: how much you practised, your marks, marks won back and where you’re losing them. Never your answers. They can stop it from any summary.`
                : parentReport === "off"
                  ? "Your parent or guardian can get a short Monday summary of your practice: marks, marks won back and where you’re losing them. Never your answers. We’ll email them an invite; nothing is sent unless they turn it on."
                  : "Available once a parent or guardian has confirmed consent for your account."}
            </p>
            {reportNotice && REPORT_NOTICE[reportNotice] ? (
              <p role="status" className="mt-3 text-sm text-foreground">
                {REPORT_NOTICE[reportNotice]}
              </p>
            ) : null}
            {parentReport === "off" ? (
              <form action={inviteParentToReports} className="mt-6">
                <PendingSubmit pendingLabel="Sending…" className={btnSecondary}>
                  Invite my parent
                </PendingSubmit>
              </form>
            ) : null}
          </div>
        ) : null}

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