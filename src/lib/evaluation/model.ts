// src/lib/evaluation/model.ts
//
// The one entry point for grading requests. The typed route, the handwritten
// routes, the practice-paper marker and /api/evaluate-derived all call through
// here, so the model, thinking setting, prompt caching and refusal handling
// can't drift apart between them. GRADING_PROVIDER=free (or groq) sends the
// same request down the free-tier chain in ./providers.ts instead of to Claude.
//
// Server-only.

import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { buildExaminerSystemPrompt, CORE_PROMPT } from "@/lib/prompts/examiner-prompt";
import { requestFromFreeProviders, usingFreeProviders } from "./providers";

export const GRADING_MODEL = "claude-sonnet-5-5";

// max_tokens is a ceiling, not a charge: only tokens actually written are
// billed. Sonnet 5.5 counts roughly 30% more tokens than 4.5 did for the same
// text, so these are higher than the 4096 / 8192 they replace.
export const GRADING_MAX_TOKENS = 6000;
/** Transcript plus the full evaluation in one reply. */
export const HANDWRITTEN_MAX_TOKENS = 11000;

/**
 * The examiner system prompt as cacheable blocks: core doctrine (shared by every
 * subject), then the subject module, then a caller's addendum if it has one.
 * Joined together the blocks are exactly the single string the model used to
 * receive; only the packaging differs. Each block ends a cache prefix, so a
 * request for one subject can still reuse the core another subject cached.
 * Entries live 5 minutes and every read renews them.
 */
export function examinerSystem(subject: string, addendum?: string): Anthropic.TextBlockParam[] {
  const prompt = buildExaminerSystemPrompt(subject);
  const parts = [CORE_PROMPT, prompt.slice(CORE_PROMPT.length)];
  if (addendum) parts.push(`\n\n${addendum}`);
  return parts.map((text) => ({ type: "text", text, cache_control: { type: "ephemeral" } }));
}

// Loaded on first use: the free-tier path never needs the SDK, and a cold start
// shouldn't pay for it before the first model call. Reused so connections are.
let anthropicClient: Promise<Anthropic> | null = null;

function claude(): Promise<Anthropic> {
  anthropicClient ??= import("@anthropic-ai/sdk").then(
    ({ default: Client }) => new Client({ apiKey: process.env.ANTHROPIC_API_KEY }),
  );
  return anthropicClient;
}

/**
 * Sends one grading request and returns the reply text. Throws on an API error,
 * a refusal or an empty reply; each caller keeps its own parsing, refund and
 * telemetry.
 */
export async function requestGrading({
  system,
  content,
  maxTokens,
  label,
  schema,
  budgetMs,
}: {
  system: string | Anthropic.TextBlockParam[];
  content: string | Anthropic.ContentBlockParam[];
  maxTokens: number;
  /** Which call site this is, for the usage log. */
  label: string;
  /** Shape of the expected reply. The free chain requests and checks it; Claude is prompted. */
  schema: z.ZodType;
  /** Free chain only: how long all attempts together may take. */
  budgetMs?: number;
}): Promise<string> {
  if (usingFreeProviders()) {
    return requestFromFreeProviders({ system, content, maxTokens, label, schema, budgetMs });
  }

  const body = {
    model: GRADING_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content }],
    // No extended thinking, as before. Sonnet 5.5 thinks by default and counts
    // it against max_tokens; "between_tools" is its off setting ("disabled" is
    // rejected). Sampling parameters such as temperature are rejected too.
    thinking: { type: "between_tools" },
    // If a safety classifier declines in a category the API can retry, it
    // re-runs the request on a fallback model within the same call.
    fallbacks: "default",
  };

  // SDK 0.71 predates both "between_tools" and "fallbacks", hence the cast. The
  // SDK sends the body through unchanged.
  const message = await (await claude()).messages.create(
    body as unknown as Anthropic.MessageCreateParamsNonStreaming,
    { headers: { "anthropic-beta": "server-side-fallback-2026-07-01" } },
  );

  // Token counts only, never student content. A cache_read of 0 on every call
  // means caching has stopped working.
  console.info("[BoardEdge] model usage:", {
    label,
    model: message.model,
    stop_reason: message.stop_reason,
    input: message.usage.input_tokens,
    cache_write: message.usage.cache_creation_input_tokens,
    cache_read: message.usage.cache_read_input_tokens,
    output: message.usage.output_tokens,
  });

  // A refusal is an HTTP 200 whose content may be empty or partial. The SDK's
  // StopReason type already includes it.
  if (message.stop_reason === "refusal") throw new Error("Claude declined to grade this request");

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Claude returned no text content");
  return textBlock.text;
}
