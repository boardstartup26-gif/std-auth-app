// src/lib/evaluation/providers.ts
//
// Free-tier grading: Gemini first, then OpenRouter, then Groq. Used only when
// GRADING_PROVIDER is "free" (all three) or "groq" (Groq alone); anything else
// grades with Claude. requestGrading() in ./model.ts is the only caller, so the
// examiner prompts, user messages, schemas and marking logic are the same on
// every provider.
//
// A request moves to the next model on a rate limit, exhausted quota, timeout,
// API error, refusal, cut-off reply, or a reply that fails the caller's schema.
//
// Before enabling this in production, check each provider's terms: students'
// answers are sent to whichever one serves the request, free tiers may use that
// data, and age restrictions apply. The privacy policy, terms and
// parent-confirm page name Anthropic only.
//
// Server-only: this module reads the API keys.

import type Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import { z } from "zod";
import { EVENTS } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";

export type ProviderId = "gemini" | "openrouter" | "groq";

// ─── Providers ───────────────────────────────────────────────────────────────

interface ProviderConfig {
  endpoint: string;
  keyEnv: string;
  /** Comma-separated override of defaultModels, e.g. GEMINI_MODELS. */
  modelsEnv: string;
  defaultModels: string[];
  /** Refuses anything that could be billed, including through the override. */
  isFree: (model: string) => boolean;
  acceptsImages: (model: string) => boolean;
  /** Longest one attempt may take before moving on. */
  timeoutMs: number;
  /** The parts of the request body that differ between providers. */
  params: (model: string, maxTokens: number) => Record<string, unknown>;
}

// Gemini free-tier models per Google's pricing page (November 2026). Free only
// while the key's Google Cloud project has no billing account attached.
const GEMINI_FREE = new Set([
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
]);
// Free only while the Groq account is on the free plan.
const GROQ_FREE = new Set(["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]);

// Groq counts the prompt plus this ceiling against its per-minute token limit
// (8,000), and the examiner prompt alone is about 2,800.
const GROQ_MAX_COMPLETION_TOKENS = 3000;

const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  gemini: {
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    keyEnv: "GEMINI_API_KEY",
    modelsEnv: "GEMINI_MODELS",
    defaultModels: ["gemini-3.6-flash", "gemini-3.5-flash-lite"],
    isFree: (m) => GEMINI_FREE.has(m),
    acceptsImages: () => true,
    timeoutMs: 20_000,
    // No temperature: Google advises leaving Gemini 3 models at their default.
    params: (_model, maxTokens) => ({ max_tokens: maxTokens, reasoning_effort: "low" }),
  },
  openrouter: {
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    keyEnv: "OPENROUTER_API_KEY",
    modelsEnv: "OPENROUTER_MODELS",
    // Had an endpoint that doesn't collect prompts when chosen. A preview
    // listing, so it may disappear; override with OPENROUTER_MODELS.
    defaultModels: ["baidu/ernie-5.5-flash-preview:free"],
    isFree: (m) => m.endsWith(":free"),
    acceptsImages: (m) => m.startsWith("google/gemma-4"),
    timeoutMs: 25_000,
    params: (_model, maxTokens) => ({
      max_tokens: maxTokens,
      temperature: 0,
      reasoning: { effort: "low" },
      provider: {
        // Never route to an endpoint that charges, or one that stores or trains
        // on prompts: these are children's answers.
        max_price: { prompt: 0, completion: 0 },
        data_collection: "deny",
      },
    }),
  },
  groq: {
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    keyEnv: "GROQ_API_KEY",
    modelsEnv: "GROQ_MODELS",
    defaultModels: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b"],
    isFree: (m) => GROQ_FREE.has(m),
    acceptsImages: (m) => m.startsWith("qwen/"),
    timeoutMs: 15_000,
    params: (model, maxTokens) => ({
      max_completion_tokens: Math.min(maxTokens, GROQ_MAX_COMPLETION_TOKENS),
      temperature: 0,
      // Reasoning tokens count towards the completion ceiling.
      ...(model.startsWith("openai/")
        ? { reasoning_effort: "low", include_reasoning: false }
        : { reasoning_effort: "none" }),
    }),
  },
};

const PRIORITY: ProviderId[] = ["gemini", "openrouter", "groq"];

// ─── Mode and candidates ─────────────────────────────────────────────────────

export function usingFreeProviders(): boolean {
  const mode = process.env.GRADING_PROVIDER;
  return mode === "free" || mode === "groq";
}

export interface Candidate {
  provider: ProviderId;
  model: string;
}

/** Every model to try, in priority order. A provider without a key is left out. */
export function candidates({ images = false } = {}): Candidate[] {
  const order: ProviderId[] = process.env.GRADING_PROVIDER === "groq" ? ["groq"] : PRIORITY;
  return order.flatMap((provider) => {
    const config = PROVIDERS[provider];
    if (!process.env[config.keyEnv]) return [];
    const override = (process.env[config.modelsEnv] ?? "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    return (override.length ? override : config.defaultModels)
      .filter((model) => {
        if (config.isFree(model)) return true;
        console.warn(`[BoardEdge] ignoring ${config.modelsEnv} entry that isn't a known free model: ${model}`);
        return false;
      })
      .filter((model) => !images || config.acceptsImages(model))
      .map((model) => ({ provider, model }));
  });
}

/**
 * Photo answers on free providers are off unless FREE_PHOTO_GRADING=true: the
 * privacy policy promises photos are never stored, and a free tier may keep
 * what it receives.
 */
export function canGradePhotos(): boolean {
  if (!usingFreeProviders()) return true;
  return process.env.FREE_PHOTO_GRADING === "true" && candidates({ images: true }).length > 0;
}

/** A whole paper needs more than Groq's per-minute allowance on its own. */
export function canMarkWrittenPapers(): boolean {
  if (!usingFreeProviders()) return true;
  return candidates().some((c) => c.provider !== "groq");
}

// ─── Output schema ───────────────────────────────────────────────────────────

/** Fields the model must write first: strict modes generate in schema order. */
const LEADING_FIELDS = ["transcript", "legibility"];

/**
 * The caller's Zod schema as strict-mode JSON Schema. Range keywords are dropped
 * (not every provider accepts them); Zod still checks the reply.
 */
export function toProviderSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, {
    io: "output",
    unrepresentable: "any",
    override: ({ jsonSchema }) => {
      delete jsonSchema.minimum;
      delete jsonSchema.exclusiveMinimum;
      // string | null as a type list, which all three providers accept.
      const options = jsonSchema.anyOf as { type?: unknown }[] | undefined;
      if (options?.every((o) => typeof o.type === "string" && Object.keys(o).length === 1)) {
        delete jsonSchema.anyOf;
        jsonSchema.type = options.map((o) => o.type) as never;
      }
    },
  }) as Record<string, unknown>;
  delete json.$schema;

  const properties = json.properties as Record<string, unknown> | undefined;
  if (properties) {
    const rank = (key: string) => (LEADING_FIELDS.includes(key) ? LEADING_FIELDS.indexOf(key) : LEADING_FIELDS.length);
    json.properties = Object.fromEntries(Object.entries(properties).sort(([a], [b]) => rank(a) - rank(b)));
    json.required = Object.keys(json.properties as object);
  }
  return json;
}

