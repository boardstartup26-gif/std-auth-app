import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    redirect("/login?next=/dashboard");
  }

  const claims = data.claims as Record<string, unknown>;
  const email =
    typeof claims.email === "string" ? claims.email : "your account";
  const fullName =
    typeof claims.user_metadata === "object" &&
    claims.user_metadata !== null &&
    typeof (claims.user_metadata as { full_name?: string }).full_name === "string"
      ? (claims.user_metadata as { full_name: string }).full_name
      : null;

  return (
    <div className="flex min-h-svh flex-col bg-muted/20">
      <header className="border-b border-border/80 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <div>
            <p className="font-heading text-sm font-semibold">Student dashboard</p>
            <p className="text-xs text-muted-foreground">
              {fullName ? `${fullName} · ${email}` : email}
            </p>
          </div>
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
