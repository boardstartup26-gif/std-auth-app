import { AuthForm } from "../_components/AuthForm";
import { signup } from "../actions";

export default function SignupPage() {
  return (
    <AuthForm
      title="Student signup"
      action={signup}
      submitLabel="Create account"
      alternate={{ href: "/login", label: "Have an account?" }}
    />
  );
}

