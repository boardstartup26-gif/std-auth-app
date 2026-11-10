// The Weekly Board Plan on the dashboard. Server component: receives the plan
// with progress already derived (lib/board-plan viewPlan), so ticks come only
// from answers actually submitted since the plan began.
//
// The WhatsApp share is a wa.me link the student taps themselves, carrying
// only the task titles — BoardEdge holds no phone numbers and sends nothing
// to WhatsApp on anyone's behalf.

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { buildFixList } from "@/app/(protected)/practice-paper/actions";
import { PendingSubmit } from "@/app/_components/states/PendingSubmit";
import { planAsText, taskCopy } from "@/lib/board-plan/tasks";
import type { PlanView } from "@/lib/board-plan/service";
import { numericFigures } from "@/lib/ui";

const action = "inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-hover";

function weekLabel(weekStart: string): string {
  return new Date(`${weekStart}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function BoardPlanCard({ view, rowLabel }: { view: PlanView; rowLabel: string }) {
  const { plan, items, completed } = view;
  const allDone = completed === items.length;
  const share = `https://wa.me/?text=${encodeURIComponent(`My BoardEdge board plan this week:\n${planAsText(plan.tasks)}`)}`;

  return (
    <section id="board-plan" className="mt-8 scroll-mt-20 border-t border-border pt-6" aria-labelledby="board-plan-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div>
          <p className={rowLabel}>Week of {weekLabel(plan.weekStart)}</p>
          <h2 id="board-plan-title" className="mt-1 font-display text-2xl text-foreground">
            {allDone ? "Board plan done for this week" : "This week’s board plan"}
          </h2>
        </div>
        <p className={`${numericFigures} text-sm text-muted-foreground`}>
          <span className="font-semibold text-foreground">{completed}</span> of {items.length} done · new plan Monday
        </p>
      </div>

      <ol className="mt-4 border-b border-border">
        {items.map(({ task, progress }, i) => {
          const copy = taskCopy(task, progress);
          return (
            <li key={i} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 border-t border-border py-4 sm:grid-cols-[1.75rem_minmax(0,1fr)_auto] sm:items-center">
              <span
                aria-hidden
                className={`mt-0.5 grid h-6 w-6 place-items-center rounded-full border text-xs ${numericFigures} ${
                  progress.complete
                    ? "border-status-correct bg-status-correct-subtle text-status-correct"
                    : "border-border text-muted-foreground"
                }`}
              >
                {progress.complete ? <Check size={14} strokeWidth={2.5} /> : i + 1}
              </span>
              <div className="min-w-0">
                <p className={`text-sm font-medium ${progress.complete ? "text-muted-foreground" : "text-foreground"}`}>
                  {copy.title}
                  <span className="sr-only">{progress.complete ? " (done)" : ""}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {copy.detail}
                  {progress.target > 1 ? (
                    <span className={`${numericFigures} ml-1 font-semibold text-foreground`}>
                      {progress.done}/{progress.target}
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="col-start-2 mt-2 sm:col-start-3 sm:mt-0">
                {progress.complete ? (
                  <span className="text-sm text-status-correct">Done</span>
                ) : copy.fixListSubject ? (
                  <form action={buildFixList}>
                    <input type="hidden" name="subject" value={copy.fixListSubject} />
                    <input type="hidden" name="src" value="board_plan" />
                    <PendingSubmit pendingLabel="Building…" className={action}>
                      Build Fix List <ArrowRight size={14} aria-hidden />
                    </PendingSubmit>
                  </form>
                ) : copy.href ? (
                  <Link href={copy.href} className={action}>
                    Start <ArrowRight size={14} aria-hidden />
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-xs text-muted-foreground">
        Picked from the marks you&rsquo;ve been losing; tasks tick off as you submit answers.{" "}
        <a href={share} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-4 hover:text-accent">
          Share on WhatsApp
        </a>
      </p>
    </section>
  );
}
