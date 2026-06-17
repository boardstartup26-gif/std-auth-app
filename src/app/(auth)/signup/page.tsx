import { AuthForm } from "../_components/AuthForm";
import { signup } from "../actions";

export default function SignupPage() {
  return (
    <AuthForm
      title="Create account"
      action={signup}
      submitLabel="Create account"
      alternate={{ href: "/login", label: "Already have an account?" }}
    />
  );
}

