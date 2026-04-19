"use client";

import { createBrowserClient } from "@supabase/ssr";

import { assertSupabasePublicEnv } from "@/lib/supabase/env";

/** Browser Supabase client (singleton inside `createBrowserClient`). */
export function createBrowserSupabaseClient() {
  const { url, key } = assertSupabasePublicEnv();
  return createBrowserClient(url, key);
}
