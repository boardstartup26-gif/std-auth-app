"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { EVENTS } from "@/lib/analytics/events";
import { recordServerEvent } from "@/lib/analytics/server";

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

  redirect("/dashboard");
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
        message:
          "Signup succeeded. Please check your email to confirm your account, then log in.",
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

