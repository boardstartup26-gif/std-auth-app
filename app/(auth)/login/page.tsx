import { LoginForm } from "@/components/auth/login-form";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

function pickNext(raw: string | undefined) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

export default async function LoginPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const nextPath = pickNext(params.next);
  const error = params.error;

  return (
    <>
      <div className="absolute inset-x-0 top-0">
        <SiteHeader />
      </div>
      <LoginForm nextPath={nextPath} error={error} />
    </>
  );
}
