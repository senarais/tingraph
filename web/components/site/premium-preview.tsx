"use client";

import Link from "next/link";
import { useId, useRef } from "react";
import { ArrowRight, Download, Layers, Sparkles, X, Zap } from "lucide-react";
import { PLAN_LIMITS } from "@/lib/plans";

const BENEFITS = [
  {
    icon: Layers,
    title: `Save up to ${PLAN_LIMITS.premium.diagrams} diagrams`,
    body: "Keep private diagrams with their source, images and every canvas edit. Reopen a project and pick up where you left off.",
    comparison: `Free includes ${PLAN_LIMITS.free.diagrams} saved diagrams.`,
  },
  {
    icon: Zap,
    title: "Unlimited code-to-diagram generation",
    body: "Generate new drafts and refine your source without a daily generation cap. The canvas stays editable after every draft.",
    comparison: `Free includes ${PLAN_LIMITS.free.generations} generations per 24 hours.`,
  },
  {
    icon: Sparkles,
    title: `${PLAN_LIMITS.premium.aiTokens.toLocaleString("en-US")} AI tokens per 24 hours`,
    body: "Ask Tingraph AI to draft diagram source or help revise it. Review the answer and generate when you are ready.",
    comparison: `${PLAN_LIMITS.premium.aiTokens / PLAN_LIMITS.free.aiTokens}× the Free plan's AI allowance.`,
  },
  {
    icon: Download,
    title: "All export options",
    body: "Export PNG, JPG, SVG or PDF. Preview the result and choose format, scale, padding and background to fit your document.",
    comparison: "Free includes limited export options.",
  },
];

export default function PremiumPreview() {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-controls={id}
        onClick={() => {
          const node = dialog.current;
          if (!node) return;
          node.showModal();
          node.scrollTop = 0;
        }}
        className="premium-nav slab-tight press flex min-h-10 items-center whitespace-nowrap px-2 font-mono text-[11px] font-semibold text-[#f2d89a] sm:px-3 sm:text-[12px]"
      >
        <span aria-hidden="true" className="mr-1.5 text-[15px] leading-none">✦</span>
        <span className="sm:hidden">Premium</span>
        <span className="hidden sm:inline">Go Premium</span>
      </button>

      <dialog
        ref={dialog}
        id={id}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="premium-dialog m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100vw_-_2rem)] max-w-3xl overflow-y-auto overscroll-contain border-2 border-edge bg-bone p-0 text-ink shadow-[6px_6px_0_#000] backdrop:bg-edge/65 backdrop:backdrop-blur-sm"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[#d6ae62]/30 bg-[#11110f] px-5 py-3 text-[#f2d89a] sm:px-8">
          <span className="flex items-center gap-2 font-mono text-[12px] font-semibold"><Sparkles size={15} aria-hidden="true" /> Tingraph Premium</span>
          <button type="button" onClick={() => dialog.current?.close()} aria-label="Close Premium preview" className="grid size-9 shrink-0 place-items-center border border-white/25 text-white transition-colors hover:border-[#f2d89a] hover:bg-white/10">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <section className="premium-hero px-5 py-8 text-white sm:px-8 sm:py-10">
          <div className="grid gap-7 sm:grid-cols-[1fr_auto] sm:items-start">
            <div>
              <h2 id={`${id}-title`} className="max-w-[19ch] text-balance font-mono text-3xl font-semibold leading-tight tracking-[-0.05em] sm:text-4xl">More room for your best ideas.</h2>
              <p id={`${id}-description`} className="mt-4 max-w-[48ch] text-[14px] leading-relaxed text-white/75">Make more drafts, keep more projects and give every diagram the finish it deserves.</p>
            </div>
            <div className="font-mono">
              <span className="bg-gradient-to-br from-[#fff2c8] via-[#e8bc65] to-[#a86d2b] bg-clip-text text-5xl font-semibold tracking-[-0.06em] text-transparent">$5</span>
              <p className="mt-1 text-[12px] text-[#f2d89a]">for 30 days</p>
            </div>
          </div>
          <Link href="/checkout" prefetch={false} className="premium-cta mt-7 inline-flex min-h-12 items-center justify-center gap-3 border-2 border-[#f2d89a] px-5 font-mono text-[13px] font-semibold text-[#11110f]">
            Get Premium <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <p className="mt-3 text-[12px] leading-relaxed text-white/65">One-time payment. No automatic renewal. Applicable taxes and processing fees are shown at checkout.</p>
        </section>

        <section className="px-5 py-8 sm:px-8">
          <h3 className="font-mono text-xl font-semibold tracking-tight">What you get with Premium</h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {BENEFITS.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <article key={benefit.title} className="flex flex-col border-2 border-edge bg-white p-5">
                  <Icon size={22} strokeWidth={1.7} className="text-[#8a5c1d]" aria-hidden="true" />
                  <h4 className="mt-4 font-mono text-[15px] font-semibold leading-snug tracking-tight">{benefit.title}</h4>
                  <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">{benefit.body}</p>
                  <p className="mt-auto pt-4 text-[11px] font-medium text-ink-soft">{benefit.comparison}</p>
                </article>
              );
            })}
          </div>
          <p className="mt-5 text-[12px] leading-relaxed text-ink-soft">Both plans include every notation and the same editable canvas. Premium gives you more capacity and all export options.</p>
        </section>

        <footer className="border-t-2 border-edge bg-white px-5 py-7 sm:px-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div><h3 className="font-mono text-xl font-semibold tracking-tight">Ready for more?</h3><p className="mt-2 text-[13px] text-ink-soft">$5 for 30 days. Renew only when you choose.</p></div>
            <Link href="/checkout" prefetch={false} className="premium-cta inline-flex min-h-12 shrink-0 items-center justify-center gap-3 border-2 border-edge px-5 font-mono text-[13px] font-semibold text-[#11110f]">
              Continue to checkout <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </footer>
      </dialog>
    </>
  );
}
