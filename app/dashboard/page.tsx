import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = (data?.claims ?? {}) as Record<string, unknown>;
  const email = typeof claims.email === "string" ? claims.email : null;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Welcome back
        </h1>
        <p className="mt-1 text-muted-foreground">
          You are signed in with a secure Supabase session (SSR + cookies).
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Session details from your JWT claims.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Email</span>
              <span className="truncate font-medium">{email ?? "—"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">User id</span>
              <span className="truncate font-mono text-xs">
                {typeof claims.sub === "string" ? claims.sub : "—"}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Next steps</CardTitle>
            <CardDescription>Ideas for extending this starter.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              <li>Add a `students` table and RLS policies in Supabase.</li>
              <li>Store profile fields in `public.profiles` keyed by `user_id`.</li>
              <li>Wire assignments or courses as separate routes under `/dashboard`.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
