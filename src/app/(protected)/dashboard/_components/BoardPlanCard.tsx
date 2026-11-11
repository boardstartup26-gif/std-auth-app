// The Weekly Board Plan on the dashboard. Server component: receives the plan
// with progress already derived (lib/board-plan viewPlan), so ticks come only
// from answers actually submitted since the plan began.
//
// The WhatsApp share is a wa.me link the student taps themselves, carrying
// only the task titles — BoardEdge holds no phone numbers and sends nothing
// to WhatsApp on anyone's behalf.

import Link from "next/link";
import { ArrowRight, CalendarCheck, Check } from "lucide-react";
import { buildFixList } from "@/app/(protected)/practice-paper/actions";
import { PendingSubmit } from "@/app/_components/states/PendingSubmit";
import { planAsText, taskCopy } from "@/lib/board-plan/tasks";
import type { PlanView } from "@/lib/board-plan/service";
import { numericFigures } from "@/lib/ui";
import { dashCard, dashHeading, iconChip } from "../_lib/styles";

const action =
  "inline-flex items-center gap-1 rounded-md border border-accent/30 px-2.5 py-1 text-[12.5px] font-medium text-accent transition-colors hover:bg-accent-subtle";

function weekLabel(weekStart: string): string {
  return new Date(`${weekStart}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function BoardPlanCard({ view }: { view: PlanView }) {
  const { plan, items, completed } = view;
  const allDone = completed === items.length;
  const pct = Math.round((completed / Math.max(1, items.length)) * 100);
  const share = `https://wa.me/?text=${encodeURIComponent(`My BoardEdge board plan this week:\n${planAsText(plan.tasks)}`)}`;

  return (
    <section id="board-plan" className={`${dashCard} scroll-mt-24 p-5 sm:p-6`} aria-labelledby="board-plan-title">
      <div className="flex items-start gap-3">
        <span className={iconChip}>
          <CalendarCheck size={18} strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="board-plan-title" className={dashHeading}>
            {allDone ? "Board plan done for this week" : "Weekly Board Plan"}
          </h2>
          <p className={`${numericFigures} mt-0.5 text-xs text-muted-foreground`}>
            Week of {weekLabel(plan.weekStart)} · <span className="font-semibold text-foreground">{completed}</span> of{" "}
            {items.length} done · new plan Monday
          </p>
        </div>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-rule" role="img" aria-label={`${completed} of ${items.length} tasks done`}>
        <div className={`h-full rounded-full ${allDone ? "bg-status-correct" : "bg-accent"}`} style={{ width: `${pct}%` }} />
      </div>

      <ol className="mt-4 divide-y divide-border">
        {items.map(({ task, progress }, i) => {
          const copy = taskCopy(task, progress);
          return (
            <li
              key={i}
              className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1.75rem_minmax(0,1fr)_auto] sm:items-center"
            >
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
                <p className={`text-[13.5px] font-medium ${progress.complete ? "text-muted-foreground" : "text-foreground"}`}>
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
                  <span className="text-[12.5px] font-medium text-status-correct">Done</span>
                ) : copy.fixListSubject ? (
                  <form action={buildFixList}>
                    <input type="hidden" name="subject" value={copy.fixListSubject} />
                    <input type="hidden" name="src" value="board_plan" />
                    <PendingSubmit pendingLabel="Building…" className={action}>
                      Build Fix List <ArrowRight size={13} aria-hidden />
                    </PendingSubmit>
                  </form>
                ) : copy.href ? (
                  <Link href={copy.href} className={action}>
                    Start <ArrowRight size={13} aria-hidden />
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
        Picked from the marks you&rsquo;ve been losing; tasks tick off as you submit answers.{" "}
        <a href={share} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-4 hover:text-accent">
          Share on WhatsApp
        </a>
      </p>
    </section>
  );
}
