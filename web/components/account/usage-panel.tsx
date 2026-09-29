"use client";

import type { Entitlements } from "@/lib/api/types";

function Meter({ label, used, limit, reset, note }: { label: string; used: number; limit: number | null; reset: string | null; note: string }) {
  const percentage = limit === null ? 0 : Math.min(100, Math.round(used / limit * 100));
  return <div className="border-2 border-edge bg-white p-5 sm:p-6">
    <div className="flex items-start justify-between gap-4">
      <div><h3 className="font-mono text-[14px] font-bold text-ink">{label}</h3><p className="mt-1 text-[12px] text-ink-soft">{note}</p></div>
      <span className="font-mono text-[13px] font-semibold">{limit === null ? "∞" : `${percentage}%`}</span>
    </div>
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit ?? undefined} aria-valuenow={limit === null ? undefined : Math.min(used, limit)} className="mt-6 h-3 overflow-hidden border border-edge bg-bone">
      <div className="h-full bg-blueprint transition-[width] duration-500" style={{ width: `${percentage}%` }} />
    </div>
    <div className="mt-3 flex flex-wrap justify-between gap-2 font-mono text-[11px] text-ink-soft">
      <span>{used.toLocaleString()} used / {limit === null ? "Unlimited" : limit.toLocaleString()}</span>
      <span>{reset ? `Resets ${new Date(reset).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}` : "Starts with first use"}</span>
    </div>
  </div>;
}

export default function UsagePanel({ usage }: { usage: Entitlements }) {
  return <section className="space-y-4">
    <div className="slab bg-white p-5 sm:p-6"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">Account / usage</p><h2 className="mt-2 text-2xl font-semibold">Your usage</h2><p className="mt-2 text-[13px] text-ink-soft">Each allowance runs for 24 hours from its first use. Times shown in your device’s time zone.</p></div>
    <Meter label="Diagram generations" used={usage.generation_used} limit={usage.generation_limit} reset={usage.generation_reset} note="Generate a diagram from source" />
    <Meter label="Tingraph AI" used={usage.ai_tokens_used} limit={usage.ai_token_limit} reset={usage.ai_reset} note="Tokens used or reserved for requests in this window" />
    <Meter label="Saved diagrams" used={usage.diagram_count} limit={usage.diagram_limit} reset={null} note="Storage allowance · no timed reset" />
  </section>;
}
