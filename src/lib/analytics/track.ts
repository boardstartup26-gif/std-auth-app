// src/lib/analytics/track.ts
//
// Browser-side telemetry dispatcher.
//
// Three jobs, in order of how easy they are to get wrong:
//
//   1. Identity continuity. A visitor is anonymous when they land and named
//      after they sign up; the funnel only joins the two halves if the same
//      anon_id rides along across that boundary, so it lives in localStorage
//      and is never rotated on login.
//   2. Attribution. UTM tags and the external referrer exist only on the
//      landing request. They are captured once, stored, and replayed on every
//      later event — otherwise every conversion looks like it came from
//      "direct".
//   3. Non-blocking dispatch. Telemetry must never delay a render, hold a
//      navigation, or surface an error to a student. Every path here swallows
//      its own failures.
//
// Nothing in this module reads telemetry back. Reads are admin-only and happen
// on the server (see src/lib/analytics/aggregate.ts).

import {
  EVENTS,
  type AnalyticsEventName,
  type AttributionContext,
  type EventProperties,
  type TrackPayload,
} from "./events";

const ANON_KEY = "be_anon_id";
const SESSION_KEY = "be_session_id";
const SESSION_TOUCHED_KEY = "be_session_touched_at";
const ATTRIBUTION_KEY = "be_attribution";
const FIRST_TOUCH_KEY = "be_first_touch_sent";

// A visit that goes quiet for half an hour and comes back is a new session.
// Matches the convention most analytics tools use, so "sessions" here means
// roughly what it means everywhere else.
const SESSION_IDLE_MS = 30 * 60 * 1000;

// Storage can throw, not just return null: Safari private mode and
// "block all cookies" both raise on access. Every read/write goes through
// these, and falls back to a per-tab in-memory map so tracking degrades
// instead of breaking the page it is attached to.
const memoryStore = new Map<string, string>();

function readStore(store: "local" | "session", key: string): string | null {
  try {
    const value = (store === "local" ? window.localStorage : window.sessionStorage).getItem(key);
    if (value !== null) return value;
  } catch {
    // fall through to memory
  }
  return memoryStore.get(`${store}:${key}`) ?? null;
}

function writeStore(store: "local" | "session", key: string, value: string): void {
  memoryStore.set(`${store}:${key}`, value);
  try {
    (store === "local" ? window.localStorage : window.sessionStorage).setItem(key, value);
  } catch {
    // memory copy above is the fallback
  }
}

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// ─── Identity ────────────────────────────────────────────────────────────────

/** Stable per-browser id. Survives signup, logout and login. */
export function getAnonId(): string {
  const existing = readStore("local", ANON_KEY);
  if (existing) return existing;
  const fresh = randomId();
  writeStore("local", ANON_KEY, fresh);
  return fresh;
}

/**
 * Per-visit id. Rolls over after {@link SESSION_IDLE_MS} of inactivity, which
 * is what makes "started a question and never came back" measurable.
 */
export function getSessionId(): string {
  const now = Date.now();
  const touched = Number(readStore("session", SESSION_TOUCHED_KEY) ?? 0);
  const existing = readStore("session", SESSION_KEY);

  if (existing && touched && now - touched < SESSION_IDLE_MS) {
    writeStore("session", SESSION_TOUCHED_KEY, String(now));
    return existing;
  }

  const fresh = randomId();
  writeStore("session", SESSION_KEY, fresh);
  writeStore("session", SESSION_TOUCHED_KEY, String(now));
  return fresh;
}

// ─── Attribution ─────────────────────────────────────────────────────────────

function isInternalReferrer(referrer: string): boolean {
  if (!referrer) return true;
  try {
    return new URL(referrer).host === window.location.host;
  } catch {
    return true;
  }
}

/**
 * First-touch attribution, captured once and then frozen.
 *
 * Deliberately first-touch, not last-touch: the question this answers is
 * "where did this student come from" (Reddit, a campaign, organic search), and
 * a later internal navigation must not overwrite that with a self-referral.
 */
export function getAttribution(): AttributionContext {
  const stored = readStore("local", ATTRIBUTION_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as AttributionContext;
    } catch {
      // corrupt value — fall through and re-capture
    }
  }

  const params = new URLSearchParams(window.location.search);
  const referrer = document.referrer;

  const captured: AttributionContext = {
    referrer: isInternalReferrer(referrer) ? null : referrer.slice(0, 1024),
    utm_source: params.get("utm_source")?.slice(0, 128) ?? null,
    utm_medium: params.get("utm_medium")?.slice(0, 128) ?? null,
    utm_campaign: params.get("utm_campaign")?.slice(0, 128) ?? null,
  };

  writeStore("local", ATTRIBUTION_KEY, JSON.stringify(captured));
  return captured;
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

function send(payload: TrackPayload, { beacon }: { beacon: boolean }): void {
  const body = JSON.stringify(payload);

  // sendBeacon is the only dispatch the browser guarantees to finish once the
  // page is going away, so it is the default. It is also genuinely fire-and-
  // forget: no promise, no response, nothing to await.
  if (beacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/track", blob)) return;
      // false means the payload was rejected (too large, queue full) — fall
      // through to fetch rather than silently dropping the event.
    } catch {
      // fall through
    }
  }

  try {
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      // keepalive lets the request outlive the document, so an event fired
      // during an unload handler still lands.
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Telemetry never surfaces to the student.
  }
}

/**
 * Record an event. Safe to call anywhere, including during render — it no-ops
 * on the server and never throws.
 */
export function track(
  eventName: AnalyticsEventName,
  properties: EventProperties = {},
  options: { beacon?: boolean } = {},
): void {
  if (typeof window === "undefined") return;

  try {
    const payload: TrackPayload = {
      event_name: eventName,
      anon_id: getAnonId(),
      session_id: getSessionId(),
      path: window.location.pathname.slice(0, 512),
      properties,
      ...getAttribution(),
    };
    send(payload, { beacon: options.beacon ?? true });
  } catch {
    // Never let instrumentation break a feature.
  }
}

/**
 * Record an event at most once per browser. Used for
 * {@link EVENTS.VISITOR_FIRST_TOUCH}, where a repeat would inflate the top of
 * the funnel on every reload.
 */
export function trackOnce(
  storageKey: string,
  eventName: AnalyticsEventName,
  properties: EventProperties = {},
): void {
  if (typeof window === "undefined") return;
  if (readStore("local", storageKey)) return;
  writeStore("local", storageKey, "1");
  track(eventName, properties);
}

/** Fires VISITOR_FIRST_TOUCH the first time this browser is ever seen. */
export function trackFirstTouch(): void {
  if (typeof window === "undefined") return;
  const attribution = getAttribution();
  trackOnce(FIRST_TOUCH_KEY, EVENTS.VISITOR_FIRST_TOUCH, {
    landing_path: window.location.pathname,
    has_utm: Boolean(attribution.utm_source),
  });
}
