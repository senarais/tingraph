"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Clock3, Download, LockKeyhole, QrCode, Smartphone } from "lucide-react";
import { APIError, apiFetch } from "@/lib/api/client";
import TimeZoneSync from "@/components/account/time-zone-sync";
import { POLICY_VERSION } from "@/lib/legal";

type Method = "gopay" | "qris" | "paypal" | "card";
type Price = { method: Method; provider: "midtrans" | "paypal"; recurring: boolean; renewal_amount?: number; usd: string; discount_cents: number; base_cents: number; tax_cents: number; fee: number; amount: number; currency: "USD" | "IDR"; idr_base?: number; code?: string };
type Order = { id: string; method: Method; provider: "midtrans" | "paypal"; status: string; amount: number; currency: string; expires_at: string; checkout_url?: string; deeplink?: string; discount_code?: string; base_cents: number; tax_cents: number; fee: number; idr_base?: number };

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const rupiah = (amount: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);

async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) throw await APIError.from(response);
  return response.json() as Promise<T>;
}

function Logo({ method }: { method: Method | "card" }) {
  if (method === "qris") return <span className="flex size-11 items-center justify-center border-2 border-edge bg-white"><QrCode size={25} strokeWidth={2.5} /></span>;
  if (method === "gopay") return <span className="flex size-11 items-center justify-center border-2 border-edge bg-[#dcebf6] font-sans text-[21px] font-black tracking-[-0.15em] text-[#0667a8]">g<span className="text-[#20a6dc]">o</span></span>;
  if (method === "paypal") return <span className="flex size-11 items-center justify-center border-2 border-edge bg-[#e5eef3] font-sans text-[26px] font-black italic text-[#003087]">P</span>;
  return <span className="flex items-center gap-1"><span className="font-sans text-[15px] font-black italic text-[#173990]">VISA</span><span className="flex -space-x-2"><i className="size-5 rounded-full bg-[#e85234]" /><i className="size-5 rounded-full bg-[#f5ae27] opacity-90" /></span></span>;
}

