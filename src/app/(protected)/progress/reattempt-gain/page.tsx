// /progress/reattempt-gain — marks won back by rewriting written answers:
// headline figures, week-by-week history, and every reattempted question.

import { Layers, Target, TrendingUp } from "lucide-react";
import { computeReattemptGain } from "@/lib/progress";
import { fmtMarks } from "@/lib/practice-sets/results";
import { RisingChartSketch } from "@/app/(protected)/dashboard/_components/Illustrations";
import { ProgressFrame } from "../_components/ProgressFrame";
import { NothingMarkedYet, ProgressLoadFailed } from "../_components/ProgressStates";
import { StatCard } from "../_components/StatCard";
import { ReattemptCandidates, ReattemptTable, WeeklyRecovery } from "../_components/ReattemptGainList";
import { loadProgress } from "../_lib/load";

export const dynamic = "force-dynamic";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <ProgressFrame
      eyebrow="Reattempt gain"
      title="Your improvement, quantified."
      subtitle="See how your marks have improved when you reattempt questions."
      art={<RisingChartSketch className="w-full" />}
    >
      {children}
    </ProgressFrame>
  );
}

export default async function ReattemptGainPage() {
  const { read } = await loadProgress("/progress/reattempt-gain");
  if (!read.ok) {
    return (
      <Frame>
        <ProgressLoadFailed />
      </Frame>
    );
  }
  if (!read.attempts.length) {
    return (
      <Frame>
        <NothingMarkedYet what="rewrite any written answer that fell short and this page shows the marks you win back." />
      </Frame>
    );
  }

  const gain = computeReattemptGain(read.attempts);
  if (!gain.reattempted) {
    return (
      <Frame>
        <ReattemptCandidates attempts={read.attempts} />
      </Frame>
    );
  }

  const rate = Math.round((gain.improved / gain.reattempted) * 100);

  return (
    <Frame>
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={TrendingUp} value={`+${fmtMarks(gain.marksRecovered)}`} label="Total marks regained" />
        <StatCard
          icon={Layers}
          value={`${rate}%`}
          label="Improvement rate"
          note={`${gain.improved} of ${gain.reattempted} scored higher`}
        />
        <StatCard icon={Target} value={gain.reattempted} label="Questions reattempted" note="written questions" />
      </div>
      <div className="mt-8">
        <WeeklyRecovery gain={gain} now={new Date().getTime()} />
      </div>
      <ReattemptTable gain={gain} />
    </Frame>
  );
}
