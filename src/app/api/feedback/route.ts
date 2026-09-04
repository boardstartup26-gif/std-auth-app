import { after, NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { EVENTS } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";

// Structured feedback metadata. Optional and additive: the rating and tags are
// recorded as telemetry rather than columns on usage_feedback, so the existing
// table and every existing caller keep working unchanged, and the dashboard
// reads ratings from the same place it reads everything else.
const RATINGS = ["up", "down"] as const;
type Rating = (typeof RATINGS)[number];

// A closed vocabulary, not free text. Tags are meant to be counted, and
// counting only works if the set is fixed.
const ISSUE_TAGS = [
  "wrong_marks",
  "wrong_model_answer",
  "missed_my_point",
  "too_harsh",
  "too_lenient",
  "figure_problem",
  "confusing_feedback",
  "other",
] as const;
const ISSUE_TAG_SET: ReadonlySet<string> = new Set(ISSUE_TAGS);
const MAX_TAGS = 5;

export async function POST(req: NextRequest) {
  let body: { message?: string; rating?: unknown; tags?: unknown; source?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length < 3) {
    return NextResponse.json({ error: "Feedback message is required" }, { status: 400 });
  }

  // Bound the write. This endpoint is authenticated but otherwise unmetered —
  // it doesn't cost tokens — so without a ceiling it's an open funnel for
  // arbitrarily large rows.
  const MAX_FEEDBACK_CHARS = 4_000;
  if (message.length > MAX_FEEDBACK_CHARS) {
    return NextResponse.json(
      { error: "Feedback is too long", detail: `Limited to ${MAX_FEEDBACK_CHARS} characters.` },
      { status: 400 }
    );
  }

  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "You must be signed in" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("usage_feedback").insert({
    user_id: user.id,
    message,
  });

  if (error) {
    console.error("[BoardEdge] Feedback insert failed:", error);
    return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
  }

  // Anything unrecognised is dropped rather than stored: an open tag list
  // would let one client mint categories the dashboard then has to render.
  const rating: Rating | null =
    typeof body.rating === "string" && (RATINGS as readonly string[]).includes(body.rating)
      ? (body.rating as Rating)
      : null;

  const tags = Array.isArray(body.tags)
    ? [...new Set(body.tags.filter((t): t is string => typeof t === "string" && ISSUE_TAG_SET.has(t)))].slice(0, MAX_TAGS)
    : [];

  const source = typeof body.source === "string" ? body.source.slice(0, 64) : null;

  after(() =>
    recordServerEvent({
      eventName: EVENTS.FEEDBACK_SUBMITTED,
      userId: user.id,
      // The message body itself is deliberately not copied here — it already
      // lives in usage_feedback, and telemetry should hold shape, not prose.
      properties: { rating, tags, source, message_length: message.length },
      path: "/api/feedback",
    }),
  );

  return NextResponse.json({ success: true }, { status: 200 });
}