import Link from "next/link";
import Image from "next/image";
import {
  Dna,
  FlaskConical,
  Atom,
  Globe as GlobeIcon,
  FileText,
  Target,
  TrendingUp,
  Check,
  X as XIcon,
  GraduationCap,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { btnPrimary, btnSecondary, sectionLabel, numericMono } from "@/lib/ui";
import { FaqAccordion, type FaqItem } from "@/app/_components/FaqAccordion";

const SUBJECT_PILLS = [
  { name: "Biology", icon: Dna, className: "left-[2%] top-[10%]" },
  { name: "Chemistry", icon: FlaskConical, className: "left-[6%] top-[68%]" },
  { name: "Physics", icon: Atom, className: "right-[3%] top-[8%]" },
  { name: "Geography", icon: GlobeIcon, className: "right-[0%] top-[64%]" },
];

const FEATURE_CARDS = [
  {
    icon: FileText,
    title: "Practice on Real Papers",
    subtext: "Choose a past paper question. Write your answer. See exactly where you scored.",
    glow: "radial-gradient(circle at 15% 100%, #E8642Aaa, transparent 70%)",
    iconBg: "#E8642A",
  },
  {
    icon: Target,
    title: "Point-by-Point Scoring",
    subtext: "See exactly which marking-scheme points you hit and which you missed.",
    glow: "radial-gradient(circle at 15% 100%, #3B82F6aa, transparent 70%)",
    iconBg: "#3B82F6",
  },
  {
    icon: TrendingUp,
    title: "Track Your Progress",
    subtext: "See your scores, accuracy trends, and weak topics — all in one place.",
    glow: "radial-gradient(circle at 15% 100%, #3DDC84aa, transparent 70%)",
    iconBg: "#3DDC84",
  },
];

const PROOF_STRIP_ITEMS = [
  { icon: GraduationCap, label: "Built for ICSE" },
  { icon: Sparkles, label: "Powered by AI" },
  { icon: ShieldCheck, label: "Verified against CISCE marking schemes" },
];

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
      "Biology, Chemistry, Physics, and Geography are live. Past papers from 2018, 2019, 2020, 2024, and 2025 are currently available. More subjects and years are being added.",
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
      "BoardEdge offers a free tier with a limited number of evaluations per month, as of now. Premium tier will cover more evaluations and more features.",
  },
  {
    question: "Can I submit my own questions — not just past papers?",
    answer:
      "Not yet, but it's coming. Right now, BoardEdge works with questions from ICSE past papers.",
  },
];

export default function Home() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Sticky nav */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5 lg:px-12">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/be-logo1.png" alt="BoardEdge" width={28} height={28} />
            <span className="text-sm font-semibold tracking-tight text-foreground">BoardEdge</span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm text-muted-foreground sm:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#ai-differentiation" className="hover:text-foreground">AI</a>
            <a href="#faq" className="hover:text-foreground">FAQs</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/login" className={`${btnSecondary} h-9 px-3.5 text-xs`}>Log in</Link>
            <Link href="/signup" className={`${btnPrimary} h-9 px-3.5 text-xs`}>Sign up</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(var(--border) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(circle_at_50%_0%,var(--glow-purple),transparent_65%)] opacity-35"
        />

        <div className="relative mx-auto max-w-7xl px-6 pb-24 pt-20 sm:pt-28 lg:px-12">
          {SUBJECT_PILLS.map(({ name, icon: Icon, className }) => (
            <div
              key={name}
              className={`absolute hidden items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground shadow-sm lg:flex ${className}`}
            >
              <Icon size={14} className="text-muted-foreground" />
              {name}
            </div>
          ))}

          <div className="relative mx-auto max-w-2xl text-center">
            <p className={`${sectionLabel} justify-center`}>BoardEdge</p>
            <h1 className="mx-auto mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              The AI examiner that knows ICSE inside out.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
              Paste your answer, pick your question, and get examiner-level feedback in seconds.
            </p>
            <div className="mt-8 flex justify-center">
              <Link href="/signup" className={`${btnPrimary} h-12 px-6 text-sm`}>
                Get Started Free →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Proof strip */}
      <section className="border-y border-border bg-card/40">
        <div className="mx-auto grid max-w-5xl grid-cols-1 divide-y divide-border px-6 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {PROOF_STRIP_ITEMS.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center justify-center gap-2.5 py-6 sm:py-8">
              <Icon size={18} className="shrink-0 text-accent" />
              <span className="text-sm font-medium text-foreground">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Feature grid */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-20 lg:px-12">
        <div className="grid gap-5 sm:grid-cols-3">
          {FEATURE_CARDS.map(({ icon: Icon, title, subtext, glow, iconBg }) => (
            <div
              key={title}
              className="relative overflow-hidden rounded-2xl border border-border bg-card p-6"
            >
              <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: glow }} />
              <div className="relative">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-2xl text-white"
                  style={{ backgroundColor: iconBg, boxShadow: `0 0 24px 0 ${iconBg}80` }}
                >
                  <Icon size={20} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{subtext}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* AI differentiation */}
      <section id="ai-differentiation" className="border-t border-border bg-card/30">
        <div className="mx-auto flex min-h-[85vh] max-w-6xl flex-col justify-center px-6 py-20 lg:px-12">
          <div className="text-center">
            <p className={`${sectionLabel} justify-center`}>Why BoardEdge</p>
            <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              BoardEdge vs. Generic AI — What&apos;s the difference?
            </h2>
          </div>

          <div className="relative mt-16 grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card/60 p-8 opacity-70">
              <p className={sectionLabel}>Generic AI / ChatGPT</p>
              <ul className="mt-6 space-y-4">
                {GENERIC_AI_POINTS.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    <XIcon size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-accent/40 bg-accent-subtle p-8">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{ backgroundImage: "radial-gradient(circle at 85% 0%, var(--glow-purple), transparent 60%)" }}
              />
              <div className="relative">
                <p className="text-xs font-bold uppercase tracking-wider text-accent">BoardEdge</p>
                <ul className="mt-6 space-y-4">
                  {BOARDEDGE_POINTS.map((point) => (
                    <li key={point} className="flex items-start gap-3 text-sm leading-relaxed text-foreground/90 sm:text-base">
                      <Check size={18} className="mt-0.5 shrink-0 text-accent" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl px-6 py-20">
        <p className={`${sectionLabel} text-center`}>FAQs</p>
        <h2 className="mt-2 text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Common questions
        </h2>
        <div className="mt-10">
          <FaqAccordion items={FAQ_ITEMS} />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Image src="/be-logo1.png" alt="BoardEdge" width={24} height={24} />
            <span className={numericMono + " text-xs text-muted-foreground"}>
              © {new Date().getFullYear()} BoardEdge
            </span>
          </div>

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
