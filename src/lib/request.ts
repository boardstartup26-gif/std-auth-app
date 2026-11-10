// src/lib/request.ts
//
// Browser-side fetch with the failure modes named. Callers get a discriminated
// result instead of a thrown error, so every request site can say *why* it
// failed ("you're offline" vs "that took too long" vs "we had a problem") in
// words a student can act on — and never has to show an HTTP status, a stack
// message or a raw provider error.
//
// Client-only (reads `navigator`). Never throws.

export type FailureKind =
  /** The browser reports no connection. */
  | "offline"
  /** The request never got an answer (DNS, dropped connection, CORS). */
  | "network"
  /** We gave up waiting. The server may still have finished the work. */
  | "timeout"
  /** 401: the session is gone. */
  | "auth"
  /** 429: a rate limit or the credit allowance. */
  | "limit"
  /** 5xx, or a reply that wasn't the JSON we expected. */
  | "server"
  /** Any other 4xx. */
  | "client";

export interface RequestFailure {
  ok: false;
  kind: FailureKind;
  status: number;
  /** Safe to show as-is. */
  message: string;
  /** Whether pressing "Try again" with the same input can reasonably succeed. */
  retryable: boolean;
  /** The parsed JSON body, when there was one (e.g. `tokens_remaining`). */
  data: Record<string, unknown> | null;
}

export interface RequestSuccess<T> {
  ok: true;
  status: number;
  data: T;
}

export type RequestResult<T> = RequestSuccess<T> | RequestFailure;

const DEFAULT_MESSAGES: Record<FailureKind, string> = {
  offline: "You’re offline. Reconnect and try again.",
  network: "We couldn’t reach BoardEdge. Check your connection and try again.",
  timeout: "This is taking longer than expected. Please try again in a moment.",
  auth: "Your session has expired. Please sign in again to continue.",
  limit: "You’ve hit a limit for now. Please try again later.",
  server: "Something went wrong on our side. Please try again in a moment.",
  client: "We couldn’t complete that request. Please try again.",
};

function kindForStatus(status: number): FailureKind {
  if (status === 401) return "auth";
  if (status === 429) return "limit";
  if (status >= 500) return "server";
  return "client";
}

/**
 * A server-sent `error` string is shown when there is one: BoardEdge's own
 * routes write those for students (CLAUDE.md: generic messages, never raw
 * provider errors). Anything long or oddly shaped falls back to our copy, so a
 * proxy's error page can never reach the screen.
 */
function serverMessage(data: Record<string, unknown> | null): string | null {
  const e = data?.error;
  return typeof e === "string" && e.trim() && e.length <= 300 ? e.trim() : null;
}

export interface RequestOptions {
  /** Abort after this long. Omit for no client-side limit. */
  timeoutMs?: number;
  /** Per-call wording for particular failure kinds. */
  messages?: Partial<Record<FailureKind, string>>;
}

export async function requestJson<T = Record<string, unknown>>(
  url: string,
  init: RequestInit = {},
  { timeoutMs, messages }: RequestOptions = {},
): Promise<RequestResult<T>> {
  const say = (kind: FailureKind) => messages?.[kind] ?? DEFAULT_MESSAGES[kind];
  const fail = (
    kind: FailureKind,
    status: number,
    data: Record<string, unknown> | null = null,
    message?: string,
  ): RequestFailure => ({
    ok: false,
    kind,
    status,
    data,
    message: message ?? say(kind),
    retryable: kind !== "auth" && kind !== "client" && kind !== "limit",
  });

  if (typeof navigator !== "undefined" && navigator.onLine === false) return fail("offline", 0);

  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetch(url, { ...init, signal: controller?.signal ?? init.signal });
    let data: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = await res.json();
      data = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      const kind = kindForStatus(res.status);
      // 5xx copy is ours unless the route sent its own curated message.
      return fail(kind, res.status, data, messages?.[kind] ?? serverMessage(data) ?? undefined);
    }
    if (data === null) return fail("server", res.status);
    return { ok: true, status: res.status, data: data as T };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return fail("timeout", 0);
    return fail(navigator.onLine === false ? "offline" : "network", 0);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
