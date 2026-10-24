import { cookies } from "next/headers";
import { AuthForm } from "../_components/AuthForm";
import { signup } from "../actions";
import { REFERRAL_QUALIFY_AT, REFERRAL_WEEKLY_BONUS } from "@/lib/constants";
import { REF_COOKIE } from "@/lib/referrals/constants";
import { findReferrerByCode } from "@/lib/referrals/service";

export default async function SignupPage() {
  // Set by /i/{code}. Looked up again here rather than trusted: the cookie
  // only ever carries a code, and the name shown is whatever that code maps to.
  const referrer = await findReferrerByCode((await cookies()).get(REF_COOKIE)?.value);

  return (
    <AuthForm
      title="Create account"
      action={signup}
      submitLabel="Create account"
      alternate={{ href: "/login", label: "Already have an account?" }}
      nameFields
      notice={
        referrer ? (
          <p className="rounded-lg border border-status-correct/40 bg-status-correct-subtle px-4 py-3 text-sm leading-relaxed text-foreground">
            <span className="font-semibold">{referrer.firstName ?? "A friend"} invited you.</span>{" "}
            Get {REFERRAL_QUALIFY_AT} answers marked and you both get{" "}
            <span className="font-semibold text-status-correct">+{REFERRAL_WEEKLY_BONUS} free credits every week</span>.
          </p>
        ) : null
      }
    />
  );
}
