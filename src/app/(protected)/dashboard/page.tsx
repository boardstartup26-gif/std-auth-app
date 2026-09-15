import { Gauge, BarChart2, PieChart } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { readCredits } from "@/lib/credits";
import { Hairline } from "@/app/_components/Hairline";
import { MagneticCard } from "@/app/_components/MagneticCard";
import { numericFigures, sectionLabel } from "@/lib/ui";

export const dynamic = "force-dynamic";

// No margin rail here. It held the date, the credit balance and the join month
// — the balance now lives in the top bar on every page, and the other two did
// not earn a column down the side.
const dashboardShell = "mx-auto min-h-screen max-w-5xl px-6 py-12";

/**
 * Greeting by IST clock, not the server's. Vercel runs these functions in
 * whatever region is nearest, so a UTC hour would wish a student in Kolkata
 * good morning at half past five in the evening. The page is force-dynamic and
 * server-only, so there is no client clock to disagree with this.
 */
function greetingFor(date: Date): string {
  const hour = Number(
    date.toLocaleString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false })
  );
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

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
      <h1 className="display-section mt-2">
        {greetingFor(new Date())}, {greetingName}
      </h1>
      <p className="mt-4 max-w-[var(--measure)] text-muted-foreground">
        Choose a past-paper question, submit your answer, and see exactly where the marks were
        awarded and where they were withheld.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <MagneticCard
          href="/evaluate"
          title="Question practice"
          description="Exam-style past-paper questions for every subject, chapter and year — marked point by point against the real scheme."
          icon="practice"
          accentClass="text-accent"
          washClass="text-accent/[0.07]"
        />
        <MagneticCard
          href="/history"
          title="Previous evaluations"
          description="Every answer you have submitted, grouped by question, with the marks you gained and the points you dropped."
          icon="history"
          accentClass="text-awarded"
          washClass="text-awarded/[0.07]"
        />
      </div>

      {credits ? (
        <p className="mt-4 text-sm text-muted-foreground">
          <span className={`${numericFigures} font-semibold text-foreground`}>
            {credits.remaining}
          </span>{" "}
          of <span className={numericFigures}>{credits.limit}</span> credits left this week
        </p>
      ) : null}

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
