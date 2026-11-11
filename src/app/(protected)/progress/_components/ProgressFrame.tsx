// The frame every progress view shares: eyebrow, Fraunces title, italic
// subtitle, one restrained sketch on the right, then the section tabs.
// Server component.

import { dashEyebrow } from "@/app/(protected)/dashboard/_lib/styles";
import { ProgressNav } from "./ProgressNav";

export const progressShell = "mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 sm:py-10";

export function ProgressFrame({
  eyebrow,
  title,
  subtitle,
  art,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle: string;
  art?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={progressShell}>
      <header className="flex items-start justify-between gap-6">
        <div className="min-w-0 max-w-xl">
          <p className={dashEyebrow}>{eyebrow}</p>
          <h1 className="mt-2.5 font-display text-[2rem] font-semibold leading-[1.08] tracking-[-0.02em] text-foreground text-balance sm:text-[2.6rem]">
            {title}
          </h1>
          <p className="mt-2.5 max-w-md font-display text-[1.05rem] italic leading-snug text-foreground/75">{subtitle}</p>
        </div>
        {art ? <div className="-mt-1 hidden w-40 shrink-0 text-accent/55 sm:block lg:w-48">{art}</div> : null}
      </header>
      <ProgressNav />
      <div className="mt-7">{children}</div>
    </div>
  );
}
