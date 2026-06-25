// app/(auth)/login/page.tsx
import { AuthForm } from "../_components/AuthForm";
import { login } from "../actions";

export default function LoginPage() {
  return (
    <AuthForm
      title="Log in"
      action={login}
      submitLabel="Log in"
      alternate={{ href: "/signup", label: "Create account" }}
      showForgotPassword        // ← only on login
    />
  );
}

