import { AuthForm } from "../_components/AuthForm";
import { login } from "../actions";

export default function LoginPage() {
  return (
    <AuthForm
      title="Student login"
      action={login}
      submitLabel="Log in"
      alternate={{ href: "/signup", label: "Create account" }}
    />
  );
}

