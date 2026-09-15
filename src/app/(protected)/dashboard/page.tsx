import Link from "next/link";
import { Gauge, BarChart2, PieChart } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { readCredits } from "@/lib/credits";
import { Hairline } from "@/app/_components/Hairline";
import { btnPrimary, btnSecondary, numericFigures, sectionLabel } from "@/lib/ui";

export const dynamic = "force-dynamic";

// No margin rail here either. It held the date, the credit balance and the
// join month — the balance now lives in the top bar on every page, and the
// other two did not earn a column of their own down the side of the page.
const dashboardShell = "mx-auto min-h-screen max-w-5xl px-6 py-12";

const ANALYTICS_PLACEHOLDERS = [
  { icon: Gauge, label: "Accuracy Overview", desc: "Your overall accuracy score" },
  { icon: BarChart2, label: "Chapter Breakdown", desc: "Bar chart by chapter/topic" },
  { icon: PieChart, label: "Subject Completion", desc: "Completion donuts across subjects" },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const firstName = (user?.user_metadata?.first_name as string | undefined)?.trim();
  const greetingName = firstName || user?.email?.split("@")[0] || "there";
  const credits = user ? await readCredits(user.id) : null;

  return (
    <div className={dashboardShell}>
      <p className={sectionLabel}>BoardEdge</p>
      <h1 className="display-section mt-2">Student dashboard</h1>
      <p className="mt-4 max-w-[var(--measure)] text-muted-foreground">
        Hello, {greetingName}. Choose a past-paper question, submit your answer, and see exactly
        where the marks were awarded and where they were withheld.
      </p>

      <Hairline className="my-8" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link href="/evaluate" className={btnPrimary}>
          Start new evaluation
        </Link>
        <Link href="/history" className={btnSecondary}>
          View results
        </Link>
        {credits ? (
          <p className="text-sm text-muted-foreground sm:ml-auto">
            <span className={`${numericFigures} font-semibold text-foreground`}>
              {credits.remaining}
            </span>{" "}
            of{" "}
            <span className={numericFigures}>{credits.limit}</span> credits left this week
          </p>
        ) : null}
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
            <Icon size={20} strokeWidth={1.5} className="text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
