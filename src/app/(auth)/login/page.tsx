// app/(auth)/login/page.tsx
import { AuthForm } from "../_components/AuthForm";
import { login } from "../actions";
import { safeNextPath } from "@/lib/safe-next";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  // Validated here and again in the action: the hidden field is
  // browser-editable, so the page's check alone would not be enough.
  const returnTo = safeNextPath(Array.isArray(next) ? next[0] : next);

  return (
    <AuthForm
      title="Log in"
      action={login}
      submitLabel="Log in"
      alternate={{ href: "/signup", label: "Create account" }}
      showForgotPassword        // ← only on login
      next={returnTo ?? undefined}
    />
  );
}
