"use server";

// Student-side parent consent actions: submit/change the parent email, resend.
//
// The user is always taken from the verified session — never from the form —
// and all writes go through src/lib/parent-consent/service.ts on the server.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requestParentConsent, type RequestResult } from "@/lib/parent-consent/service";

export type ParentConsentActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

function messageFor(result: RequestResult): ParentConsentActionResult {
  if (result.ok) {
    return {
      ok: true,
      message: `Sent. We've emailed ${result.parentEmailMasked} a confirmation link — it's valid for 72 hours.`,
    };
  }
  switch (result.reason) {
    case "invalid_email":
      return { ok: false, message: "That doesn't look like a valid email address." };
    case "same_as_student":
      return {
        ok: false,
        message: "Please use your parent's or guardian's own email, not the one you log in with.",
      };
    case "email_required":
      return { ok: false, message: "Enter your parent's or guardian's email address." };
    case "already_confirmed":
      return { ok: true, message: "Your parent or guardian has already confirmed. You're all set." };
    case "revoked":
      return {
        ok: false,
        message:
          "Your parent or guardian withdrew consent, so a new link can't be sent from here. Please contact contact.boardedge@gmail.com.",
      };
    case "rate_limited": {
      const at = result.retryAt ? new Date(result.retryAt) : null;
      const when = at
        ? at.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })
        : null;
      return {
        ok: false,
        message: when
          ? `Too many emails sent recently. You can send another after ${when} IST.`
          : "Too many emails sent recently. Please wait a little and try again.",
      };
    }
    case "send_failed":
      return { ok: false, message: "We couldn't send the email just now. Please try again shortly." };
    default:
      return { ok: false, message: "Something went wrong. Please try again." };
  }
}

export async function submitParentEmail(
  _prev: ParentConsentActionResult | null,
  formData: FormData,
): Promise<ParentConsentActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Please log in again." };

  // Absent on a plain "Resend" (the stored address is reused).
  const parentEmail = formData.get("parent_email");

  const result = await requestParentConsent({
    userId: user.id,
    studentEmail: user.email ?? null,
    studentFirstName: (user.user_metadata?.first_name as string | undefined) ?? null,
    parentEmail: typeof parentEmail === "string" ? parentEmail : undefined,
  });

  // Refresh the notice and the /evaluate lock on the next render.
  revalidatePath("/", "layout");
  return messageFor(result);
}
