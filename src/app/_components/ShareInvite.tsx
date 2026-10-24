"use client";

// The share action for the referral program, used everywhere an invite is
// offered (/invite, out-of-credits, a good result, paper results, dashboard).
// WhatsApp first — that is where ICSE students actually talk — then copy, then
// the phone's own share sheet when there is one.
//
// No contact upload and no "enter your friend's email": the people being
// invited are minors, and we don't message anyone who hasn't come to us.

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { EVENTS } from "@/lib/analytics/events";
import { track } from "@/lib/analytics/track";
import type { ShareSurface } from "@/lib/referrals/constants";

const noopSubscribe = () => () => {};

interface Invite {
  url: string;
  message: string;
}

function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3Z" />
    </svg>
  );
}

export function ShareInvite({
  surface,
  questionId = null,
  challenge = null,
  initial = null,
  compact = false,
}: {
  surface: ShareSurface;
  questionId?: string | null;
  /** One line that turns the invite into a dare, e.g. "I scored 4/5 on this." */
  challenge?: string | null;
  /** Server-built link, when the page already has it. Otherwise fetched. */
  initial?: Invite | null;
  compact?: boolean;
}) {
  const [invite, setInvite] = useState<Invite | null>(initial);
  const [copied, setCopied] = useState(false);
  // false on the server and during hydration, the real answer after.
  const canNativeShare = useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator.share === "function",
    () => false,
  );

  useEffect(() => {
    if (initial) return;
    const params = new URLSearchParams({ surface });
    if (questionId) params.set("q", questionId);
    if (challenge) params.set("challenge", challenge);
    let cancelled = false;
    fetch(`/api/referral/link?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Invite | null) => {
        if (!cancelled && data?.url) setInvite({ url: data.url, message: data.message });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initial, surface, questionId, challenge]);

  const record = (channel: string) =>
    track(EVENTS.REFERRAL_SHARE_CLICKED, { surface, channel, challenge: Boolean(questionId) });

  if (!invite) {
    return <div className={compact ? "h-9" : "h-11"} aria-hidden />;
  }

  const height = compact ? "h-9 text-xs" : "h-11 text-sm";
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(invite.message)}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={whatsapp}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => record("whatsapp")}
        className={`${height} inline-flex items-center gap-2 rounded-lg bg-[#1F8A4C] px-4 font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
      >
        <WhatsAppGlyph />
        Send on WhatsApp
      </a>
      <button
        type="button"
        onClick={async () => {
          record("copy");
          try {
            await navigator.clipboard.writeText(invite.message);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Clipboard blocked (insecure context, permissions): nothing to do.
          }
        }}
        className={`${height} inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 font-medium text-foreground transition-colors hover:border-foreground/30`}
      >
        {copied ? <Check size={15} className="text-status-correct" aria-hidden /> : <Copy size={15} aria-hidden />}
        <span aria-live="polite">{copied ? "Copied" : "Copy invite"}</span>
      </button>
      {canNativeShare ? (
        <button
          type="button"
          onClick={async () => {
            record("native");
            try {
              await navigator.share({ text: invite.message });
            } catch {
              // Dismissed share sheet — not an error.
            }
          }}
          aria-label="More ways to share"
          className={`${height} inline-flex items-center rounded-lg border border-border bg-card px-3 text-foreground transition-colors hover:border-foreground/30`}
        >
          <Share2 size={15} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
