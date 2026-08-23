import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  let body: { message?: string };
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

  return NextResponse.json({ success: true }, { status: 200 });
}