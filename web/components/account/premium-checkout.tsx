"use client";

import { useEffect, useState } from "react";
import { APIError, apiFetch } from "@/lib/api/client";

interface Quote {
  usd: string;
  idr?: number;
  midtrans: boolean;
  paypal: boolean;
}

export default function PremiumCheckout({ active, until }: { active: boolean; until: string | null }) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState<"midtrans" | "paypal" | null>(null);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (active && !until) return;
    let cancelled = false;
    void apiFetch("/api/v1/billing/quote").then(async (response) => {
      if (!response.ok) throw await APIError.from(response);
      if (!cancelled) setQuote((await response.json()) as Quote);
    }).catch(() => { if (!cancelled) setProblem("Prices are temporarily unavailable."); });
    return () => { cancelled = true; };
  }, [active, until]);

  if (active && !until) {
    return <p className="border-t-2 border-edge px-5 py-3 text-[12px] text-ink-soft">Your Premium plan has no expiry.</p>;
  }

  const checkout = async (provider: "midtrans" | "paypal") => {
    setBusy(provider);
    setProblem("");
    try {
      const response = await apiFetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, amount: provider === "midtrans" ? quote?.idr : undefined }),
      });
      if (!response.ok) throw await APIError.from(response);
      const result = (await response.json()) as { url: string };
      window.location.assign(result.url);
    } catch (cause) {
      setProblem(cause instanceof APIError ? cause.message : "Checkout could not be started.");
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3 border-t-2 border-edge p-5">
      <p className="text-[13px] font-semibold text-ink">{active ? "Extend Premium" : "Get Premium"} · $5 for 30 days</p>
      {active && until && <p className="text-[12px] text-ink-soft">Active until {new Date(until).toLocaleDateString()}. A new payment adds 30 days.</p>}
      <p className="text-[12px] text-ink-soft">One-time payment. No automatic renewal.</p>
      <div className="flex flex-wrap gap-3">
        {quote?.midtrans && quote.idr && (
          <button type="button" disabled={busy !== null} onClick={() => void checkout("midtrans")}
            className="slab-tight press bg-edge px-4 py-2 text-[12px] font-semibold text-bone disabled:opacity-50">
            {busy === "midtrans" ? "Opening…" : `Pay with Midtrans · ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(quote.idr)}`}
          </button>
        )}
        {quote?.paypal && (
          <button type="button" disabled={busy !== null} onClick={() => void checkout("paypal")}
            className="slab-tight press bg-white px-4 py-2 text-[12px] font-semibold text-ink disabled:opacity-50">
            {busy === "paypal" ? "Opening…" : "Pay with PayPal · $5.00"}
          </button>
        )}
      </div>
      {quote && !quote.midtrans && !quote.paypal && <p className="text-[12px] text-ink-soft">Payments are not configured yet.</p>}
      {problem && <p role="alert" className="text-[12px] text-alert">{problem}</p>}
    </div>
  );
}
