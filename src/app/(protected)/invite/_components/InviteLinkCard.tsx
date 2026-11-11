"use client";

// The invite link, front and centre: the link itself in a read-only field,
// Copy link, then the ways to send it — WhatsApp (where ICSE students talk)
// and the phone's own share sheet when there is one.
//
// Copy puts just the link on the clipboard; WhatsApp and the share sheet send
// the full invite message (inviteMessage), the same text ShareInvite uses
// elsewhere. Every press is recorded as REFERRAL_SHARE_CLICKED, as before.
//
// Nothing here creates links or awards credits: the URL is built server-side
// from the student's referral code, and rewards happen when a friend qualifies.

import { useRef, useState, useSyncExternalStore } from "react";
import { AlertCircle, Check, Copy, Link2, Share2 } from "lucide-react";
import { EVENTS } from "@/lib/analytics/events";
import { track } from "@/lib/analytics/track";

const noopSubscribe = () => () => {};

type Feedback = { tone: "ok" | "error"; text: string } | null;

function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3Z" />
    </svg>
  );
}

/**
 * Fallback for browsers that refuse the async Clipboard API (non-secure
 * contexts, some in-app browsers): copy from an off-screen textarea.
 * execCommand is deprecated but still the only option there.
 */
function legacyCopy(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    ta.remove();
  }
}

const secondaryBtn =
  "inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3.5 text-[13px] font-medium text-foreground transition-colors hover:border-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function InviteLinkCard({ url, message }: { url: string; message: string }) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // false on the server and during hydration, the real answer after.
  const canNativeShare = useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator.share === "function",
    () => false,
  );

  // What the student sees: the link without its tracking parameters. What is
  // copied and shared: the full link, so the signup is still attributed.
  const shown = url.split("?")[0];
  const record = (channel: string) => track(EVENTS.REFERRAL_SHARE_CLICKED, { surface: "invite_page", channel, challenge: false });

  function say(next: Feedback) {
    setFeedback(next);
    if (timer.current) clearTimeout(timer.current);
    if (next?.tone === "ok") timer.current = setTimeout(() => setFeedback(null), 2500);
  }

  async function copy() {
    record("copy_link");
    let ok = false;
    try {
      // Some embedded browsers leave writeText pending for seconds before
      // refusing; don't make the student wait on that.
      await Promise.race([
        navigator.clipboard.writeText(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error("clipboard timeout")), 800)),
      ]);
      ok = true;
    } catch {
      ok = legacyCopy(url);
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      say({ tone: "ok", text: "Link copied. Paste it into a chat with your classmates." });
    } else {
      // Both blocked (permissions, some in-app browsers): select the link so
      // a long-press or Ctrl+C still works. The code is in the path, so the
      // signup is still credited without the tracking parameters.
      field.current?.select();
      say({ tone: "error", text: "Couldn’t copy automatically — the link is selected, so copy it with Ctrl+C or a long-press." });
    }
  }

  async function nativeShare() {
    record("native");
    try {
      await navigator.share({ text: message });
    } catch (err) {
      // A dismissed share sheet is the student changing their mind, not an error.
      if (err instanceof DOMException && err.name === "AbortError") return;
      say({ tone: "error", text: "Sharing didn’t work on this device. Copy the link instead." });
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <label className="flex h-11 min-w-0 shrink-0 items-center sm:flex-1 sm:shrink gap-2.5 rounded-md border border-border bg-background px-3.5 focus-within:border-accent">
          <Link2 size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-accent" />
          <span className="sr-only">Your invite link</span>
          <input
            ref={field}
            readOnly
            value={shown}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground outline-none tabular-nums"
          />
        </label>
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-accent px-4 text-[13.5px] font-medium text-background transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => record("whatsapp")}
          className={secondaryBtn}
        >
          <span className="text-[#1F8A4C]">
            <WhatsAppGlyph />
          </span>
          Share on WhatsApp
        </a>
        {canNativeShare ? (
          <button type="button" onClick={nativeShare} className={secondaryBtn}>
            <Share2 size={15} aria-hidden className="text-accent" />
            More ways to share
          </button>
        ) : null}
      </div>

      <p
        role="status"
        aria-live="polite"
        className={`mt-3 flex min-h-5 items-start gap-1.5 text-[12.5px] ${feedback?.tone === "error" ? "text-accent" : "text-status-correct"}`}
      >
        {feedback ? (
          <>
            {feedback.tone === "error" ? (
              <AlertCircle size={14} aria-hidden className="mt-0.5 shrink-0" />
            ) : (
              <Check size={14} aria-hidden className="mt-0.5 shrink-0" />
            )}
            {feedback.text}
          </>
        ) : null}
      </p>
    </div>
  );
}
