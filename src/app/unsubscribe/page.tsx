// app/unsubscribe/page.tsx
//
// Where the "Stop reminder emails" link in a reminder email lands. Public: it
// works without a login, because the link is its own proof (a signed token,
// see src/lib/email/reminder-preferences.ts).
//
// Opening the page changes nothing. Email scanners follow links; a GET that
// unsubscribed would switch reminders off for students who never asked. The
// button below is what does it.

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { verifyUnsubscribeToken } from "@/lib/email/reminder-preferences";
import { btnPrimary, sectionLabel } from "@/lib/ui";
import { confirmUnsubscribe } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reminder emails · BoardEdge",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const token = typeof params.t === "string" ? params.t : "";
  const status = typeof params.status === "string" ? params.status : null;
  const valid = token ? verifyUnsubscribeToken(token) !== null : false;

  let heading: string;
  let body: React.ReactNode;
  let showButton = false;

  if (status === "done") {
    heading = "Reminder emails are off";
    body = (
      <>
        We won&rsquo;t email you about answers to try again. You&rsquo;ll still see reminders in
        the bell inside BoardEdge, and you can turn emails back on from your{" "}
        <Link href="/account" className="text-foreground underline underline-offset-2">
          account page
        </Link>
        .
      </>
    );
  } else if (status === "invalid" || !valid) {
    heading = "This link isn’t valid";
    body = (
      <>
        It may have been cut short: some email apps break long links across lines. You can also
        turn reminder emails off from your{" "}
        <Link href="/account" className="text-foreground underline underline-offset-2">
          account page
        </Link>
        .
      </>
    );
  } else {
    heading = "Stop reminder emails?";
    body =
      "These are the emails that tell you when an answer you dropped marks on is ready for another go. Turning them off doesn't affect your account, your results, or the reminders inside BoardEdge.";
    showButton = true;
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center px-6 py-3.5">
          <Link href="/">
            <Image src="/logo-lockup.png" alt="BoardEdge" width={101} height={30} priority />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-24 pt-12 sm:pt-16">
        <p className={sectionLabel}>Email preferences</p>
        <h1 className="display-section mt-3 text-balance">{heading}</h1>
        <p className="mt-5 max-w-[var(--measure)] text-[17px] leading-relaxed text-muted-foreground">{body}</p>

        {status === "error" ? (
          <p role="alert" className="mt-6 text-sm text-accent">
            Something went wrong on our side. Please try again in a moment.
          </p>
        ) : null}

        {showButton ? (
          <form action={confirmUnsubscribe} className="mt-8">
            <input type="hidden" name="t" value={token} />
            <button type="submit" className={`${btnPrimary} h-11 px-6`}>
              Stop reminder emails
            </button>
          </form>
        ) : null}
      </main>
    </div>
  );
}
