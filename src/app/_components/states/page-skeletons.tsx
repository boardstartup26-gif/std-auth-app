// One skeleton per protected page, each composed in that page's own shell
// classes (same max-width, gutters, vertical rhythm) and its own section
// order, so the swap to real content moves nothing. They sit under the
// persistent sidebar/top bar — the layout never unmounts — so they cover only
// the content column, never the whole screen.
//
// If a page's layout changes, change its skeleton here in the same commit.

import { Skeleton, SkeletonText, LoadingRegion } from "./Skeleton";

/** Section label + display title + intro, the header every study page opens with. */
function PageHeader({ intro = true }: { intro?: boolean }) {
  return (
    <div aria-hidden>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-10 w-80 max-w-full sm:h-12" />
      {intro ? <SkeletonText lines={2} className="mt-5 max-w-[var(--measure)]" /> : null}
    </div>
  );
}

/** A hairline-ruled list row: title + meta on the left, a figure on the right. */
function RowSkeleton() {
  return (
    <div aria-hidden className="flex items-center justify-between gap-6 border-t border-border py-4">
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
    </div>
  );
}

// ─── /dashboard ──────────────────────────────────────────────────────────────

export function DashboardSkeleton() {
  return (
    <LoadingRegion label="Loading your dashboard" className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <div aria-hidden>
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-3 h-9 w-72 max-w-full" />
      </div>

      {/* Primary: the paper to continue, or the invitation to build one. */}
      <div aria-hidden className="mt-10 rounded-lg border border-border bg-card px-6 py-7 sm:px-8">
        <Skeleton className="h-3 w-44" />
        <Skeleton className="mt-4 h-8 w-56" />
        <Skeleton className="mt-3 h-3.5 w-72 max-w-full" />
        <Skeleton className="mt-8 h-10 w-52 rounded-xl" />
      </div>

      <div aria-hidden className="mt-8 border-t border-border">
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid items-center gap-x-8 gap-y-3 border-b border-border py-5 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>

      <div aria-hidden className="mt-14">
        <div className="border-b border-foreground/80 pb-3">
          <Skeleton className="h-6 w-40" />
        </div>
        {[0, 1, 2].map((i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    </LoadingRegion>
  );
}

// ─── /evaluate ───────────────────────────────────────────────────────────────

export function EvaluateSkeleton() {
  return (
    <LoadingRegion
      label="Loading questions"
      className="mx-auto min-h-screen max-w-7xl px-6 py-12"
    >
      <div aria-hidden className="mb-8">
        <PageHeader />
      </div>
      <div aria-hidden className="flex flex-col gap-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-48" />
        <div className="mt-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[52px] rounded-xl" />
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}

/** The chapter/topic tiles inside the question picker, while a subject's questions load. */
export function ChoiceGridSkeleton({ label }: { label: string }) {
  return (
    <LoadingRegion label={label}>
      <div aria-hidden className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[52px] rounded-xl" />
        ))}
      </div>
    </LoadingRegion>
  );
}

// ─── /history ────────────────────────────────────────────────────────────────

export function HistorySkeleton() {
  return (
    <LoadingRegion label="Loading your results" className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <PageHeader />
      <div aria-hidden className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border py-5 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2.5 h-6 w-20" />
            <Skeleton className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-8 space-y-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>
      <div aria-hidden className="mt-6">
        {[0, 1, 2, 3, 4].map((i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    </LoadingRegion>
  );
}

// ─── /progress ───────────────────────────────────────────────────────────────

export function ProgressSkeleton() {
  return (
    <LoadingRegion label="Loading your progress" className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <PageHeader />
      <div aria-hidden className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border py-5 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2.5 h-6 w-20" />
            <Skeleton className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-12 h-7 w-40" />
      <div aria-hidden className="mt-6 grid gap-8 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-5 rounded-2xl border border-border bg-card p-6">
            <Skeleton className="h-6 w-24" />
            {[0, 1, 2, 3].map((j) => (
              <div key={j} className="space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
      <Skeleton className="mt-12 h-7 w-44" />
      <div aria-hidden className="mt-6">
        {[0, 1, 2].map((i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    </LoadingRegion>
  );
}

// ─── /history/[id] ───────────────────────────────────────────────────────────

export function ResultDetailSkeleton() {
  return (
    <LoadingRegion label="Loading your result" className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <div aria-hidden className="flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div aria-hidden className="mt-8">
        <Skeleton className="h-3 w-44" />
        <Skeleton className="mt-3 h-10 w-48 sm:h-12" />
        <div className="mt-5 flex items-center gap-4">
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-4 w-10" />
        </div>
      </div>
      <div aria-hidden className="mt-8 border-l-2 border-rule pl-5">
        <Skeleton className="h-3 w-16" />
        <SkeletonText lines={3} className="mt-3 max-w-[var(--measure)]" />
      </div>
      <div aria-hidden className="mt-10 grid gap-6 md:grid-cols-2">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    </LoadingRegion>
  );
}

// ─── /practice-paper ─────────────────────────────────────────────────────────

export function PracticePaperSkeleton() {
  return (
    <LoadingRegion label="Loading practice papers" className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <PageHeader />
      <div aria-hidden className="mt-10">
        <Skeleton className="h-3 w-36" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[196px] rounded-2xl" />
          ))}
        </div>
      </div>
      <div aria-hidden className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-6">
          <Skeleton className="h-6 w-40" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-40 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </LoadingRegion>
  );
}

// ─── /practice-paper/[id] ────────────────────────────────────────────────────
// The paper's stage (cover, attempt, marking, results) isn't known until it's
// read, so this is the one thing all of them share: a title card.

export function PaperSkeleton() {
  return (
    <LoadingRegion label="Opening your paper" className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <Skeleton className="h-4 w-32" />
      <div aria-hidden className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-rule px-6 py-8 sm:px-10">
          <Skeleton className="mx-auto h-3 w-48" />
          <Skeleton className="mx-auto mt-4 h-10 w-64 max-w-full" />
          <Skeleton className="mx-auto mt-5 h-3.5 w-72 max-w-full" />
        </div>
        <div className="space-y-4 px-6 py-7 sm:px-10">
          <SkeletonText lines={4} />
          <Skeleton className="h-11 w-40 rounded-xl" />
        </div>
      </div>
    </LoadingRegion>
  );
}

// ─── /notifications ──────────────────────────────────────────────────────────

export function NotificationsSkeleton() {
  return (
    <LoadingRegion label="Loading notifications" className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <PageHeader />
      <ul aria-hidden className="mt-10 border-b border-rule">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="grid grid-cols-[1rem_1fr_auto] items-start gap-3 border-t border-rule py-5 sm:px-2">
            <span />
            <div className="space-y-2.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3.5 w-full" />
            </div>
            <Skeleton className="h-3 w-12" />
          </li>
        ))}
      </ul>
    </LoadingRegion>
  );
}

// ─── /invite ─────────────────────────────────────────────────────────────────

export function InviteSkeleton() {
  return (
    <LoadingRegion label="Loading invites" className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <div aria-hidden>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-9 w-full max-w-md" />
        <Skeleton className="mt-2 h-9 w-2/3" />
        <SkeletonText lines={2} className="mt-5 max-w-[var(--measure)]" />
      </div>
      <div aria-hidden className="mt-8 space-y-4">
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="flex gap-2">
          <Skeleton className="h-11 w-44 rounded-lg" />
          <Skeleton className="h-11 w-36 rounded-lg" />
        </div>
      </div>
      <div aria-hidden className="mt-12">
        {[0, 1, 2].map((i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    </LoadingRegion>
  );
}

// ─── /account ────────────────────────────────────────────────────────────────

export function AccountSkeleton() {
  return (
    <LoadingRegion label="Loading your account" className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <div aria-hidden className="flex items-center justify-between">
        <div>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-9 w-36" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>
      <div aria-hidden className="mt-12 grid gap-8 md:grid-cols-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-8">
            <Skeleton className="h-3 w-28" />
            <SkeletonText lines={3} className="mt-5" />
            <Skeleton className="mt-6 h-10 w-44 rounded-xl" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

// ─── Fallback for any protected page without its own ─────────────────────────

export function GenericPageSkeleton() {
  return (
    <LoadingRegion label="Loading" className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <PageHeader />
      <div aria-hidden className="mt-10">
        {[0, 1, 2, 3].map((i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    </LoadingRegion>
  );
}
