"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";

export default function PaymentReturn({ order, provider, token }: { order: string; provider: string; token: string }) {
  const valid = /^[0-9a-f-]{36}$/.test(order) && ["midtrans", "paypal"].includes(provider) && (provider !== "paypal" || !!token);
  const [message, setMessage] = useState(valid ? "Waiting for confirmation from the payment provider…" : "This payment link is invalid.");

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    const check = async () => {
      try {
        if (provider === "paypal") {
          const response = await apiFetch(`/api/v1/billing/orders/${order}/capture`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
          });
          if (!response.ok) throw new Error("PayPal could not confirm this payment yet.");
        } else {
          await apiFetch(`/api/v1/billing/orders/${order}/sync`, { method: "POST" });
        }
        for (let attempt = 0; attempt < 20 && !cancelled; attempt++) {
          const response = await apiFetch(`/api/v1/billing/orders/${order}`);
          if (response.status === 401) { setMessage("Sign in again to check your payment."); return; }
          if (!response.ok) throw new Error("Payment status could not be checked.");
          const payment = (await response.json()) as { status: string };
          if (payment.status === "paid") { setMessage("Premium is active. Your payment is confirmed."); return; }
          if (payment.status === "refunded") { setMessage("This payment was refunded."); return; }
          if (payment.status === "failed") { setMessage("Payment did not complete. You can try again from your profile."); return; }
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
        if (!cancelled) setMessage("Confirmation is still pending. Check your profile in a few minutes.");
      } catch {
        if (!cancelled) setMessage("Payment could not be confirmed yet. Check your profile shortly.");
      }
    };
    void check();
    return () => { cancelled = true; };
  }, [order, provider, token, valid]);

  return (
    <div className="space-y-4 text-[13px] text-ink-soft">
      <p role="status">{message}</p>
      <Link href="/profile#plan" className="slab-tight press block bg-edge px-3 py-2 text-center text-[12px] font-semibold text-bone">
        View profile
      </Link>
    </div>
  );
}
