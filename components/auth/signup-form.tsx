"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserClient } from "@/lib/supabase/client";

type Props = {
  error?: string;
  notice?: string;
};

export function SignupForm({ error, notice }: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<string | null>(error ?? null);
  const [localNotice, setLocalNotice] = React.useState<string | null>(notice ?? null);

  return (
    <Card className="mx-auto w-full max-w-md border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>Create student account</CardTitle>
        <CardDescription>
          Sign up with your school email. You may need to confirm your inbox if your project requires email verification.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setMessage(null);
            setLocalNotice(null);

            const form = new FormData(e.currentTarget);
            const fullName = String(form.get("full_name") ?? "").trim();
            const email = String(form.get("email") ?? "").trim();
            const password = String(form.get("password") ?? "");

            startTransition(async () => {
              try {
                const supabase = createBrowserClient();
                const origin =
                  typeof window !== "undefined" ? window.location.origin : "";
                const emailRedirectTo = `${origin}/auth/callback?next=/dashboard`;

                const { data, error } = await supabase.auth.signUp({
                  email,
                  password,
                  options: {
                    emailRedirectTo,
                    data: fullName ? { full_name: fullName } : undefined,
                  },
                });

                if (error) {
                  setMessage(error.message);
                  return;
                }

                // If email confirmation is enabled, you won't get a session yet.
                if (data.user && !data.session) {
                  setLocalNotice("confirm_email");
                  return;
                }

                router.push("/dashboard");
                router.refresh();
              } catch (err) {
                setMessage(err instanceof Error ? err.message : String(err));
              }
            });
          }}
        >
          {message ? (
            <p
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {message}
            </p>
          ) : null}
          {localNotice === "confirm_email" ? (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              Check your email and use the confirmation link to finish setting up your account, then sign in.
            </p>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="full_name">Full name (optional)</Label>
            <Input
              id="full_name"
              name="full_name"
              type="text"
              autoComplete="name"
              placeholder="Alex Student"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@school.edu"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              placeholder="At least 6 characters"
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Creating..." : "Create account"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex justify-center border-t text-muted-foreground">
        <p className="text-sm">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
