// app/api/waitlist/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// ─── Rate limiting ──────────────────────────────────────────────────────────
// In-memory counter: fine for a single Vercel instance during beta (2-3
// testers). This resets if the server restarts/redeploys and does NOT work
// correctly if you're running multiple serverless instances at once, because
// each instance has its own memory. If traffic grows, replace this with
// Upstash Redis (a hosted counter that all instances share) — flagging now
// so it's not forgotten post-launch.
const requestLog = new Map<string, number[]>();
const RATE_LIMIT = 5; // max requests
const WINDOW_MS = 60 * 1000; // per 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = requestLog.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < WINDOW_MS);

  if (recent.length >= RATE_LIMIT) {
    requestLog.set(ip, recent);
    return true;
  }

  recent.push(now);
  requestLog.set(ip, recent);
  return false;
}

// Basic RFC-5322-ish check — not perfect, but rejects "a@a", "x@x", trailing
// junk, and missing TLDs, which the old `.includes("@")` check let through.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface WaitlistRequestBody {
  email: string;
  feature?: string;
}

// ─── POST /api/waitlist ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Vercel sets this header; falls back to "unknown" for local dev.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a minute." },
      { status: 429 }
    );
  }

  let body: WaitlistRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const feature = body.feature ?? "premium_bundle";

  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("waitlist")
    .upsert(
      {
        email,
        feature,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "email" }
    );

  if (error) {
    console.error("[BoardEdge] waitlist insert failed:", error);
    return NextResponse.json({ error: "Failed to join waitlist" }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}