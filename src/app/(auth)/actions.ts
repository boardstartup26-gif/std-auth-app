"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return { ok: false, message: error.message };
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

  if (!email || !password) {
    return { ok: false, message: "Email and password are required." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) return { ok: false, message: error.message };

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

