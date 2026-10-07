"use client";

// Shown while a submitted paper is being marked. It drives the marker (POST
// /api/practice-paper/[id]/mark, repeated until the paper is done; each call
// is a short run) and polls GET on the same route for the live count, since a
// single run marks several answers before it returns.
//
// Leaving is safe: the marker is resumable, and opening the paper again lands
// back here and carries on.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { btnPrimary, btnSecondary, errorAlert, numericFigures } from "@/lib/ui";

interface Progress {
  status: "in_progress" | "marking" | "marked";
  done: number;
  total: number;
}

const LINES = [
  "Reading each answer against its marking scheme",
  "Checking the points each answer earns",
  "Totalling the marks, section by section",
  "Writing up where marks were lost",
];

export function MarkingScreen({
  setId,
  subject,
  total,
  onDone,
}: {
  setId: string;
  subject: string;
  total: number;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [line, setLine] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const finished = useRef(false);
  // Held in a ref so a parent re-render (a new inline callback) doesn't
  // restart the marking loop.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let alive = true;
    finished.current = false;
    const finish = () => {
      if (finished.current) return;
      finished.current = true;
      setDone(total);
      // A beat on the full bar before the results replace it.
      setTimeout(() => (onDoneRef.current ? onDoneRef.current() : router.refresh()), 600);
    };

    const apply = (p: Progress) => {
      if (!alive) return;
      setDone((d) => Math.max(d, p.done));
      if (p.status === "marked") finish();
    };

    const run = async () => {
      let failures = 0;
      while (alive && !finished.current) {
        try {
          const res = await fetch(`/api/practice-paper/${setId}/mark`, { method: "POST" });
          const body = await res.json().catch(() => ({}));
          if (res.status === 403 || res.status === 404 || res.status === 401) {
            if (alive) setError(body.error ?? "This paper can’t be marked right now.");
            return;
          }
          if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
          failures = 0;
          apply(body as Progress);
        } catch {
          failures += 1;
          if (failures >= 3) {
            if (alive) setError("Marking has paused. Check your connection, then try again. Nothing is lost.");
            return;
          }
          await new Promise((r) => setTimeout(r, 2000 * failures));
        }
      }
    };

    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/practice-paper/${setId}/mark`, { cache: "no-store" });
        if (res.ok) apply((await res.json()) as Progress);
      } catch {}
    }, 2000);
    const rotate = setInterval(() => setLine((l) => (l + 1) % LINES.length), 3500);

    void run();
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(rotate);
    };
  }, [setId, total, attempt, router]);

  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center sm:px-12">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Practice paper · {subject}</p>
      <h1 className="mt-4 font-display text-3xl text-foreground">
        {error ? "Marking paused" : done >= total ? "Your paper is marked" : "Marking your paper"}
      </h1>

      {error ? (
        <>
          <p className={`${errorAlert} mx-auto mt-6 max-w-md text-left`} role="alert">
            {error}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setAttempt((a) => a + 1);
              }}
              className={btnPrimary}
            >
              Try Again
            </button>
            <Link href="/practice-paper" className={btnSecondary}>
              Practice papers
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="mx-auto mt-3 h-5 max-w-md text-sm text-muted-foreground motion-safe:transition-opacity" aria-live="polite">
            {done >= total ? "Preparing your results" : LINES[line]}
          </p>

          <div className="mx-auto mt-10 max-w-sm">
            <div
              className="h-2 overflow-hidden rounded-full bg-rule"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done}
              aria-label="Answers marked"
            >
              <div
                className="h-full rounded-full bg-accent motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-out"
                style={{ width: `${Math.max(4, pct)}%` }}
              />
            </div>
            <p className={`${numericFigures} mt-3 text-sm text-muted-foreground`}>
              <span className="font-semibold text-foreground">{done}</span> of {total} answers marked
            </p>
          </div>

          <p className="mx-auto mt-10 max-w-sm text-xs leading-relaxed text-muted-foreground">
            This usually takes under a minute. If you leave, marking picks up where it stopped when you open
            the paper again.
          </p>
        </>
      )}
    </div>
  );
}
