import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { assertSupabasePublicEnv } from "@/lib/supabase/env";

export async function createServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = assertSupabasePublicEnv();

  return createSupabaseServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Components cannot set cookies; session refresh runs in `middleware.ts`.
        }
      },
    },
  });
}
