// src/app/api/email/unsubscribe/route.ts
//
// RFC 8058 one-click unsubscribe. Gmail and other clients POST here straight
// from their own "Unsubscribe" button, using the List-Unsubscribe header on
// every reminder email. POST only: link scanners and prefetchers issue GETs,
// and a GET that unsubscribed would switch reminders off for students who
// never asked. People clicking the link in the email body land on /unsubscribe
// instead, which asks first.

import { after, NextResponse, type NextRequest } from "next/server";
import { setEmailReminders, verifyUnsubscribeToken } from "@/lib/email/reminder-preferences";
import { EVENTS } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";

export async function POST(request: NextRequest) {
  const userId = verifyUnsubscribeToken(request.nextUrl.searchParams.get("t"));
  if (!userId) return NextResponse.json({ error: "Invalid link" }, { status: 400 });

  const ok = await setEmailReminders(userId, false);
  if (!ok) return NextResponse.json({ error: "Could not update preference" }, { status: 500 });

  after(() =>
    recordServerEvent({
      eventName: EVENTS.EMAIL_REMINDERS_CHANGED,
      userId,
      properties: { enabled: false, via: "one_click" },
      path: "/api/email/unsubscribe",
    }),
  );
  return new NextResponse(null, { status: 200 });
}
