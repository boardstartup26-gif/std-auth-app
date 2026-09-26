// Onboarding vocabulary. Safe to import from client components — profile.ts
// pulls in the server Supabase client, so client code must import from here.
//
// The option values are mirrored by CHECK constraints in
// supabase/migrations/20260922120000_profile_onboarding.sql — change both.

export const STUDY_STAGES = [
  { value: "icse_10", label: "ICSE Class 10", hint: "Boards in 2027" },
  { value: "icse_9", label: "ICSE Class 9", hint: null },
  { value: "isc_11", label: "ISC Class 11", hint: null },
  { value: "isc_12", label: "ISC Class 12", hint: null },
  { value: "other_board", label: "Another board", hint: "CBSE, state board, IB…" },
] as const;

export const HEARD_FROM = [
  { value: "reddit", label: "Reddit" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "friend", label: "A friend" },
  { value: "school", label: "School or a teacher" },
  { value: "search", label: "Google search" },
  { value: "other", label: "Somewhere else" },
] as const;

export type StudyStage = (typeof STUDY_STAGES)[number]["value"];
export type HeardFrom = (typeof HEARD_FROM)[number]["value"];
