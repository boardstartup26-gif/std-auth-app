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
  nextPath: string;
  error?: string;
};

export function LoginForm({ nextPath, error }: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<string | null>(error ?? null);

  return (
    <Card className="mx-auto w-full max-w-md border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>Student sign in</CardTitle>
        <CardDescription>
          Use the email and password for your student account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setMessage(null);

            const form = new FormData(e.currentTarget);
            const email = String(form.get("email") ?? "").trim();
            const password = String(form.get("password") ?? "");

            startTransition(async () => {
              try {
                const supabase = createBrowserClient();
                const { error } = await supabase.auth.signInWithPassword({
                  email,
                  password,
                });

                if (error) {
                  setMessage(error.message);
                  return;
                }

                router.push(nextPath);
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
              autoComplete="current-password"
              required
              minLength={6}
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex justify-center border-t text-muted-foreground">
        <p className="text-sm">
          New here?{" "}
          <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
