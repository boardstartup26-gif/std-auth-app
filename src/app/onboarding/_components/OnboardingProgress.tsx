// A slim completion meter: "2 of 4 done" over a hairline bar. Used by the
// onboarding form and the dashboard's first-week checklist, so both read as
// the same kind of progress.
//
// Accent while in progress, awarded green once complete. Width animates on the
// editorial ease; motion-reduce turns that off.

export function OnboardingProgress({
  done,
  total,
  label = "done",
  className = "",
}: {
  done: number;
  total: number;
  label?: string;
  className?: string;
}) {
  const complete = done >= total;
  const pct = total ? Math.round((Math.min(done, total) / total) * 100) : 0;

  return (
    <div className={className}>
      <p className="flex items-baseline justify-between font-mono text-xs tabular-nums text-muted-foreground">
        <span>
          <span className={complete ? "font-semibold text-status-correct" : "font-semibold text-foreground"}>{done}</span> of{" "}
          {total} {label}
        </span>
        {complete ? <span className="text-status-correct">✓</span> : null}
      </p>
      <div
        className="mt-1.5 h-1 overflow-hidden rounded-full bg-rule"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={`${done} of ${total} ${label}`}
      >
        <div
          className={`h-full rounded-full transition-[width,background-color] duration-[320ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
            complete ? "bg-status-correct" : "bg-accent"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