/** Whether a reply parses (after any markdown fence) and satisfies the schema. */
function satisfies(reply: string, schema: z.ZodType): boolean {
  try {
    const cleaned = reply
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    return schema.safeParse(JSON.parse(cleaned)).success;
  } catch {
    return false;
  }
}

// ─── Failures and cooldowns ──────────────────────────────────────────────────

export type FailureReason =
  | "rate_limited"
  | "quota_exhausted"
  | "timeout"
  | "network_error"
  | "server_error"
  | "auth_error"
  | "model_unavailable"
  | "request_rejected"
  | "refused"
  | "truncated"
  | "empty_reply"
  | "invalid_output";

/** Reasons that clear by themselves, so the same answer can be graded later. */
const TRANSIENT = new Set<FailureReason>([
  "rate_limited",
  "quota_exhausted",
  "timeout",
  "network_error",
  "server_error",
]);

/** Thrown when every model failed. The message is safe to show a student. */
export class GradingUnavailableError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "GradingUnavailableError";
  }
}

interface Failure {
  reason: FailureReason;
  status?: number;
  retryAfterMs?: number;
  /** Provider's error text for the log, trimmed. Never the request or reply. */
  detail?: string;
}

const COOLDOWN_MS: Partial<Record<FailureReason, number>> = {
  rate_limited: 60_000,
  quota_exhausted: 15 * 60_000,
  auth_error: 10 * 60_000,
  model_unavailable: 10 * 60_000,
  timeout: 30_000,
  server_error: 15_000,
};
const MAX_COOLDOWN_MS = 60 * 60_000;

// Per server instance, so it only saves time: a cold instance simply tries
// again. A bad key cools the whole provider, everything else just the model.
const coolingUntil = new Map<string, number>();

