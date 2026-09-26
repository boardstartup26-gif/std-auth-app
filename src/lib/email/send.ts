// src/lib/email/send.ts
//
// Transactional email via Resend's HTTP API (plain fetch — no SDK dependency).
//
// Required in production:
//   RESEND_API_KEY   — API key
//   EMAIL_FROM       — verified sender, e.g. "BoardEdge <noreply@yourdomain>"
//
// In development without a key, the message is printed to the server console
// instead of sent, so the parent-consent flow can be exercised locally. That
// fallback is refused in production: silently "sending" nothing would leave
// students stuck waiting on an email that never left.

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Extra MIME headers, e.g. List-Unsubscribe on reminder emails. */
  headers?: Record<string, string>;
}

export type SendResult = { ok: true } | { ok: false; reason: string };

const SEND_TIMEOUT_MS = 10_000;

export async function sendEmail(message: OutgoingEmail): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  const from = process.env.EMAIL_FROM ?? "";

  if (!apiKey || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[BoardEdge] RESEND_API_KEY/EMAIL_FROM not set — dev mode, email not sent.\n` +
          `  to: ${message.to}\n  subject: ${message.subject}\n\n${message.text}\n`,
      );
      return { ok: true };
    }
    console.error("[BoardEdge] email not configured: RESEND_API_KEY and EMAIL_FROM are required.");
    return { ok: false, reason: "not_configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        ...(message.headers ? { headers: message.headers } : {}),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!res.ok) {
      // Resend's error bodies are structural ("The `from` field is not a
      // verified domain.") rather than a copy of the recipient, and a bare
      // status code alone (the previous behaviour here) wasn't enough to
      // diagnose a real misconfiguration without another deploy-and-retry
      // cycle — so this now logs the body too, capped defensively in case a
      // future error shape is more verbose than expected.
      const bodyText = await res.text().catch(() => "");
      console.error(
        "[BoardEdge] email send failed with status",
        res.status,
        "body:",
        bodyText.slice(0, 500),
      );
      return { ok: false, reason: `provider_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[BoardEdge] email send threw:", err);
    return { ok: false, reason: "network" };
  }
}

/** Escape user-supplied text (e.g. a student's first name) for HTML email. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
