// "Choose a subject": one tile per subject, each opening /evaluate with that
// subject already picked (the page reads ?subject= and validates it against
// SUBJECTS). "All subjects" opens the unfiltered picker.

import Link from "next/link";
import { ArrowRight, Atom, BookOpen, FlaskConical, Globe, IndianRupee, Landmark, type LucideIcon, PenLine, Recycle, Sprout } from "lucide-react";
import { SUBJECTS } from "@/app/(protected)/evaluate/_lib/question";
import { dashCard, dashHeading, dashLink, tileInteractive } from "../_lib/styles";

type Subject = (typeof SUBJECTS)[number];

// Display order follows the reference layout (sciences first).
const ORDER: { subject: Subject; icon: LucideIcon }[] = [
  { subject: "Physics", icon: Atom },
  { subject: "Chemistry", icon: FlaskConical },
  { subject: "Biology", icon: Sprout },
  { subject: "Geography", icon: Globe },
  { subject: "History & Civics", icon: Landmark },
  { subject: "Economics", icon: IndianRupee },
  { subject: "Environmental Science", icon: Recycle },
  { subject: "English Language", icon: PenLine },
  { subject: "English Literature", icon: BookOpen },
];

export function SubjectGrid() {
  return (
    <section className="mt-10" aria-labelledby="choose-subject">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="choose-subject" className={dashHeading}>
          Choose a subject
        </h2>
        <Link href="/evaluate" className={dashLink}>
          All subjects <ArrowRight size={13} strokeWidth={2} aria-hidden />
        </Link>
      </div>
      {/* Nine tiles: 3x3 on phones, 5+4 on small screens, one row from lg. */}
      <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
        {ORDER.map(({ subject, icon: Icon }) => (
          <li key={subject}>
            <Link
              href={`/evaluate?subject=${encodeURIComponent(subject)}`}
              className={`${dashCard} ${tileInteractive} flex h-full min-h-[5.75rem] flex-col items-center justify-center gap-2 px-2 py-3.5 text-center`}
            >
              <Icon size={24} strokeWidth={1.5} aria-hidden className="text-accent" />
              <span className="text-[12.5px] font-medium leading-tight text-foreground">{subject}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
