import Link from "next/link";
import { Gauge, BarChart2, PieChart } from "lucide-react";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { WEEKLY_TOKEN_LIMIT } from "@/lib/constants";
import { getUsageDateIST, getUsageWindowStartIST } from "@/lib/usage-date";
import { Hairline } from "@/app/_components/Hairline";
import { Rail, RailContent, RailLayout, RailNote } from "@/app/_components/Rail";
import { btnPrimary, btnSecondary, numericMono, sectionLabel, tokenCountClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

const ANALYTICS_PLACEHOLDERS = [
  { icon: Gauge, label: "Accuracy Overview", desc: "Your overall accuracy score" },
  { icon: BarChart2, label: "Chapter Breakdown", desc: "Bar chart by chapter/topic" },
  { icon: PieChart, label: "Subject Completion", desc: "Completion donuts across subjects" },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const firstName = (user?.user_metadata?.first_name as string | undefined)?.trim();
  const greetingName = firstName || user?.email?.split("@")[0] || "there";

  // The rail carries running context (§3), and on this surface that is the
  // token balance. Same rolling-window arithmetic as /api/usage — read here
  // directly rather than fetched, since this is already a server render and a
  // client round-trip would only make the number arrive late. Admin client for
  // the same reason history/page.tsx uses it: `usage` is business data, scoped
  // by the user id the verified session just gave us.
  let tokensRemaining: number | null = null;
  if (user) {
    const today = getUsageDateIST();
    const { data: usageRows } = await createAdminClient()
      .from("usage")
      .select("token_count")
      .eq("user_id", user.id)
      .gte("usage_date", getUsageWindowStartIST(today))
      .lte("usage_date", today);
    const used = (usageRows ?? []).reduce((sum, row) => sum + row.token_count, 0);
    tokensRemaining = Math.max(0, WEEKLY_TOKEN_LIMIT - used);
  }

  const todayLabel = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  return (
    <RailLayout>
      <Rail>
        <RailNote label="Today">{todayLabel}</RailNote>
        {tokensRemaining !== null ? (
          <RailNote label="Tokens">
            <span className={tokenCountClass(tokensRemaining)}>{tokensRemaining}</span>
            <span className={`${numericMono} text-muted-foreground`}> / {WEEKLY_TOKEN_LIMIT}</span>
          </RailNote>
        ) : null}
        {user?.created_at ? (
          <RailNote label="Member since">
            {new Date(user.created_at).toLocaleDateString("en-IN", {
              month: "short",
              year: "numeric",
            })}
          </RailNote>
        ) : null}
      </Rail>

      <RailContent>
        <p className={sectionLabel}>BoardEdge</p>
        <h1 className="display-section mt-2">Student dashboard</h1>
        <p className="mt-4 max-w-[var(--measure)] text-muted-foreground">
          Hello, {greetingName}. Choose a past-paper question, submit your answer, and see
          exactly where the marks were awarded and where they were withheld.
        </p>

        <Hairline className="my-8" />

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/evaluate" className={btnPrimary}>
            Start new evaluation
          </Link>
          <Link href="/history" className={btnSecondary}>
            View history
          </Link>
        </div>

        <Hairline className="my-8" />

        {/* Analytics placeholders — no charting library yet, structural only. */}
        <p className={sectionLabel}>Coming next</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {ANALYTICS_PLACEHOLDERS.map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-5"
            >
              <Icon size={20} strokeWidth={1.5} className="text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </RailContent>
    </RailLayout>
  );
}
