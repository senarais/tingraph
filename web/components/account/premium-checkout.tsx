"use client";

import Link from "next/link";

export default function PremiumCheckout({ active, until }: { active: boolean; until: string | null }) {
  if (active && !until) {
    return <p className="border-t-2 border-edge px-5 py-3 text-[12px] text-ink-soft">Your Premium plan has no expiry.</p>;
  }

  return (
    <div className="space-y-3 border-t-2 border-edge p-5">
      <p className="text-[13px] font-semibold text-ink">{active ? "Extend Premium" : "Get Premium"} · $5 for 30 days</p>
      {active && until && <p className="text-[12px] text-ink-soft">Active through {new Date(new Date(until).getTime() - 1000).toLocaleDateString()} · 24:00 local time. A new payment adds 30 days.</p>}
      <p className="text-[12px] text-ink-soft">One-time payment. No automatic renewal.</p>
      <Link href="/checkout" className="slab-tight press inline-block bg-edge px-4 py-2.5 font-mono text-[12px] font-semibold text-bone">Continue to checkout →</Link>
    </div>
  );
}
