// The landing page, as the six acts of handoff §5.
//
// Act 2 — the scroll-scrubbed evaluation, the money moment — lives in its own
// client component. Act 1 deliberately ends on the unmarked answer so Act 2
// has something to mark, and both read the same record.
//
// The page stays a static prerender: no data fetching, every figure below is a
// constant checked against the live corpus at authoring time (2,456 questions,
// each with a marking scheme, six subjects, 2018–2025). Motion is the only
// client-side part, isolated in <Reveal> and <ScoreClimber>.

import Link from "next/link";
import Image from "next/image";
import { Check, X as XIcon } from "lucide-react";
import { btnPrimary, btnSecondary, sectionLabel, numericFigures } from "@/lib/ui";
import { Act2Evaluation } from "@/app/_components/Act2Evaluation";
import { FaqAccordion, type FaqItem } from "@/app/_components/FaqAccordion";
import { HomeLogoLink } from "@/app/_components/HomeLogoLink";
import { Reveal } from "@/app/_components/Reveal";
import { ScoreClimber } from "@/app/_components/ScoreClimber";
import { SHOWCASE, showcaseSentences } from "@/app/_data/showcase";

// Counted against the live questions table at authoring time. Hardcoded rather
// than queried so the page keeps its static prerender — a marketing page should
// not wait on the database to render a headline number. Recount when a subject
// or year is imported.
const CORPUS = {
  questions: 2456,
  subjects: [
    { name: "Geography", count: 506 },
    { name: "Biology", count: 482 },
    { name: "Chemistry", count: 466 },
    { name: "Physics", count: 375 },
    { name: "English Literature", count: 354 },
    { name: "History & Civics", count: 273 },
  ],
  years: "2018–2020, 2023–2025",
};

const GENERIC_AI_POINTS = [
  "Gives a rough estimate, not a real score",
  "No access to official ICSE marking schemes",
  "Generic feedback — not calibrated to your exam board",
  "Can't tell you which specific marking-scheme point you missed",
];

const BOARDEDGE_POINTS = [
  "Awards marks against the exact CISCE marking scheme",
  "Shows every point hit and point missed — mapped to official criteria",
  "Trained on ICSE-specific evaluation standards",
  "Structured feedback: marks, points hit, points missed, conceptual errors, model answer",
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "How does BoardEdge evaluate my answers?",
    answer:
      "You select a subject and a question, write your answer, and BoardEdge scores it against the official ICSE marking criteria for that question — the same standards a real examiner applies. You get a breakdown of marks awarded, points hit, points missed, and specific feedback on where to improve.",
  },
  {
    question: "Which subjects and years are available?",
    answer:
      "Six subjects are live: Geography, Biology, Chemistry, Physics, English Literature, and History & Civics. Past papers from 2018, 2019, 2020, 2023, 2024, and 2025 are available — 2,456 questions in total, each carrying its official marking scheme. More years are being added.",
  },
  {
    question: "Why not just ask ChatGPT or other Generic AI platforms?",
    answer:
      "General AI tools give rough, generic feedback with no access to official marking criteria. BoardEdge evaluates your answer against actual ICSE marking schemes — point by point, the way a real examiner would. The difference shows up immediately in the quality of feedback.",
  },
  {
    question: "Is my data safe? Who sees my answers?",
    answer:
      "Your answers are yours. They're not shared, sold, or visible to anyone else. BoardEdge is built in compliance with India's Digital Personal Data Protection Act, with minors' data privacy as a first-class requirement.",
  },
  {
    question: "Is BoardEdge free?",
    answer:
      "BoardEdge offers a free tier with a limited number of evaluations per week, as of now. Premium tier will cover more evaluations and more features.",
  },
  {
    question: "Can I submit my own questions — not just past papers?",
    answer:
      "Not yet, but it's coming. Right now, BoardEdge works with questions from ICSE past papers.",
  },
];

/** The masthead's issue line — the metadata strip under a newspaper title. */
const ISSUE_LINE = [
  "ICSE · CISCE",
  "Classes 9 & 10",
  `${CORPUS.questions.toLocaleString("en-IN")} past-paper questions`,
  CORPUS.years,
];

