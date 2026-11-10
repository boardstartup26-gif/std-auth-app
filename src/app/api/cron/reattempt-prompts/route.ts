// src/app/api/cron/reattempt-prompts/route.ts
//
// Daily run of the Spaced Reattempt Prompts (src/lib/notifications/reattempt.ts),
// scheduled in vercel.json for 13:30 UTC = 7 pm IST, after school and before
// the evening's study.
//
// Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET` once that
// environment variable is set on the project. Without the secret the route
// refuses everything: it writes to every student's inbox and sends email, so
// "unconfigured" must mean "does nothing", never "open to anyone".
//
// `?dry=1` runs the whole selection, including the consent gate, and reports
// what it would send without writing or emailing anything.

import { NextResponse, type NextRequest } from "next/server";
import { runReattemptPrompts } from "@/lib/notifications/reattempt";
import { cronAuthorised } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!cronAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dry") === "1";
  try {
    const summary = await runReattemptPrompts({ dryRun });
    console.info("[BoardEdge] reattempt prompts run:", JSON.stringify(summary));
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[BoardEdge] reattempt prompts run failed:", err);
    return NextResponse.json({ error: "Run failed" }, { status: 500 });
  }
}
