import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SiteHeader } from "@/components/site-header";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader signedIn={signedIn} />
      <div className="flex flex-1 flex-col bg-gradient-to-b from-muted/50 via-background to-background">
        <section className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-2xl space-y-4">
            <p className="text-sm font-medium text-muted-foreground">Supabase + Next.js App Router</p>
            <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
              Student authentication, done properly on the server.
            </h1>
            <p className="text-lg text-muted-foreground">
              Email and password auth with `@supabase/ssr`, cookie-backed sessions, and a protected dashboard after login.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              {signedIn ? (
                <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
                  Go to dashboard
                </Link>
              ) : (
                <>
                  <Link href="/signup" className={buttonVariants({ size: "lg" })}>
                    Create account
                  </Link>
                  <Link
                    href="/login"
                    className={buttonVariants({ variant: "outline", size: "lg" })}
                  >
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>SSR-ready</CardTitle>
                <CardDescription>Server Components use the same cookie session as the browser.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                The root `proxy.ts` refreshes tokens so pages can call `getClaims()` safely.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Protected routes</CardTitle>
                <CardDescription>Dashboard layouts verify the JWT before rendering.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Unauthenticated visitors are redirected to login with a `next` return path.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>shadcn/ui</CardTitle>
                <CardDescription>Forms and cards built with your Tailwind v4 theme.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Extend the UI by running `npx shadcn@latest add …` as your product grows.
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}
