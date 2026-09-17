// src/lib/legal/consent.ts
//
// Server-side record of a user accepting the Terms and Privacy Policy.
//
// Only ever called from server code that has just learned the user id from
// Supabase itself (the signUp response, or the OAuth code exchange) — never
// with an id or version taken from a request body. The versions come from
// src/lib/legal/policies.ts, so a tampered form cannot claim consent to a
// different document.
//
// Uses the service-role client deliberately. policy_consents has no INSERT
// policy or grant for clients (users may read their own rows, nothing more),
// and an email signup awaiting confirmation has no session yet, so a
// user-scoped client could not write the row even if a policy allowed it.

import { createAdminClient } from "@/lib/supabase/server";
import { POLICIES } from "./policies";

export type ConsentMethod = "email_signup" | "google_oauth";

/**
 * Insert one row per document. Idempotent: a unique key on
 * (user_id, consent_type, policy_version) means a repeated callback or a
 * double-submitted form records nothing new.
 *
 * Never throws. The account already exists by the time this runs, so failing
 * the request here would strand a real signup behind an error screen; the
 * failure is logged for follow-up instead.
 */
export async function recordSignupConsent(
  userId: string,
  method: ConsentMethod,
): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("policy_consents").upsert(
      [POLICIES.terms, POLICIES.privacy].map((policy) => ({
        user_id: userId,
        consent_type: policy.key,
        policy_version: policy.version,
        method,
      })),
      { onConflict: "user_id,consent_type,policy_version", ignoreDuplicates: true },
    );
    if (error) {
      console.error("[BoardEdge] policy consent insert failed:", error.message);
    }
  } catch (err) {
    console.error("[BoardEdge] policy consent insert threw:", err);
  }
}
