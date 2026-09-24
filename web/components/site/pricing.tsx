import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PLAN_LIMITS } from "@/lib/plans";

const FEATURES = [
  {
    label: "Saved diagrams",
    free: `Up to ${PLAN_LIMITS.free.diagrams}`,
    premium: `Up to ${PLAN_LIMITS.premium.diagrams}`,
  },
  {
    label: "Code to diagram",
    free: `${PLAN_LIMITS.free.generations} per day`,
    premium: "Unlimited",
  },
  {
    label: "AI generation",
    free: "Limited daily use",
    premium: `${PLAN_LIMITS.premium.aiTokens / PLAN_LIMITS.free.aiTokens}× more`,
  },
  {
    label: "Export options",
    free: "Limited options",
    premium: "All export options",
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-16 border-b-2 border-edge bg-bone">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="mx-auto max-w-2xl text-center text-balance font-mono text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
          Start free. Make room for more.
        </h2>
        <p className="mx-auto mt-3 max-w-[54ch] text-center text-[14.5px] leading-relaxed text-ink-soft">
          The same editable canvas on both plans. Choose how much you want to make and keep.
        </p>

        <div className="mx-auto mt-14 grid max-w-[700px] gap-5 md:grid-cols-2 md:gap-6">
          <div className="relative flex pt-24 sm:pt-28">
            <article className="pricing-card slab relative z-10 flex w-full flex-col overflow-hidden bg-white p-5 sm:p-6">
              <svg aria-hidden="true" focusable="false" viewBox="0 0 440 540" preserveAspectRatio="xMidYMid slice" className="pricing-art pointer-events-none absolute inset-0 h-full w-full text-black/[0.035]">
                <circle cx="370" cy="110" r="115" fill="currentColor" />
                <ellipse cx="365" cy="420" rx="135" ry="50" fill="currentColor" />
              </svg>
              <div className="relative z-10 flex h-full flex-col">
                <span className="w-fit border-2 border-edge bg-white px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">
                  Free
                </span>
                <div className="mt-5 flex items-baseline gap-2 font-mono text-ink">
                  <span className="pricing-price inline-block text-5xl font-semibold tracking-[-0.06em]">$0</span>
                </div>
                <p className="mt-2 min-h-10 text-[13px] leading-relaxed text-ink-soft">
                  Everything you need to start drawing with code.
                </p>
                <ul className="mt-5 flex-1 divide-y-2 divide-edge/10 border-y-2 border-edge/10">
                  {FEATURES.map((feature) => (
                    <li key={feature.label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2.5 text-[12.5px]">
                      <span className="text-ink-soft">{feature.label}</span>
                      <span className="font-medium text-ink">{feature.free}</span>
                    </li>
                  ))}
                </ul>
                <button type="button" disabled className="mt-5 w-full cursor-not-allowed border-2 border-edge bg-white px-5 py-2.5 font-mono text-[12px] font-semibold uppercase tracking-[0.06em] text-ink">
                  Current plan
                </button>
              </div>
            </article>
          </div>

          <div className="relative isolate flex pt-24 sm:pt-28">
            <Image
              src="/mascot/premium-cutout.png"
              alt=""
              width={1000}
              height={1000}
              sizes="(min-width: 640px) 160px, 144px"
              className="pointer-events-none absolute -left-1 -top-10 z-0 h-36 w-36 object-contain sm:h-40 sm:w-40"
            />
            <article className="pricing-card slab relative z-10 flex w-full flex-col overflow-hidden bg-[#11110f] p-5 text-white sm:p-6">
              <svg aria-hidden="true" focusable="false" viewBox="0 0 440 540" preserveAspectRatio="xMidYMid slice" className="pricing-art pointer-events-none absolute inset-0 h-full w-full">
                <defs>
                  <linearGradient id="pricing-gold" x1="0" y1="0" x2="1" y2="1">
                    <stop stopColor="#FBE8A7" />
                    <stop offset="0.55" stopColor="#BA8431" />
                    <stop offset="1" stopColor="#7A4C18" />
                  </linearGradient>
                </defs>
                <circle cx="390" cy="110" r="150" fill="url(#pricing-gold)" opacity="0.2" />
                <circle cx="390" cy="110" r="113" fill="none" stroke="url(#pricing-gold)" strokeWidth="2" opacity="0.5" />
                <ellipse cx="340" cy="480" rx="155" ry="70" fill="url(#pricing-gold)" opacity="0.13" />
              </svg>
              <div className="relative z-10 flex h-full flex-col">
                <span className="w-fit border-2 border-[#D6AE62] bg-[#D6AE62]/10 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#F2D89A]">
                  Premium
                </span>
                <div className="mt-5 flex items-baseline gap-2 font-mono">
                  <span className="pricing-price inline-block bg-gradient-to-br from-[#FFF2C8] via-[#E8BC65] to-[#A86D2B] bg-clip-text text-5xl font-semibold tracking-[-0.06em] text-transparent">$5</span>
                  <span className="text-[13px] text-white/65">/month</span>
                </div>
                <p className="mt-2 min-h-10 text-[13px] leading-relaxed text-white/75">
                  More room for every idea, from first draft to final export.
                </p>
                <ul className="mt-5 flex-1 divide-y-2 divide-[#D6AE62]/25 border-y-2 border-[#D6AE62]/25">
                  {FEATURES.map((feature) => (
                    <li key={feature.label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2.5 text-[12.5px]">
                      <span className="text-white/60">{feature.label}</span>
                      <span className="font-medium text-[#F2D89A]">{feature.premium}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/profile#plan" className="mt-5 flex w-full items-center justify-center gap-2 border-2 border-[#F2D89A] bg-gradient-to-r from-[#F8E2A1] via-[#D9AA53] to-[#BB8339] px-5 py-2.5 font-mono text-[12px] font-semibold uppercase tracking-[0.06em] text-[#11110f] transition-colors hover:from-[#FFF2C8] hover:to-[#D9AA53]">
                  Get Premium <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </article>
          </div>
        </div>

        <p className="mt-8 text-center font-mono text-[11px] text-ink-soft">
          Premium is a one-time payment for 30 days. No automatic renewal.
        </p>
      </div>
    </section>
  );
}
