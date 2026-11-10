// app/parent-reports/page.tsx
//
// Where a parent turns weekly summaries on (from the invite email) or off
// (from any summary). Public: the parent has no BoardEdge account, so the
// signed link is the proof. Not under any PROTECTED_PREFIXES entry.
//
// Opening the page changes nothing — email scanners follow links, and a GET
// that opted in would sign parents up who never asked. The button does it.

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { parentReportsLive, resolveReportLink } from "@/lib/parent-report/service";
import { PendingSubmit } from "@/app/_components/states/PendingSubmit";
import { btnPrimary, sectionLabel } from "@/lib/ui";
import { changeParentReports } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Weekly summaries · BoardEdge",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const INCLUDED = [
  "How many answers they practised, and their marks",
  "Marks they won back by rewriting weaker answers",
  "The kinds of mistakes costing them marks, and their weakest chapter",
];

export default async function ParentReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const token = typeof params.t === "string" ? params.t : "";
  const purpose = params.a === "on" ? "on" : "off";
  const status = typeof params.status === "string" ? params.status : null;
  const link = token ? await resolveReportLink(purpose, token) : null;
  const who = link?.firstName ?? "your child";
  const whose = link?.firstName ? `${link.firstName}’s` : "your child’s";

  let heading: string;
  let body: React.ReactNode;
  let showButton = false;
  let showIncluded = false;

  if (status === "invalid" || !link) {
    heading = "This link isn’t valid";
    body =
      "It may have been cut short (some email apps break long links), or the parent email on the account has changed since it was sent. Use the link in the most recent email from BoardEdge.";
  } else if (status === "done") {
    heading = purpose === "on" ? "Weekly summaries are on" : "Weekly summaries are off";
    body =
      purpose === "on"
        ? `You’ll get a short summary of ${whose} practice each Monday at ${link.parentEmailMasked}. Every summary has a link to stop them.`
        : `We won’t send you any more summaries about ${who}. This doesn’t affect their account or your consent.`;
  } else if (status === "unavailable" || (purpose === "on" && (!parentReportsLive() || link.state === "unavailable"))) {
    heading = "Weekly summaries aren’t available yet";
    body = "Nothing has been turned on. You can use the link in the invite email again later.";
  } else if (purpose === "on" && link.state === "on") {
    heading = "Weekly summaries are already on";
    body = `They go to ${link.parentEmailMasked} each Monday. Every summary has a link to stop them.`;
  } else if (purpose === "off" && link.state !== "on") {
    heading = "Weekly summaries are off";
    body = `You’re not receiving summaries about ${who}.`;
  } else if (purpose === "on") {
    heading = `Get a weekly summary of ${whose} practice?`;
    body = `${link.firstName ?? "Your child"} asked us to send you this. It goes to ${link.parentEmailMasked} each Monday and covers:`;
    showButton = true;
    showIncluded = true;
  } else {
    heading = "Stop weekly summaries?";
    body = `You’ll stop receiving the Monday summary about ${who}. This doesn’t affect their account or your consent.`;
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
        <p className={sectionLabel}>For parents and guardians</p>
        <h1 className="display-section mt-3 text-balance">{heading}</h1>
        <p className="mt-5 max-w-[var(--measure)] text-[17px] leading-relaxed text-muted-foreground">{body}</p>

        {showIncluded ? (
          <>
            <ul className="mt-4 max-w-[var(--measure)] list-disc space-y-1.5 pl-5 text-[16px] leading-relaxed text-foreground">
              {INCLUDED.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <p className="mt-4 max-w-[var(--measure)] text-sm text-muted-foreground">
              It never includes the answers themselves, the examiner&rsquo;s feedback or model answers. See our{" "}
              <Link href="/privacy" className="text-foreground underline underline-offset-2">
                privacy policy
              </Link>
              .
            </p>
          </>
        ) : null}

        {status === "error" ? (
          <p role="alert" className="mt-6 text-sm text-accent">
            Something went wrong on our side. Please try again in a moment.
          </p>
        ) : null}

        {showButton ? (
          <form action={changeParentReports} className="mt-8">
            <input type="hidden" name="t" value={token} />
            <input type="hidden" name="a" value={purpose} />
            <PendingSubmit pendingLabel="Saving…" className={`${btnPrimary} h-11 px-6`}>
              {purpose === "on" ? "Turn on weekly summaries" : "Stop weekly summaries"}
            </PendingSubmit>
          </form>
        ) : null}
      </main>
    </div>
  );
}