const cooldownKey = (c: Candidate) => `${c.provider}:${c.model}`;

function isCooling(c: Candidate, now: number): boolean {
  return (coolingUntil.get(c.provider) ?? 0) > now || (coolingUntil.get(cooldownKey(c)) ?? 0) > now;
}

function coolDown(c: Candidate, failure: Failure) {
  const base = COOLDOWN_MS[failure.reason];
  if (!base) return;
  const ms = Math.min(failure.retryAfterMs ?? base, MAX_COOLDOWN_MS);
  coolingUntil.set(failure.reason === "auth_error" ? c.provider : cooldownKey(c), Date.now() + ms);
}

export function resetCooldowns() {
  coolingUntil.clear();
}

function classifyStatus(status: number, detail: string): FailureReason {
  if (status === 402) return "quota_exhausted";
  if (status === 429) return /per.?day|daily|PerDay|free-models-per-day/i.test(detail) ? "quota_exhausted" : "rate_limited";
  if (status === 401 || status === 403) return "auth_error";
  if (status === 404) return "model_unavailable";
  if (status === 408 || status === 504) return "timeout";
  if (status >= 500) return "server_error";
  return "request_rejected";
}

// ─── One attempt ─────────────────────────────────────────────────────────────

type Message = { role: "system" | "user"; content: unknown };

function textOf(value: string | Anthropic.TextBlockParam[]): string {
  return typeof value === "string" ? value : value.map((block) => block.text).join("");
}

