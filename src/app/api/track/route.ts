// src/app/api/track/route.ts
//
// Telemetry ingest. Reached by navigator.sendBeacon (and a keepalive fetch
// fallback) from src/lib/analytics/track.ts.
//
// This is an unauthenticated write endpoint, which makes it the softest
// surface in the whole pipeline. Four things keep it bounded:
//
//   1. The body is size-capped before it is parsed.
//   2. event_name must be on the allowlist in src/lib/analytics/events.ts.
//   3. user_id is NEVER read from the body — it comes from the verified JWT,
//      so a caller cannot attribute activity to somebody else.
//   4. A best-effort in-process rate limit blunts a naive flood.
//
// It answers 204 to everything it accepts or silently drops, so probing it
// tells an attacker nothing about what is or isn't a real event.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { ALLOWED_EVENT_NAMES } from "@/lib/analytics/events";

// A beacon payload is a few hundred bytes. Anything past this is abuse or a
// bug, and either way is not worth parsing.
const MAX_BODY_BYTES = 8_000;
const MAX_PROPERTIES_CHARS = 2_000;

const TrackSchema = z.object({
  event_name: z.string().min(1).max(64),
  anon_id: z.string().max(64).nullish(),
  session_id: z.string().max(64).nullish(),
  path: z.string().max(512).nullish(),
  referrer: z.string().max(1024).nullish(),
  utm_source: z.string().max(128).nullish(),
  utm_medium: z.string().max(128).nullish(),
  utm_campaign: z.string().max(128).nullish(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

// ─── Rate limiting ───────────────────────────────────────────────────────────
//
// Deliberately in-process and deliberately modest. On serverless each instance
// keeps its own counters, so this is a speed bump rather than a wall — it stops
// a runaway client loop and a casual flood, not a distributed one. The real
// backstop is that these rows are unreadable to everyone but an admin, so
// polluting them buys an attacker nothing but noise.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_EVENTS = 120;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    // Opportunistic sweep so the map can't grow without bound in a
    // long-lived instance.
    if (hits.size > 5_000) {
      for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
    }
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_MAX_EVENTS;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 204 is the answer to almost everything below. Named once so it's obvious
  // that a rejected event and an accepted one are indistinguishable from the
  // outside.
  const ok = () => new NextResponse(null, { status: 204 });

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return ok();
  }
  if (!raw || raw.length > MAX_BODY_BYTES) return ok();

  let parsed: z.infer<typeof TrackSchema>;
  try {
    const validated = TrackSchema.safeParse(JSON.parse(raw));
    if (!validated.success) return ok();
    parsed = validated.data;
  } catch {
    return ok();
  }

  if (!ALLOWED_EVENT_NAMES.has(parsed.event_name)) return ok();

  // The IP is used for rate limiting only and is never stored — telemetry
  // rows carry no network identifier.
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (rateLimited(parsed.anon_id || forwarded || "unknown")) return ok();

  // Identity comes from the signed JWT, not the payload. getClaims verifies the
  // signature (locally, where the project uses asymmetric keys) rather than
  // trusting the cookie's contents.
  let userId: string | null = null;
  try {
    const supabaseAuth = await createClient();
    const { data } = await supabaseAuth.auth.getClaims();
    const sub = data?.claims?.sub;
    userId = typeof sub === "string" && sub.length > 0 ? sub : null;
  } catch {
    // Anonymous is a perfectly valid state at the top of the funnel.
  }

  // Oversized property bags are replaced rather than truncated — a half-cut
  // JSON object read as real data later is worse than an explicit marker.
  let properties: Record<string, unknown> = parsed.properties ?? {};
  if (JSON.stringify(properties).length > MAX_PROPERTIES_CHARS) {
    properties = { _dropped: "oversize" };
  }

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("analytics_events").insert({
      event_name: parsed.event_name,
      user_id: userId,
      anon_id: parsed.anon_id ?? null,
      session_id: parsed.session_id ?? null,
      path: parsed.path ?? null,
      referrer: parsed.referrer ?? null,
      utm_source: parsed.utm_source ?? null,
      utm_medium: parsed.utm_medium ?? null,
      utm_campaign: parsed.utm_campaign ?? null,
      properties,
    });
    if (error) {
      console.warn("[BoardEdge] track insert failed:", error.message);
    }
  } catch (err) {
    console.warn("[BoardEdge] track insert threw:", err);
  }

  return ok();
}
