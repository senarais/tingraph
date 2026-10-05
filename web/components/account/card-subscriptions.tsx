"use client";

import { useEffect, useState } from "react";
import { APIError, apiFetch } from "@/lib/api/client";

type Subscription = { id: string; status: string; amount: number; next_billing_at?: string; cancel_requested: boolean };

export default function CardSubscriptions() {
  const [items, setItems] = useState<Subscription[] | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const response = await apiFetch("/api/v1/billing/subscriptions");
        if (!response.ok) throw await APIError.from(response);
        const data = await response.json() as Subscription[];
        if (live) setItems(data);
      } catch { if (live) setMessage("Renewal status is temporarily unavailable. You can also manage automatic payments in PayPal."); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => { live = false; window.clearInterval(timer); };
  }, []);

  const stop = async (id: string) => {
    setBusy(id); setMessage("");
    try {
      const response = await apiFetch(`/api/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, { method: "POST" });
      if (!response.ok) throw await APIError.from(response);
      const refreshed = await apiFetch("/api/v1/billing/subscriptions");
      if (!refreshed.ok) throw await APIError.from(refreshed);
      const data = await refreshed.json() as Subscription[];
      setItems(data);
      setMessage(data.find((item) => item.id === id)?.status === "CANCELLED" ? "Automatic renewal stopped. Your paid Premium period stays active." : "Renewal stop requested. Pending approval must finish before PayPal can confirm cancellation; any payment already authorized may complete.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Renewal could not be stopped yet. Please retry."); }
    finally { setBusy(""); }
  };

  if (items?.length === 0 && !message) return null;
  return <div className="border-t border-edge p-5">
    <h3 className="font-mono text-[13px] font-semibold">PayPal card renewal</h3>
    {!items && <p className="mt-3 text-[12px] text-ink-soft">Loading renewal status…</p>}
    {items?.map((item) => <div key={item.id} className="mt-4 border border-edge/30 p-4 text-[12px]">
      <p className="font-semibold">${(item.amount / 100).toFixed(2)} every 30 days · {item.status.toLowerCase().replaceAll("_", " ")}</p>
      {item.next_billing_at && !item.cancel_requested && <p className="mt-2 text-ink-soft">Next payment: {new Date(item.next_billing_at).toLocaleString()}</p>}
      {item.cancel_requested && !["CANCELLED", "EXPIRED", "FAILED"].includes(item.status) && <p className="mt-2 text-ink-soft">Renewal stop requested; waiting for PayPal confirmation.</p>}
      {!item.cancel_requested && !["CANCELLED", "EXPIRED", "FAILED"].includes(item.status) && <button type="button" disabled={!!busy} onClick={() => void stop(item.id)} className="slab-tight press mt-3 bg-white px-3 py-2 font-mono text-[11px] disabled:opacity-50">{busy === item.id ? "Stopping…" : "Stop automatic renewal"}</button>}
    </div>)}
    {message && <p role="status" className="mt-4 text-[12px] leading-relaxed text-ink-soft">{message}</p>}
  </div>;
}
