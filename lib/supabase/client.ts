"use client";

import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";

import { assertSupabasePublicEnv } from "@/lib/supabase/env";

/** Browser Supabase client (singleton inside `createBrowserClient`). */
export function createBrowserClient() {
  const { url, anonKey } = assertSupabasePublicEnv();
  return createSupabaseBrowserClient(url, anonKey);
}
