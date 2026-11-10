// src/app/api/cron/weekly/route.ts
//
// Weekly run, scheduled in vercel.json for Monday 02:30 UTC = 8 am IST, at
// the start of the IST week the plans cover. Creates each active student's
// Weekly Board Plan, puts it in their inbox and emails it once
// (src/lib/board-plan/run.ts), then sends opted-in Parent Reports
// (src/lib/parent-report/run.ts, off unless PARENT_REPORTS_ENABLED=true).
//
// Refuses every request unless CRON_SECRET is set and sent as a Bearer token
// (src/lib/cron-auth.ts). `?dry=1` runs the selection, including the consent
// gate, and reports what it would do without writing or emailing anything.

import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorised } from "@/lib/cron-auth";
import { runBoardPlans } from "@/lib/board-plan/run";
import { runParentReports } from "@/lib/parent-report/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!cronAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dry") === "1";
  try {
    // One 60s function, two steps: plans get the first ~35s, reports run to
    // ~55s. Each stops at its deadline and reports `incomplete`; both are
    // idempotent, so nothing is sent twice if the run is repeated.
    const started = Date.now();
    const boardPlans = await runBoardPlans({ dryRun, deadline: started + 35_000 });
    const parentReports = await runParentReports({ dryRun, deadline: started + 55_000 });
    console.info("[BoardEdge] weekly run:", JSON.stringify({ boardPlans, parentReports }));
    return NextResponse.json({ boardPlans, parentReports });
  } catch (err) {
    console.error("[BoardEdge] weekly run failed:", err);
    return NextResponse.json({ error: "Run failed" }, { status: 500 });
  }
}
