"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { EVENTS } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";
import { HEARD_FROM, STUDY_STAGES } from "@/lib/onboarding/constants";
import { SUBJECTS } from "@/app/(protected)/evaluate/_lib/question";

export type OnboardingResult = { ok: false; message: string } | null;

const name = z.string().trim().min(1).max(60);

const schema = z.object({
  firstName: name,
  lastName: name,
  studyStage: z.enum(STUDY_STAGES.map((s) => s.value) as [string, ...string[]]),
  subjects: z.array(z.enum(SUBJECTS)).min(1).max(SUBJECTS.length),
  heardFrom: z.enum(HEARD_FROM.map((h) => h.value) as [string, ...string[]]),
});

export async function completeOnboarding(
  _prev: OnboardingResult,
  formData: FormData,
): Promise<OnboardingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Please log in again." };

  const parsed = schema.safeParse({
    firstName: formData.get("first_name"),
    lastName: formData.get("last_name"),
    studyStage: formData.get("study_stage"),
    subjects: [...new Set(formData.getAll("subjects"))],
    heardFrom: formData.get("heard_from"),
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const message =
      field === "firstName" || field === "lastName"
        ? "Please enter your first and last name."
        : field === "studyStage"
          ? "Please choose which class you're in."
          : field === "subjects"
            ? "Pick at least one subject you want to practise."
            : field === "heardFrom"
              ? "Please tell us how you heard about BoardEdge."
              : "Please check the form and try again.";
    return { ok: false, message };
  }

  const { firstName, lastName, studyStage, subjects, heardFrom } = parsed.data;

  // profiles has no client write grant by design, so this goes through the
  // service role. The row is pinned to the verified session's id and the
  // column list is fixed — role is never written, so a row created here gets
  // the column default. Upsert, not update: handle_new_user() swallows its own
  // failures, and an update against a missing row would leave the student
  // bouncing between here and the layout's redirect forever.
  const { error } = await createAdminClient()
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
        first_name: firstName,
        last_name: lastName,
        study_stage: studyStage,
        subjects,
        heard_from: heardFrom,
        onboarded_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (error) {
    console.error("[BoardEdge] onboarding save failed:", error.message);
    return { ok: false, message: "We couldn't save that just now. Please try again." };
  }

  // Google signups arrive without first_name in their metadata, and the
  // dashboard greeting and consent emails read it from there.
  await supabase.auth.updateUser({ data: { first_name: firstName, last_name: lastName } });

  after(() =>
    recordServerEvent({
      eventName: EVENTS.ONBOARDING_COMPLETED,
      userId: user.id,
      properties: { study_stage: studyStage, heard_from: heardFrom, subject_count: subjects.length },
      path: "/onboarding",
    }),
  );

  revalidatePath("/", "layout");
  redirect("/evaluate");
}
