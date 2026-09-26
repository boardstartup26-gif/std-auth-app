// Server-only: "has this student onboarded?" Client code imports the option
// lists from ./constants instead.

import { createClient } from "@/lib/supabase/server";

export interface OnboardingProfile {
  firstName: string | null;
  lastName: string | null;
  onboarded: boolean;
}

/**
 * Reads the student's own profile through the session client, so RLS
 * (profiles_select_own) is what scopes it. Returns null when the read fails —
 * most likely because the onboarding migration isn't applied yet — and callers
 * treat null as "don't redirect", since onboarding is UX, not access control.
 */
export async function readOnboardingProfile(userId: string): Promise<OnboardingProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("first_name, last_name, onboarded_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[BoardEdge] onboarding profile read failed:", error.message);
    return null;
  }
  return {
    firstName: (data?.first_name as string | null) ?? null,
    lastName: (data?.last_name as string | null) ?? null,
    onboarded: Boolean(data?.onboarded_at),
  };
}
