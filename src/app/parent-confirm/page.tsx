// app/parent-confirm/page.tsx
//
// Where a parent/guardian lands from the consent email. Public (listed in
// middleware's PUBLIC_PATHS) — the parent has no BoardEdge account.
//
// GET only inspects the token and explains what they are agreeing to; it never
// changes state except to mark a genuinely expired link as expired. Consent is
// given by the POST in ConfirmForm, which re-verifies the token server-side.

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { inspectConsentToken } from "@/lib/parent-consent/service";
import { GRIEVANCE_EMAIL } from "@/lib/parent-consent/constants";
import { sectionLabel } from "@/lib/ui";
import { ConfirmForm } from "./_components/ConfirmForm";
import { ConsentOutcome } from "./_components/ConsentOutcome";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm parental consent · BoardEdge",
  description: "Confirm consent for your child's BoardEdge account.",
  // The URL carries a live token: keep it out of search indexes and out of
  // the Referer header of any link followed from this page.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ParentConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const inspection = token ? await inspectConsentToken(token) : ({ state: "invalid" } as const);

  const childName = inspection.state === "ready" ? inspection.studentFirstName : null;
  const child = childName ?? "your child";

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
        <p className={sectionLabel}>Parent or guardian consent</p>
        <h1 className="display-section mt-3 text-balance">
          {inspection.state === "ready"
            ? `Confirm consent for ${childName ?? "your child"}'s account`
            : "Parent or guardian consent"}
        </h1>

        {inspection.state !== "ready" ? (
          <div className="mt-10">
            <ConsentOutcome state={inspection.state} />
          </div>
        ) : (
          <div className="mt-8 max-w-[var(--measure)] space-y-8 text-[17px] leading-relaxed">
            <p className="text-muted-foreground">
              {childName ? `${childName} has` : "Your child has"} signed up for BoardEdge and gave
              {inspection.parentEmailMasked ? ` ${inspection.parentEmailMasked}` : " your email"} as
              their parent or guardian. Please read this short summary before you confirm.
            </p>

            <section>
              <h2 className="text-lg font-semibold tracking-tight">What BoardEdge is</h2>
              <p className="mt-2">
                An online practice tool for ICSE Class 9 and 10 students. Students answer real past-paper
                questions and get marks and feedback checked against the official marking scheme.
                There are no ads and it is currently free.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold tracking-tight">What data of {child} we process</h2>
              <ul className="mt-2 list-disc space-y-1.5 pl-6 marker:text-muted-foreground">
                <li>Name and email address, to run their account.</li>
                <li>The answers they submit, and the marks and feedback for each.</li>
                <li>How many evaluations they use, to apply the free weekly limit.</li>
                <li>Basic usage information (pages visited, whether an evaluation succeeded) to improve the service.</li>
                <li>Your email address and the time you confirmed, as a record of your consent.</li>
              </ul>
              <p className="mt-3">
                Answers to written questions are sent to our AI provider, Anthropic, to be graded — without
                {` ${child}'s`} name or email attached. We don&apos;t sell data, show advertising, or use
                answers to train AI models. Full details are in our{" "}
                <Link href="/privacy" className="text-accent underline underline-offset-2">Privacy Policy</Link>.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold tracking-tight">You can withdraw at any time</h2>
              <p className="mt-2">
                Email{" "}
                <a href={`mailto:${GRIEVANCE_EMAIL}`} className="text-accent underline underline-offset-2">
                  {GRIEVANCE_EMAIL}
                </a>{" "}
                from this address to withdraw consent, see the data we hold, or have the account deleted.
                Withdrawing pauses grading straight away.
              </p>
            </section>

            <div className="border-t border-border pt-8">
              <ConfirmForm token={token} />
              <p className="mt-4 text-sm text-muted-foreground">
                Not your child, or don&apos;t agree? Just close this page — nothing will be graded.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