/** The Claude-shaped content the callers build, in chat-completions form. */
function userContent(content: string | Anthropic.ContentBlockParam[]): unknown {
  if (typeof content === "string") return content;
  return content.map((block) => {
    if (block.type === "text") return { type: "text", text: block.text };
    if (block.type === "image" && block.source.type === "base64") {
      return {
        type: "image_url",
        image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` },
      };
    }
    throw new Error(`Unsupported content block: ${block.type}`);
  });
}

interface ChatResponse {
  model?: string;
  choices?: { finish_reason?: string; message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { code?: number | string; message?: string };
}

type Attempt =
  | { ok: true; reply: string; served?: string; input?: number; output?: number }
  | { ok: false; failure: Failure; reply?: string };

async function attempt(
  candidate: Candidate,
  messages: Message[],
  responseFormat: Record<string, unknown>,
  maxTokens: number,
  timeoutMs: number,
): Promise<Attempt> {
  const config = PROVIDERS[candidate.provider];
  let response: Response;
  let raw: string;
  try {
    response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env[config.keyEnv]}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model: candidate.model,
        messages,
        response_format: responseFormat,
        ...config.params(candidate.model, maxTokens),
      }),
    });
    raw = await response.text();
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    return {
      ok: false,
      failure: { reason: name === "TimeoutError" || name === "AbortError" ? "timeout" : "network_error" },
    };
  }

  let data: ChatResponse | undefined;
  try {
    const parsed = JSON.parse(raw);
    // Gemini wraps error bodies in an array.
    data = Array.isArray(parsed) ? parsed[0] : parsed;
  } catch {
    data = undefined;
  }

  // OpenRouter can report an upstream failure inside a 200.
  if (!response.ok || data?.error) {
    const status = response.ok ? Number(data?.error?.code) || 502 : response.status;
    const detail = String(data?.error?.message ?? "").slice(0, 200);
    const retryAfter = Number(response.headers.get("retry-after"));
    return {
      ok: false,
      failure: {
        reason: classifyStatus(status, raw),
        status,
        detail,
        ...(retryAfter > 0 ? { retryAfterMs: retryAfter * 1000 } : {}),
      },
    };
  }

  const choice = data?.choices?.[0];
  const reply = choice?.message?.content ?? "";
  if (choice?.finish_reason === "content_filter") return { ok: false, failure: { reason: "refused" } };
  if (choice?.finish_reason === "length") return { ok: false, failure: { reason: "truncated" }, reply };
  if (!reply) return { ok: false, failure: { reason: "empty_reply" } };
  return {
    ok: true,
    reply,
    served: data?.model,
    input: data?.usage?.prompt_tokens,
    output: data?.usage?.completion_tokens,
  };
}

// ─── The chain ───────────────────────────────────────────────────────────────

/** Whole-request ceiling, inside the routes' 60 s function limit. */
const DEFAULT_BUDGET_MS = 45_000;
/** Time held back for each provider still waiting its turn. */
const RESERVE_PER_PROVIDER_MS = 8_000;
const MIN_ATTEMPT_MS = 4_000;
/** Free models can spend part of the ceiling on reasoning, so never go lower. */
const MIN_OUTPUT_TOKENS = 1500;

interface AttemptRecord {
  provider: ProviderId;
  model: string;
  reason: FailureReason;
  status?: number;
  ms: number;
}

/** One row per grading request, since host logs don't keep for long. */
function recordUsage(properties: Record<string, unknown>) {
  try {
    after(() => recordServerEvent({ eventName: EVENTS.AI_GRADING_CALL, properties }));
  } catch {
    // Outside a request scope there is nowhere to defer to; the log line stands.
  }
}

export async function requestFromFreeProviders({
  system,
  content,
  maxTokens,
  label,
  schema,
  budgetMs = DEFAULT_BUDGET_MS,
}: {
  system: string | Anthropic.TextBlockParam[];
  content: string | Anthropic.ContentBlockParam[];
  maxTokens: number;
  label: string;
  schema: z.ZodType;
  budgetMs?: number;
}): Promise<string> {
  const startedAt = Date.now();
  const deadline = startedAt + budgetMs;
  const images = typeof content !== "string" && content.some((b) => b.type === "image");

  const all = candidates({ images });
  // Skip models that failed moments ago, unless that would leave nothing.
  const ready = all.filter((c) => !isCooling(c, startedAt));
  const queue = ready.length ? ready : all;

  const messages: Message[] = [
    { role: "system", content: textOf(system) },
    { role: "user", content: userContent(content) },
  ];
  const responseFormat = {
    type: "json_schema",
    json_schema: { name: "grading_reply", strict: true, schema: toProviderSchema(schema) },
  };

  const failures: AttemptRecord[] = [];
  // A reply that arrived but failed validation. If nothing better turns up it is
  // returned, so the caller reports the same parse or schema failure as before.
  let rejectedReply: string | undefined;

  for (let i = 0; i < queue.length; i++) {
    const candidate = queue[i];
    // A bad key found earlier in this request rules out the provider's others.
    if (failures.some((f) => f.provider === candidate.provider && f.reason === "auth_error")) continue;

    const waiting = new Set(queue.slice(i + 1).map((c) => c.provider));
    waiting.delete(candidate.provider);
    const available = deadline - Date.now() - waiting.size * RESERVE_PER_PROVIDER_MS;
    if (available < MIN_ATTEMPT_MS) continue;

    const began = Date.now();
    let result = await attempt(
      candidate,
      messages,
      responseFormat,
      Math.max(maxTokens, MIN_OUTPUT_TOKENS),
      Math.min(PROVIDERS[candidate.provider].timeoutMs, available),
    );
    if (result.ok && !satisfies(result.reply, schema)) {
      result = { ok: false, failure: { reason: "invalid_output" }, reply: result.reply };
    }
    const ms = Date.now() - began;

    if (result.ok) {
      console.info("[BoardEdge] model usage:", {
        label,
        provider: candidate.provider,
        model: result.served ?? candidate.model,
        input: result.input,
        output: result.output,
        latency_ms: ms,
        fallbacks: failures.length,
      });
      recordUsage({
        label,
        ok: true,
        provider: candidate.provider,
        model: candidate.model,
        input_tokens: result.input,
        output_tokens: result.output,
        duration_ms: Date.now() - startedAt,
        fallbacks: failures,
      });
      return result.reply;
    }

    const { failure } = result;
    if (result.reply) rejectedReply = result.reply;
    coolDown(candidate, failure);
    failures.push({ ...candidate, reason: failure.reason, status: failure.status, ms });
    console.warn("[BoardEdge] grading fallback:", {
      label,
      ...candidate,
      reason: failure.reason,
      status: failure.status,
      detail: failure.detail,
      latency_ms: ms,
      next: queue[i + 1] ? cooldownKey(queue[i + 1]) : null,
    });
  }

  console.error("[BoardEdge] grading failed on every free model:", { label, tried: failures.length });
  recordUsage({ label, ok: false, duration_ms: Date.now() - startedAt, fallbacks: failures });

  const retryable = failures.some((f) => TRANSIENT.has(f.reason));
  if (rejectedReply !== undefined && !retryable) return rejectedReply;
  const busy = failures.some((f) => f.reason === "rate_limited" || f.reason === "quota_exhausted");
  throw new GradingUnavailableError(
    busy
      ? "Grading is busy. Please try again in a minute."
      : "Grading is unavailable right now. Please try again shortly.",
    retryable,
  );
}