export default function CheckoutPage({ orderId, knownTimeZone }: { orderId: string; knownTimeZone: string | null }) {
  const [method, setMethod] = useState<Method | null>(null);
  const [price, setPrice] = useState<Price | null>(null);
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [availability, setAvailability] = useState<{ midtrans: boolean; paypal: boolean; card: boolean; card_provider: "midtrans" | "paypal" } | null>(null);
  const [recurringConsent, setRecurringConsent] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let live = true;
    void getJSON<NonNullable<typeof availability>>("/api/v1/billing/quote").then((data) => { if (live) setAvailability(data); }).catch(() => { if (live) setProblem("Payment options are temporarily unavailable."); });
    if (orderId) void getJSON<Order>(`/api/v1/billing/orders/${encodeURIComponent(orderId)}`).then((data) => { if (live) { setOrder(data); setMethod(data.method); } }).catch(() => { if (live) setProblem("This payment could not be found."); });
    return () => { live = false; };
  }, [orderId]);

  useEffect(() => {
    if (!method || order) return;
    let live = true;
    void getJSON<Price>(`/api/v1/billing/quote?method=${method}&code=${encodeURIComponent(applied)}`).then((data) => { if (live) { setPrice(data); setRecurringConsent(false); } }).catch((err) => { if (live) { setPrice(null); setProblem(err instanceof Error ? err.message : "Price unavailable."); } });
    return () => { live = false; };
  }, [method, applied, order]);

  const activeOrder = order?.status === "pending" ? order.id : null;
  useEffect(() => {
    if (!activeOrder) return;
    const timer = window.setInterval(() => {
      void getJSON<Order>(`/api/v1/billing/orders/${encodeURIComponent(activeOrder)}`).then(setOrder).catch(() => {});
    }, 6000);
    return () => window.clearInterval(timer);
  }, [activeOrder]);

  const choose = (next: Method) => { setMethod(next); setPrice(null); setProblem(""); setRecurringConsent(false); };
  const redeem = async () => {
    if (!method || !code.trim()) { setProblem("Choose a payment method and enter a code first."); return; }
    setBusy(true); setProblem("");
    try {
      const normalized = code.trim().toUpperCase();
      const quote = await getJSON<Price>(`/api/v1/billing/quote?method=${method}&code=${encodeURIComponent(normalized)}`);
      setPrice(quote); setApplied(normalized); setRecurringConsent(false);
    } catch (err) { setProblem(err instanceof Error ? err.message : "Code could not be redeemed."); }
    finally { setBusy(false); }
  };
  const pay = async () => {
    if (!method || !price || price.method !== method || price.recurring && !recurringConsent) return;
    setBusy(true); setProblem("");
    try {
      const result = await getJSON<{ id: string; url: string }>("/api/v1/billing/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, amount: price.amount, provider: price.provider, renewal_amount: price.renewal_amount ?? 0, recurring_consent: recurringConsent, recurring_consent_version: POLICY_VERSION, code: applied, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || knownTimeZone || "UTC" }),
      });
      window.location.assign(result.url);
    } catch (err) { setProblem(err instanceof Error ? err.message : "Checkout could not be started."); setBusy(false); }
  };
  const checkPayment = async () => {
    if (!order) return;
    setBusy(true); setProblem("");
    try {
      const response = await apiFetch(`/api/v1/billing/orders/${encodeURIComponent(order.id)}/sync`, { method: "POST" });
      if (!response.ok) throw await APIError.from(response);
      setOrder(await getJSON<Order>(`/api/v1/billing/orders/${encodeURIComponent(order.id)}`));
    } catch (err) { setProblem(err instanceof Error ? err.message : "Status unavailable; try again shortly."); }
    finally { setBusy(false); }
  };

  const base = order?.base_cents ?? price?.base_cents ?? 500;
  const fee = order?.fee ?? price?.fee ?? 0;
  const rateBase = order?.idr_base ?? price?.idr_base ?? 0;
  const processingUSD = (order?.currency ?? price?.currency) === "USD" ? dollars(fee) : rateBase ? `≈ ${dollars(Math.round(fee / rateBase * 500))}` : "—";
  const totalUSD = order?.currency === "USD" ? dollars(order.amount) : rateBase ? dollars(Math.round((order?.amount ?? price?.amount ?? 0) / rateBase * 500)) : price?.currency === "USD" ? dollars(price.amount) : "$5.00 + fees";
  const payable = order?.status === "pending" && new Date(order.expires_at).getTime() > now;

  return <main className="min-h-screen bg-bone px-3 py-6 text-ink sm:px-6 sm:py-10">
    <TimeZoneSync known={knownTimeZone} />
    <div className="mx-auto max-w-[1150px] overflow-hidden border-[3px] border-edge bg-white shadow-[8px_8px_0_var(--edge)] lg:grid lg:min-h-[680px] lg:grid-cols-[1.12fr_0.88fr]">
      <div className="flex flex-col p-5 sm:p-9 lg:p-12">
        <Link href="/" className="flex w-fit items-center gap-2 font-mono text-[16px] font-bold"><Image src="/icon.png" alt="" width={30} height={30} /> tingraph<span className="-ml-2 text-blueprint">.</span></Link>
        <Link href="/profile" className="mt-10 inline-flex w-fit items-center gap-2 font-mono text-[11px] text-ink-soft transition-colors hover:text-ink"><ArrowLeft size={14} /> Back to profile</Link>
        {order ? <div className="mt-8 animate-[checkout-enter_250ms_ease-out]">
          <p className="font-mono text-[10px] uppercase tracking-widest text-blueprint">{order.method} / {order.status}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{order.status === "paid" ? "Payment complete." : payable ? "Ready to pay." : order.status === "pending" ? "Confirming final status." : "Payment closed."}</h1>
          {payable && (order.method === "gopay" || order.method === "qris") ? <>
            <p className="mt-3 text-[13px] text-ink-soft">{order.method === "gopay" ? "Open GoPay or scan the code below." : "Scan this QRIS code with any supported payment app."} Complete payment before {new Date(order.expires_at).toLocaleString()}.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/v1/billing/orders/${encodeURIComponent(order.id)}/qr`} alt="Scan to pay for Tingraph Premium" className="mt-6 aspect-square w-60 max-w-full border-2 border-edge bg-white p-3" />
            <div className="mt-5 flex flex-wrap gap-3">
              <a href={`/api/v1/billing/orders/${encodeURIComponent(order.id)}/qr?download=1`} download={`tingraph-${order.id}.png`} className="slab-tight press inline-flex items-center gap-2 bg-white px-3 py-2 text-[12px] font-semibold"><Download size={15} /> Download QR</a>
              {order.method === "gopay" && order.deeplink && <a href={order.deeplink} rel="noopener noreferrer" className="slab-tight press inline-flex items-center gap-2 bg-[#dcebf6] px-3 py-2 text-[12px] font-semibold"><Smartphone size={15} /> Open GoPay</a>}
            </div>
            <button type="button" disabled={busy} onClick={() => void checkPayment()} className="mt-6 font-mono text-[11px] underline disabled:opacity-50">Check payment status →</button>
          </> : payable && order.checkout_url ? <><a href={order.checkout_url} className="slab-tight press mt-5 inline-block bg-edge px-4 py-3 text-[12px] text-bone">Continue securely to {order.provider === "paypal" ? "PayPal" : "Midtrans"} →</a><button type="button" disabled={busy} onClick={() => void checkPayment()} className="mt-5 block font-mono text-[11px] underline disabled:opacity-50">Check payment status →</button></> : order.status === "pending" ? <p className="mt-4 text-[13px] text-ink-soft">Checking the provider before closing this order. Manage any renewal from your profile.</p> : order.status === "paid" ? null : <Link href="/checkout" className="slab-tight press mt-6 inline-block bg-edge px-4 py-2 text-[12px] text-bone">Start another checkout →</Link>}
        </div> : <div className="mt-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-blueprint">Premium · 30 days</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Choose how to pay.</h1>
          <p className="mt-3 max-w-md text-[13px] leading-relaxed text-ink-soft">30 days of everything. Select a method to see your final total and whether it renews automatically.</p>
          <p className="mt-4 max-w-md text-[12px] leading-relaxed text-ink-soft">The product price is $5 before an eligible discount. Applicable purchase taxes and the displayed gateway/processing fee are paid by the buyer in addition to that product price. Read <Link href="/billing-policy" className="font-semibold underline underline-offset-4">Billing & Refunds</Link> and the <Link href="/terms" className="underline underline-offset-4">Terms</Link> before continuing.</p>
          <div className="mt-7 space-y-2.5">
            {(["gopay", "qris", "paypal", "card"] as const).map((item, index) => <button key={item} type="button" aria-pressed={method === item} disabled={!availability || (item === "card" ? !availability.card : item === "paypal" ? !availability.paypal : !availability.midtrans)} onClick={() => choose(item)}
              style={{ animationDelay: `${index * 55}ms` }} className={`group flex w-full items-center gap-4 border-2 p-3 text-left animate-[checkout-enter_240ms_ease-out_both] transition-[background-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--edge)] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none ${method === item ? "border-edge bg-blueprint-tint shadow-[3px_3px_0_var(--edge)]" : "border-edge/40 bg-white hover:border-edge"}`}>
              <Logo method={item} /><span className="min-w-0 flex-1"><strong className="block text-[14px]">{item === "gopay" ? "GoPay" : item === "qris" ? "QRIS" : item === "card" ? "Credit / debit card" : "PayPal"}</strong><small className="text-[11px] text-ink-soft">{item === "gopay" ? "Pay in app or scan QR · one-time" : item === "qris" ? "Scan with your payment app · one-time" : item === "card" ? availability?.card_provider === "paypal" ? "Card via your PayPal account · auto-renews every 30 days" : "Visa / Mastercard via Midtrans · one-time" : "Continue securely at PayPal · one-time"}</small></span><ArrowRight size={17} className={method === item ? "text-blueprint" : "text-ink-faint"} />
            </button>)}
          </div>
        </div>}
        {problem && <p role="alert" className="mt-5 border-l-2 border-alert bg-alert-tint p-3 text-[12px] text-alert">{problem}</p>}
        {!order && price?.recurring && <label className="mt-6 flex items-start gap-3 border-2 border-edge bg-bone p-4 text-[12px] leading-relaxed"><input type="checkbox" checked={recurringConsent} onChange={(event) => setRecurringConsent(event.target.checked)} className="mt-1 size-4 shrink-0 accent-black" /><span>I authorize {dollars(price.amount)} for the first 30 days, then {dollars(price.renewal_amount ?? 0)} every 30 days until I stop renewal from my profile or PayPal. A PayPal account is required; choose your linked card on PayPal. Discounts apply only to the first period. Payments already in progress may complete.</span></label>}
        {!order && <div className="mt-auto flex justify-end pt-10"><button type="button" disabled={!price || price.method !== method || busy || price.recurring && !recurringConsent} onClick={() => void pay()} className="slab-tight press inline-flex items-center gap-3 bg-edge px-5 py-3 font-mono text-[12px] font-semibold text-bone disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Preparing…" : price?.recurring ? "Subscribe with PayPal" : method === "paypal" ? "Continue to PayPal" : method === "card" ? "Continue to card payment" : "Generate payment QR"}<ArrowRight size={15} /></button></div>}
      </div>
      <aside className="border-t-[3px] border-edge bg-[#e5eef3] p-5 sm:p-9 lg:border-l-[3px] lg:border-t-0 lg:p-12">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-blueprint">Order summary / 001</p>
        <h2 className="mt-2 text-xl font-semibold">Your next 30 days.</h2>
        <div className="mt-8 flex items-center gap-4 border-y-2 border-edge py-6"><div className="grid size-16 shrink-0 place-items-center border-2 border-edge bg-white"><Image src="/icon.png" width={40} height={40} alt="" /></div><div className="min-w-0 flex-1"><p className="font-semibold">Tingraph Premium</p><p className="mt-1 text-[11px] text-ink-soft">{price?.recurring || order?.method === "card" && order.provider === "paypal" ? "Auto-renewing access" : "One-time access"} · 30 days</p></div><span className="font-mono text-[14px] font-bold">$5.00</span></div>
        <ul className="space-y-2 border-b border-edge/30 py-5 font-mono text-[11px] text-ink-soft">
          <li className="flex items-center gap-2"><Check size={13} className="text-blueprint" /> Unlimited diagram generations</li>
          <li className="flex items-center gap-2"><Check size={13} className="text-blueprint" /> 100 saved diagrams</li>
          <li className="flex items-center gap-2"><Check size={13} className="text-blueprint" /> 100,000 AI tokens per 24-hour window</li>
        </ul>
        {!order && <div className="mt-6"><label htmlFor="discount" className="font-mono text-[10px] uppercase tracking-widest">Discount code</label><div className="mt-2 flex gap-2"><input id="discount" value={code} onChange={(e) => setCode(e.target.value)} maxLength={32} placeholder="Enter code" className="min-w-0 flex-1 border-2 border-edge bg-white px-3 py-2.5 font-mono text-[12px] uppercase outline-offset-2" /><button type="button" onClick={() => void redeem()} disabled={busy} className="slab-tight press bg-white px-3 font-mono text-[11px] font-semibold disabled:opacity-50">Redeem</button></div>{applied && <button type="button" className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-forest" onClick={() => { setApplied(""); setCode(""); setRecurringConsent(false); }}><Check size={13} /> {applied} applied · remove</button>}</div>}
        <div className="mt-8 space-y-3 border-t border-edge/30 pt-6 text-[12px]"><div className="flex justify-between"><span>Subtotal</span><span className="font-mono">$5.00</span></div><div className="flex justify-between"><span>Discount{order?.discount_code && ` · ${order.discount_code}`}</span><span className="font-mono">−{dollars(500 - base)}</span></div><div className="flex justify-between"><span>Taxes on product</span><span className="font-mono">{dollars(order?.tax_cents ?? price?.tax_cents ?? 0)}</span></div><div className="flex justify-between"><span>Payment processing{method ? ` · ${method.toUpperCase()}` : ""}</span><span className="font-mono">{price || order ? processingUSD : "—"}</span></div></div>
        <div className="mt-6 border-t-2 border-edge pt-5"><div className="flex items-end justify-between"><span className="font-mono text-[12px] font-bold uppercase">Total due</span><strong className="font-mono text-2xl">{totalUSD}</strong></div>{(price?.currency === "IDR" && !order || order?.currency === "IDR") && <p className="mt-2 text-right font-mono text-[12px] font-semibold text-blueprint">Final charge: {rupiah(order?.amount ?? price?.amount ?? 0)}</p>}</div>
        {price?.recurring && <p className="mt-4 text-[12px] font-semibold">Then {dollars(price.renewal_amount ?? 0)} every 30 days, including the quoted tax and processing fee. Stop renewal from your profile.</p>}
        {(price?.currency === "IDR" || order?.currency === "IDR") && <p className="mt-5 border-l-2 border-blueprint pl-3 text-[11px] leading-relaxed text-ink-soft">For Midtrans payments, the USD breakdown is an estimate. Your final payment is converted to Indonesian rupiah before checkout; the IDR amount shown above is charged by Midtrans.</p>}
        <p className="mt-10 flex items-center gap-2 border-t border-edge/30 pt-5 font-mono text-[10px] text-ink-soft"><LockKeyhole size={14} /> Provider-verified payment · <Clock3 size={14} /> 24-hour window</p>
      </aside>
    </div>
  </main>;
}
