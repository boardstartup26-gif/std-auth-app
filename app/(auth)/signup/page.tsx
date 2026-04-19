import { SignupForm } from "@/components/auth/signup-form";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

async function resolveSiteUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export default async function SignupPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const siteUrl = await resolveSiteUrl();

  return (
    <>
      <div className="absolute inset-x-0 top-0">
        <SiteHeader />
      </div>
      <SignupForm siteUrl={siteUrl} error={params.error} notice={params.notice} />
    </>
  );
}
