"use server";

// Parent-side confirmation. The token is the only credential: it is
// re-verified here from scratch (signature, expiry, stored hash, pending
// status) — nothing the GET page decided is trusted.

import { confirmParentConsent, type ConfirmResult } from "@/lib/parent-consent/service";

export async function confirmConsent(
  _prev: ConfirmResult | null,
  formData: FormData,
): Promise<ConfirmResult> {
  const token = formData.get("token");
  if (typeof token !== "string" || !token) return { state: "invalid" };
  return confirmParentConsent(token);
}