export default function Home() {
  const sentences = showcaseSentences();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Without this, a script failure leaves every [data-reveal] element
          hidden and the page blank. Reduced-motion visitors are already safe —
          the hide rule never applies to them. */}
      <noscript>
        <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
      </noscript>

      {/* ─── Nav ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5 lg:px-12">
          <HomeLogoLink>
            <Image src="/logo-lockup.png" alt="BoardEdge" width={101} height={30} priority />
          </HomeLogoLink>

          <nav className="hidden items-center gap-8 text-sm text-muted-foreground sm:flex">
            <a href="#provenance" className="hover:text-foreground">Coverage</a>
            <a href="#trajectory" className="hover:text-foreground">Progress</a>
            <a href="#faq" className="hover:text-foreground">FAQs</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/login" className={`${btnSecondary} h-9 px-3.5 text-xs`}>Log in</Link>
            <Link href="/signup" className={`${btnPrimary} h-9 px-3.5 text-xs`}>Sign up</Link>
          </div>
        </div>
      </header>

      {/* ─── Act 0 · Masthead ────────────────────────────────────────────────
          One oversized Fraunces statement between hairlines, with an issue
          line. No hero image, no dashboard screenshot, no gradient orb (§5). */}
      <Reveal as="header" onLoad slow className="mx-auto max-w-7xl px-6 lg:px-12">
        <div className="border-b border-border pb-3 pt-10">
          <p data-reveal className={sectionLabel}>
            BoardEdge
          </p>
        </div>

        <h1 data-reveal className="display mt-8 max-w-[14ch] text-balance">
          The AI examiner that knows ICSE inside out.
        </h1>

        <p
          data-reveal
          className="mt-8 max-w-[var(--measure)] text-lg leading-relaxed text-muted-foreground"
        >
          Write an answer to a real past-paper question. Get it back marked against the
          official CISCE scheme — point by point, with every mark accounted for.
        </p>

        <div data-reveal className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/signup" className={`${btnPrimary} h-12 px-6 text-sm`}>
            Start marking free →
          </Link>
          <Link href="/login" className={`${btnSecondary} h-12 px-6 text-sm`}>
            Log in
          </Link>
        </div>

        <dl
          data-reveal
          className="mt-12 grid grid-cols-2 gap-px overflow-hidden border-y border-border bg-border sm:grid-cols-4"
        >
          {ISSUE_LINE.map((item) => (
            <div key={item} className="bg-background px-4 py-4">
              <dd className={`text-xs tracking-wide text-muted-foreground ${numericFigures}`}>
                {item}
              </dd>
            </div>
          ))}
        </dl>
      </Reveal>

      {/* ─── Act 1 · The Problem ─────────────────────────────────────────────
          Left column pins, right column scrolls a real answer being written
          (§5). Pure CSS sticky — nothing here needs a ScrollTrigger. */}
      <section className="mx-auto max-w-7xl px-6 py-28 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-16">
          <Reveal className="lg:sticky lg:top-28 lg:self-start">
            <p data-reveal className={sectionLabel}>
              The problem
            </p>
            <h2 data-reveal className="display-section mt-3">
              You can&apos;t revise what you can&apos;t see.
            </h2>
            <p
              data-reveal
              className="mt-6 max-w-[48ch] leading-relaxed text-muted-foreground"
            >
              You write the answer. It comes back with a number on it. Somewhere between
              what you wrote and the mark you got, there are specific points the scheme
              wanted — and nothing tells you which ones you missed.
            </p>
            <p
              data-reveal
              className="mt-4 max-w-[48ch] leading-relaxed text-muted-foreground"
            >
              So the next answer repeats the same gap.
            </p>
          </Reveal>

          <Reveal className="min-w-0">
            <div data-reveal className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className={sectionLabel}>
                {SHOWCASE.board} {SHOWCASE.subject}
              </span>
              <span className={`text-xs text-muted-foreground ${numericFigures}`}>
                {SHOWCASE.year} · Q{SHOWCASE.questionNumber} ·{" "}
                {SHOWCASE.totalMarks} marks
              </span>
            </div>

            <p
              data-reveal
              className="mt-4 border-l-2 border-accent pl-5 text-[17px] font-semibold leading-relaxed text-foreground"
            >
              {SHOWCASE.questionText}
            </p>

            {/* The answer arrives a sentence at a time as the column scrolls —
                the "being written" of §5, without faking a typing cursor. */}
            <div className="mt-10 space-y-5 border-l border-rule pl-5">
              {sentences.map((sentence, i) => (
                <p
                  key={i}
                  data-reveal
                  className="max-w-[var(--measure)] font-display text-[17px] leading-[1.75] text-foreground"
                >
                  {sentence}
                </p>
              ))}
            </div>

            <p data-reveal className="mt-10 text-sm italic text-muted-foreground">
              Three points asked for. Three points written. So how many did it earn?
            </p>
          </Reveal>
        </div>
      </section>

      {/* ─── Act 2 · The Evaluation ──────────────────────────────────────────
          The money moment. Answers the question Act 1 above ends on, using the
          same record: pinned and scrubbed on desktop, tap-advanced below
          768px, complete and static without JavaScript. */}
      <Act2Evaluation />

      {/* ─── Act 3 · Provenance ──────────────────────────────────────────── */}
      <section id="provenance" className="border-y border-border bg-card/30">
        <Reveal className="mx-auto max-w-7xl px-6 py-24 lg:px-12">
          <p data-reveal className={sectionLabel}>
            Provenance
          </p>
          <h2 data-reveal className="display-section mt-3 max-w-[20ch]">
            Marked against the real scheme, not a guess at it.
          </h2>
          <p
            data-reveal
            className="mt-6 max-w-[var(--measure)] leading-relaxed text-muted-foreground"
          >
            Every question in BoardEdge comes from an actual ICSE past paper and carries
            the official CISCE marking scheme alongside it. The grader is bound to that
            scheme — it cites the points the scheme lists, and it is not allowed to award
            marks from outside knowledge.
          </p>

          <dl
            data-reveal
            className="mt-12 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-3"
          >
            {[
              { value: CORPUS.questions.toLocaleString("en-IN"), label: "Past-paper questions" },
              { value: "1:1", label: "Questions to marking schemes" },
              { value: CORPUS.years, label: "Exam years covered" },
            ].map((stat) => (
              <div key={stat.label} className="bg-background px-6 py-8">
                <dt className={`display-section text-foreground ${numericFigures}`}>
                  {stat.value}
                </dt>
                <dd className="mt-2 text-sm text-muted-foreground">{stat.label}</dd>
              </div>
            ))}
          </dl>

          <ul data-reveal className="mt-10 flex flex-wrap gap-x-8 gap-y-3">
            {CORPUS.subjects.map((s) => (
              <li key={s.name} className="flex items-baseline gap-2 text-sm">
                <span className="font-medium text-foreground">{s.name}</span>
                <span className={`text-muted-foreground ${numericFigures}`}>{s.count}</span>
              </li>
            ))}
          </ul>

          {/* The comparison that used to be its own section, folded into
              provenance where the claim it makes is actually evidenced. */}
          <div className="mt-20 grid gap-6 sm:grid-cols-2">
            <Reveal className="rounded-2xl border border-border bg-card/60 p-8">
              <p data-reveal className={sectionLabel}>
                Generic AI
              </p>
              <ul className="mt-6 space-y-4">
                {GENERIC_AI_POINTS.map((point) => (
                  <li
                    key={point}
                    data-reveal
                    className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground"
                  >
                    <XIcon size={17} className="mt-0.5 shrink-0" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal className="rounded-2xl border border-accent/40 bg-accent-subtle p-8">
              <p data-reveal className="text-xs font-bold uppercase tracking-wider text-accent">
                BoardEdge
              </p>
              <ul className="mt-6 space-y-4">
                {BOARDEDGE_POINTS.map((point) => (
                  <li
                    key={point}
                    data-reveal
                    className="flex items-start gap-3 text-sm leading-relaxed text-foreground/90"
                  >
                    <Check size={17} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </Reveal>
      </section>

      {/* ─── Act 4 · Trajectory ──────────────────────────────────────────── */}
      <section id="trajectory" className="mx-auto max-w-7xl px-6 py-24 lg:px-12">
        <Reveal className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <p data-reveal className={sectionLabel}>
              Trajectory
            </p>
            <h2 data-reveal className="display-section mt-3 max-w-[18ch]">
              The same question, until it stops costing you marks.
            </h2>
            <p
              data-reveal
              className="mt-6 max-w-[var(--measure)] leading-relaxed text-muted-foreground"
            >
              Every attempt is kept and grouped by question, so a second or third go at
              the same one sits next to the first with its score trail intact. The point
              that kept getting missed is the one to revise.
            </p>
          </div>

          <div data-reveal className="lg:justify-self-end">
            <ScoreClimber />
          </div>
        </Reveal>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────────────────────── */}
      <section id="faq" className="border-t border-border">
        <Reveal className="mx-auto max-w-3xl px-6 py-24">
          <p data-reveal className={sectionLabel}>
            FAQs
          </p>
          <h2 data-reveal className="display-section mt-3">
            Common questions
          </h2>
          <div data-reveal className="mt-10">
            <FaqAccordion items={FAQ_ITEMS} />
          </div>
        </Reveal>
      </section>

      {/* ─── Act 5 · Close ───────────────────────────────────────────────── */}
      <section className="border-t border-border bg-card/30">
        <Reveal className="mx-auto max-w-7xl px-6 py-28 text-center lg:px-12">
          <h2 data-reveal className="display mx-auto max-w-[16ch] text-balance">
            Find out what you actually lost marks on.
          </h2>
          <div data-reveal className="mt-10 flex justify-center">
            <Link href="/signup" className={`${btnPrimary} h-12 px-8 text-sm`}>
              Start marking free →
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ─── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          {/* Icon only here, not the lockup — the adjacent text is the
              copyright line, and "BoardEdge © 2026 BoardEdge" would repeat
              the wordmark right next to itself. */}
          <HomeLogoLink className="flex items-center gap-2">
            <Image src="/logo-icon.png" alt="BoardEdge" width={24} height={24} />
            <span className={numericFigures + " text-xs text-muted-foreground"}>
              © {new Date().getFullYear()} BoardEdge
            </span>
          </HomeLogoLink>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="opacity-50" title="Coming soon">[PLACEHOLDER — support email]</span>
            <span className="opacity-50" aria-disabled title="Coming soon">Instagram</span>
            <span className="opacity-50" aria-disabled title="Coming soon">LinkedIn</span>
            <span className="opacity-50" title="Coming soon">Privacy Policy</span>
            <span className="opacity-50" title="Coming soon">Terms &amp; Conditions</span>
            <a href="#faq" className="hover:text-foreground">FAQs</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
