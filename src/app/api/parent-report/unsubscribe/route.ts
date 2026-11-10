// src/app/api/parent-report/unsubscribe/route.ts
//
// RFC 8058 one-click stop for weekly parent summaries, the target of the
// List-Unsubscribe header on every report. POST only: link scanners issue
// GETs, and a GET that stopped reports would switch them off for parents who
// never asked. A person clicking the link in the email lands on
// /parent-reports instead, which asks first.

import { after, NextResponse, type NextRequest } from "next/server";
import { resolveReportLink, setParentReports } from "@/lib/parent-report/service";
import { EVENTS } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";

export async function POST(request: NextRequest) {
  const link = await resolveReportLink("off", request.nextUrl.searchParams.get("t"));
  if (!link) return NextResponse.json({ error: "Invalid link" }, { status: 400 });

  // Already off counts as success: the parent's intent is satisfied.
  if (link.state === "on") {
    const ok = await setParentReports(link.userId, link.parentEmail, false);
    if (!ok) return NextResponse.json({ error: "Could not update preference" }, { status: 500 });
    const userId = link.userId;
    after(() =>
      recordServerEvent({
        eventName: EVENTS.PARENT_REPORTS_CHANGED,
        userId,
        properties: { enabled: false, via: "one_click" },
        path: "/api/parent-report/unsubscribe",
      }),
    );
  }
  return new NextResponse(null, { status: 200 });
}
