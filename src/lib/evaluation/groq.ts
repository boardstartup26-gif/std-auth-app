// src/lib/evaluation/groq.ts
//
// TEMPORARY free-tier grading through Groq, used only while
// GRADING_PROVIDER=groq. Unset the variable to go back to Claude.
//
// Before switching it on in production: students' answers go to Groq (stored in
// the US when retained), so the privacy policy, terms and parent-confirm page,
// which name Anthropic, must say so.
//
// Free-tier limits are per organisation and small (about one written answer a
// minute). Photo answers and practice-paper marking of written answers are
// paused while this is on, because one of either can exceed the per-minute cap.
//
// Server-only.

import type Anthropic from "@anthropic-ai/sdk";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";

// Groq counts the prompt plus this ceiling against the per-minute token limit
// (8,000 on the published table), and the examiner prompt alone is about half.
const MAX_COMPLETION_TOKENS = 3000;
const CLASSIFIER_COMPLETION_TOKENS = 1000;

export function usingFreeProvider(): boolean {
  return process.env.GRADING_PROVIDER === "groq";
}

// ─── Output schema ───────────────────────────────────────────────────────────
// Mirrors ClaudeEvalSchema in grading.ts, in the form Groq's strict mode takes:
// every field required, no extra properties. Zod still validates the reply.

const text = { type: "string" };
const list = { type: "array", items: text };

function strictObject(properties: Record<string, unknown>) {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

const EVALUATION_SCHEMA = strictObject({
  marks_awarded: { type: "number" },
  total_marks: { type: "number" },
  marking_points: {
    type: "array",
    items: strictObject({
      point: text,
      marks: { type: "number" },
      status: { type: "string", enum: ["awarded", "partial", "missed"] },
      marks_awarded: { type: "number" },
      matched_text: { type: ["string", "null"] },
    }),
  },
  conceptual_errors: list,
  icse_style_issues: list,
  unassessable_components: list,
  model_answer: text,
  model_answer_source: { type: "string", enum: ["verified", "ai_generated"] },
  examiner_feedback: text,
  improvement_tips: list,
});

// ─── Request ─────────────────────────────────────────────────────────────────

function joinText(value: string | Anthropic.ContentBlockParam[]): string {
  if (typeof value === "string") return value;
  return value
    .map((block) => {
      if (block.type !== "text") throw new Error("Photo answers can't be graded on the free provider");
      return block.text;
    })
    .join("");
}

export async function requestGradingFromGroq({
  system,
  content,
  label,
}: {
  system: string | Anthropic.TextBlockParam[];
  content: string | Anthropic.ContentBlockParam[];
  label: string;
}): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");

  // /api/evaluate-derived's classifier is the one reply that isn't an evaluation.
  const classifying = label === "derived-classify";

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || DEFAULT_MODEL,
      messages: [
        { role: "system", content: joinText(system) },
        { role: "user", content: joinText(content) },
      ],
      temperature: 0,
      // Reasoning tokens count towards the completion ceiling.
      reasoning_effort: "low",
      include_reasoning: false,
      max_completion_tokens: classifying ? CLASSIFIER_COMPLETION_TOKENS : MAX_COMPLETION_TOKENS,
      response_format: classifying
        ? { type: "json_object" }
        : { type: "json_schema", json_schema: { name: "evaluation", strict: true, schema: EVALUATION_SCHEMA } },
    }),
  });

  if (!response.ok) {
    // The provider's text goes to the log; the thrown message is safe to surface.
    console.error("[BoardEdge] Groq error:", response.status, (await response.text()).slice(0, 500));
    if (response.status === 429) throw new Error("Grading is busy. Please try again in a minute. (429)");
    if (response.status === 413) throw new Error("This answer is too long to grade right now. (413)");
    throw new Error(`Grading service error (${response.status})`);
  }

  const data = (await response.json()) as {
    model?: string;
    choices?: { finish_reason?: string; message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = data.choices?.[0];

  console.info("[BoardEdge] model usage:", {
    label,
    model: data.model,
    stop_reason: choice?.finish_reason,
    input: data.usage?.prompt_tokens,
    output: data.usage?.completion_tokens,
  });

  const reply = choice?.message?.content;
  if (!reply) throw new Error("The grading model returned no text content");
  return reply;
}
