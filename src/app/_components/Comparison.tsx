// The Generic-AI / BoardEdge comparison, with a heading and a mark over each
// column so the two sides are told apart before a word of the lists is read.
//
// On the trademarks: these are the marks of other companies, used to name what
// BoardEdge is being compared against. That is what a comparison is for, and
// the claims beside them are about capability, not quality — a general chatbot
// genuinely has no access to a CISCE marking scheme. They are drawn in ink
// rather than brand colour, at one size, with no endorsement implied, and the
// footer disclaims affiliation.
//
// OpenAI is named in words instead of drawn. Its mark is absent from the
// icon set this page's paths came from — OpenAI asked to be removed from it —
// and redrawing a mark whose owner has asked not to be redistributed, to put
// it on a page that competes with them, is not a call to make quietly.

import Image from "next/image";
import { Check, X as XIcon } from "lucide-react";
import { sectionLabel } from "@/lib/ui";
import { Reveal } from "@/app/_components/Reveal";

// Icon geometry from Simple Icons (CC0-1.0). The marks themselves remain the
// trademarks of their owners; the licence covers the path data, not the right
// to imply a relationship.
const BRANDS = [
  {
    title: "Claude",
    path: "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z",
  },
  {
    title: "Google Gemini",
    path: "M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81",
  },
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

function BrandMark({ title, path }: { title: string; path: string }) {
  return (
    <span
      className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-background"
      title={title}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-muted-foreground" role="img">
        <title>{title}</title>
        <path d={path} />
      </svg>
    </span>
  );
}

export function Comparison() {
  return (
    <div className="mt-20 grid gap-6 sm:grid-cols-2">
      <Reveal className="rounded-2xl border border-border bg-card/60 p-8">
        <div data-reveal className="flex items-center gap-2">
          {BRANDS.map((b) => (
            <BrandMark key={b.title} {...b} />
          ))}
          <span className="grid h-10 place-items-center rounded-xl border border-border bg-background px-3 text-[11px] font-medium text-muted-foreground">
            ChatGPT
          </span>
        </div>

        <p data-reveal className={`${sectionLabel} mt-5`}>
          Generic AI
        </p>
        <h3 data-reveal className="mt-2 font-display text-2xl leading-snug text-foreground">
          Marks it the way it thinks it should be marked.
        </h3>

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
        <div data-reveal className="flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-accent/30 bg-background">
            <Image src="/logo-icon.png" alt="BoardEdge" width={22} height={22} />
          </span>
        </div>

        <p data-reveal className="mt-5 text-xs font-bold uppercase tracking-wider text-accent">
          BoardEdge
        </p>
        <h3 data-reveal className="mt-2 font-display text-2xl leading-snug text-foreground">
          Marks it the way the scheme says to mark it.
        </h3>

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
  );
}
