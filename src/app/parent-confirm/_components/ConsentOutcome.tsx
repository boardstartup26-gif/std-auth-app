// Shared copy for every non-"ready" state of a parent confirmation link, used
// both when the page is first opened and after the confirm button is pressed.
// Every failure gets its own plain-language explanation — never a blank page.

import Link from "next/link";
import type { ConfirmResult } from "@/lib/parent-consent/service";
import { GRIEVANCE_EMAIL } from "@/lib/parent-consent/constants";

const COPY: Record<ConfirmResult["state"], { title: string; body: string; tone: "ok" | "error" }> = {
  confirmed: {
    title: "Thank you — consent confirmed",
    body: "Your child can now submit answers for grading on BoardEdge. You can withdraw consent at any time by emailing us.",
    tone: "ok",
  },
  already_confirmed: {
    title: "Consent was already confirmed",
    body: "This link has already been used, and your child's account is active. Nothing more is needed.",
    tone: "ok",
  },
  expired: {
    title: "This link has expired",
    body: "Confirmation links are valid for 72 hours. Ask your child to send a new one from their BoardEdge account — no answers are graded until you confirm.",
    tone: "error",
  },
  superseded: {
    title: "This link has been replaced",
    body: "A newer confirmation email was sent after this one, so this link no longer works. Please use the link in the most recent email from BoardEdge.",
    tone: "error",
  },
  revoked: {
    title: "Consent was withdrawn",
    body: "Consent for this account was withdrawn, so this link can't be used. If you'd like to give consent again, please email us.",
    tone: "error",
  },
  invalid: {
    title: "This link isn't valid",
    body: "The link may be incomplete — some email apps break long links across lines. Try copying the full address from the email into your browser.",
    tone: "error",
  },
  unavailable: {
    title: "Something went wrong on our side",
    body: "We couldn't process this link just now. Please try again in a few minutes.",
    tone: "error",
  },
};

export function ConsentOutcome({ state }: { state: ConfirmResult["state"] }) {
  const copy = COPY[state];
  return (
    <div
      role={copy.tone === "error" ? "alert" : "status"}
      className={`rounded-2xl border bg-card p-6 sm:p-8 ${
        copy.tone === "ok" ? "border-awarded" : "border-accent"
      }`}
    >
      <h2 className={`text-xl font-semibold tracking-tight ${copy.tone === "ok" ? "text-awarded" : "text-accent"}`}>
        {copy.title}
      </h2>
      <p className="mt-3 leading-relaxed text-foreground">{copy.body}</p>
      <p className="mt-4 text-sm text-muted-foreground">
        Questions, or want to withdraw consent or delete the account? Email{" "}
        <a href={`mailto:${GRIEVANCE_EMAIL}`} className="text-foreground underline underline-offset-2">
          {GRIEVANCE_EMAIL}
        </a>
        . Read our <Link href="/privacy" className="text-foreground underline underline-offset-2">Privacy Policy</Link>.
      </p>
    </div>
  );
}
