import Link from "next/link";

import { signUpWithPassword } from "@/app/actions/auth";
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

type Props = {
  siteUrl: string;
  error?: string;
  notice?: string;
};

export function SignupForm({ siteUrl, error, notice }: Props) {
  return (
    <Card className="mx-auto w-full max-w-md border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>Create student account</CardTitle>
        <CardDescription>
          Sign up with your school email. You may need to confirm your inbox if your project requires email verification.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={signUpWithPassword} className="grid gap-4">
          <input type="hidden" name="site_url" value={siteUrl} />
          {error ? (
            <p
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          {notice === "confirm_email" ? (
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
          <Button type="submit" size="lg" className="w-full">
            Create account
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
