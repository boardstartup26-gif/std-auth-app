// The two states every progress view can land in before it has anything to
// show: the read failed (say so, offer a retry — never present it as "no
// data"), or nothing has been marked yet (say what will appear, and how).

import { TrendingUp } from "lucide-react";
import { EmptyState } from "@/app/_components/states/EmptyState";
import { ReloadableError } from "@/app/_components/states/ErrorState";

export function ProgressLoadFailed() {
  return (
    <ReloadableError
      title="We couldn’t load your progress"
      message="Your answers are safe — we just couldn’t fetch them this time. Try again in a moment."
      secondary={{ label: "Back to dashboard", href: "/dashboard" }}
    />
  );
}

export function NothingMarkedYet({ what }: { what: string }) {
  return (
    <EmptyState
      icon={TrendingUp}
      title="Nothing to show yet"
      description={`Once a few of your answers are marked, ${what}`}
      primary={{ label: "Practice a question", href: "/evaluate" }}
      secondary={{ label: "Build a practice paper", href: "/practice-paper" }}
    />
  );
}
