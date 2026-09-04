// src/lib/analytics/server.ts
//
// Server-side event recording, for the moments a browser can't be trusted to
// report honestly or at all: a completed evaluation, an Anthropic timeout, a
// signup that finished. These are written from route handlers and server
// actions where the outcome is actually known.
//
// Writes go through the service-role client. That bypasses RLS, which is
// correct here and only here: the row is authored by our own server, the
// user_id is taken from the verified session rather than from the request
// body, and the table has no read path for anyone but an admin.

import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import type { AnalyticsEventName, EventProperties } from "./events";

/**
 * Cookie mirror of the browser's localStorage anon id, written by
 * AnalyticsProvider. It exists so a server-recorded event (signup, evaluation)
 * can be joined back to the anonymous visitor who started the journey — the
 * server has no other way to see a localStorage value.
 *
 * Not HttpOnly and not a security token: it identifies a browser for funnel
 * maths, never grants anything.
 */
export const ANON_COOKIE = "be_anon_id";

interface RecordEventInput {
  eventName: AnalyticsEventName;
  /** Taken from a verified session — never from a request body. */
  userId?: string | null;
  properties?: EventProperties;
  path?: string | null;
}

/**
 * Insert one telemetry row. Never throws and never returns a failure: a
 * dropped analytics event must not turn a successful evaluation into an error
 * for the student.
 *
 * Call it inside `after()` at request-handling call sites so it does not sit
 * in front of the response.
 */
export async function recordServerEvent({
  eventName,
  userId = null,
  properties = {},
  path = null,
}: RecordEventInput): Promise<void> {
  try {
    let anonId: string | null = null;
    try {
      anonId = (await cookies()).get(ANON_COOKIE)?.value?.slice(0, 64) ?? null;
    } catch (err) {
      // Never swallow Next's internal control-flow errors (see admin.ts).
      unstable_rethrow(err);
      // Not every caller runs inside a request scope; anon attribution is
      // optional, so carry on without it.
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from("analytics_events").insert({
      event_name: eventName,
      user_id: userId,
      anon_id: anonId,
      path,
      properties,
    });

    if (error) {
      console.warn("[BoardEdge] analytics insert failed:", error.message);
    }
  } catch (err) {
    console.warn("[BoardEdge] analytics insert threw:", err);
  }
}
