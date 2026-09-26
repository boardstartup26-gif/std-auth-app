"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { EVENTS } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";
import { recordSignupConsent } from "@/lib/legal/consent";
import { normaliseParentEmail, requestParentConsent } from "@/lib/parent-consent/service";
import { sendWelcomeEmail } from "@/lib/email/welcome";
import { safeNextPath } from "@/lib/safe-next";

type AuthResult =
  | { ok: true }
  | { ok: false; message: string };

function asMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}

export async function login(
  _prevState: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { ok: false, message: "Email and password are required." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      // after() keeps telemetry off the critical path — the student's error
      // message is already decided by this point.
      after(() =>
        recordServerEvent({
          eventName: EVENTS.AUTH_FAILED,
          properties: { action: "login", method: "password", reason: error.message },
          path: "/login",
        }),
      );
      return { ok: false, message: error.message };
    }

    const userId = data.user?.id ?? null;
    after(() =>
      recordServerEvent({
        eventName: EVENTS.LOGIN_COMPLETED,
        userId,
        properties: { method: "password" },
        path: "/login",
      }),
    );
  } catch (e) {
    return { ok: false, message: asMessage(e, "Login failed.") };
  }

  // Re-validated here, not trusted from the page: the hidden field is
  // browser-editable.
  redirect(safeNextPath(formData.get("next")) ?? "/dashboard");
}

export async function signup(
  _prevState: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();

  if (!email || !password) {
    return { ok: false, message: "Email and password are required." };
  }
  if (!firstName || !lastName) {
    return { ok: false, message: "First and last name are required." };
  }
  // Re-checked here because the checkbox's `required` attribute is only a
  // browser hint — a hand-built POST skips it. Only the fact of acceptance
  // comes from the form; which versions were accepted is decided server-side
  // in recordSignupConsent.
  if (formData.get("accept_policies") !== "on") {
    return {
      ok: false,
      message: "Please agree to the Terms & Conditions and Privacy Policy to create an account.",
    };
  }
  // Validated before the account exists, so a typo is caught while the
  // student is still on the form rather than discovered as a bounced email.
  const parentEmail = normaliseParentEmail(formData.get("parent_email"));
  if (!parentEmail) {
    return { ok: false, message: "Please enter a valid parent or guardian email address." };
  }
  if (parentEmail === email.toLowerCase()) {
    return {
      ok: false,
      message: "Your parent or guardian's email must be different from your own.",
    };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName, last_name: lastName },
      },
    });

    if (error) {
      after(() =>
        recordServerEvent({
          eventName: EVENTS.AUTH_FAILED,
          properties: { action: "signup", method: "password", reason: error.message },
          path: "/signup",
        }),
      );
      return { ok: false, message: error.message };
    }

    // Recorded whether or not a session came back: an account that exists but
    // is awaiting email confirmation is still a conversion, and the
    // `confirmation_pending` flag is what makes the gap between the two
    // visible on the dashboard.
    const newUserId = data.user?.id ?? null;
    const confirmationPending = !data.session;

    // Awaited rather than deferred to after(): this is the compliance record,
    // and it should exist before the student lands on the dashboard. It never
    // throws. An empty `identities` array is Supabase's enumeration-safe reply
    // for an email that already has an account — that id is not a new user
    // who just agreed to anything, so nothing is recorded for it.
    const isRealNewUser = Boolean(newUserId) && (data.user?.identities?.length ?? 0) > 0;
    if (newUserId && isRealNewUser) {
      await recordSignupConsent(newUserId, "email_signup");
    }

    // Welcome email — to the student's own address, only for a genuine new
    // signup, never a login. Deferred to after(): it's not compliance-
    // critical and its outcome doesn't affect what the student sees next.
    if (isRealNewUser) {
      after(() => sendWelcomeEmail({ to: email, firstName: firstName || null }));
    }

    // Parental consent request. Account creation is never blocked on it —
    // evaluation access is (see src/app/api/evaluate/route.ts). If the email
    // fails to send, the student sees a "resend" prompt after logging in.
    // Skipped for the enumeration-safe fake user: that id belongs to an
    // existing account, and emailing a stranger's parent from it would be
    // both wrong and a spam vector.
    let parentEmailSent = false;
    if (newUserId && isRealNewUser) {
      const result = await requestParentConsent({
        userId: newUserId,
        studentEmail: email,
        studentFirstName: firstName,
        parentEmail,
      });
      parentEmailSent = result.ok;
    }
    after(() =>
      recordServerEvent({
        eventName: EVENTS.SIGNUP_COMPLETED,
        userId: newUserId,
        properties: { method: "password", confirmation_pending: confirmationPending },
        path: "/signup",
      }),
    );

    if (!data.session) {
      return {
        ok: false,
        message: parentEmailSent
          ? "Signup succeeded. Please check your email to confirm your account, then log in. We've also emailed your parent or guardian a link to approve grading — you can practise once they confirm."
          : "Signup succeeded. Please check your email to confirm your account, then log in. After logging in, you'll be asked to send your parent or guardian a consent link.",
      };
    }
  } catch (e) {
    return { ok: false, message: asMessage(e, "Signup failed.") };
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

