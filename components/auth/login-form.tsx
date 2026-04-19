import Link from "next/link";

import { signInWithPassword } from "@/app/actions/auth";
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
  nextPath: string;
  error?: string;
};

export function LoginForm({ nextPath, error }: Props) {
  return (
    <Card className="mx-auto w-full max-w-md border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle>Student sign in</CardTitle>
        <CardDescription>
          Use the email and password for your student account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={signInWithPassword} className="grid gap-4">
          <input type="hidden" name="next" value={nextPath} />
          {error ? (
            <p
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
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
          <Button type="submit" size="lg" className="w-full">
            Sign in
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
