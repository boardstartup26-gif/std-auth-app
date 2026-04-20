import { SignupForm } from "@/components/auth/signup-form";
import { SiteHeader } from "@/components/site-header";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function SignupPage({ searchParams }: Props) {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) {
    redirect("/dashboard");
  }

  const params = await searchParams;

  return (
    <>
      <div className="absolute inset-x-0 top-0">
        <SiteHeader />
      </div>
      <SignupForm error={params.error} notice={params.notice} />
    </>
  );
}
