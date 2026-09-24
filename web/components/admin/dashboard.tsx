"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  Activity, ArrowLeft, ArrowRight, Check, CreditCard, LayoutDashboard,
  LogOut, Plus, Search, ShieldCheck, Users, X,
} from "lucide-react";
import { APIError, apiFetch } from "@/lib/api/client";
import type { Profile, User } from "@/lib/api/types";
import { PASSWORD_MIN, PROFILE_FIELDS } from "@/lib/auth";

type AdminUser = {
  id: string;
  email: string;
  role: "user" | "admin";
  verified: boolean;
  disabled_at: string | null;
  created_at: string;
  tier: "free" | "premium";
  premium_until: string | null;
  name: string | null;
  username: string | null;
  diagrams: number;
  orders: number;
};

type Order = {
  id: string;
  user_id: string;
  email: string;
  provider: string;
  provider_id: string | null;
  payment_id: string | null;
  currency: "IDR" | "USD";
  amount: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  refunded_at: string | null;
};

export type AdminOverview = {
  users: number;
  verified: number;
  premium: number;
  disabled: number;
  diagrams: number;
  revenue: { currency: "IDR" | "USD"; amount: number; orders: number }[];
  orders: Order[];
  daily: { day: string; currency: "IDR" | "USD"; amount: number }[];
  activity: { action: string; email: string; actor: string | null; created_at: string }[];
};

export type AdminUsers = { users: AdminUser[]; total: number; page: number };
type AdminOrders = { orders: Order[]; total: number; page: number };
type Detail = {
  user: AdminUser;
  profile: Profile;
  orders: Order[];
  diagrams: { id: string; title: string; category: string; updated_at: string }[];
  generations: number;
  ai_tokens: number;
};

const control = "w-full min-w-0 border-2 border-edge bg-white px-3 py-2 text-[13px] text-ink outline-offset-2";
const action = "inline-flex items-center justify-center gap-2 border-2 border-edge bg-white px-3 py-2 font-mono text-[11px] font-semibold transition-colors hover:bg-bone disabled:opacity-50";
const primary = `${action} bg-[#bda0ff] hover:bg-[#d6c5ff]`;
const money = (amount: number, currency: "IDR" | "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: currency === "IDR" ? 0 : 2 }).format(currency === "USD" ? amount / 100 : amount);
const date = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

function Panel({ title, side, children }: { title: string; side?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-2 border-edge bg-white">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b-2 border-edge px-4 py-3">
        <h2 className="font-mono text-[13px] font-bold text-ink">{title}</h2>{side}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="block font-mono text-[10px] uppercase tracking-wider text-ink-soft">{label}</span>{children}</label>;
}

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "purple" | "green" | "red" }) {
  const colors = { neutral: "bg-bone", purple: "bg-[#e5d9ff]", green: "bg-[#d6f3df]", red: "bg-[#ffdedb]" };
  return <span className={`inline-block border border-edge px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${colors[tone]}`}>{children}</span>;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) throw await APIError.from(response);
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

export default function AdminDashboard({ initialOverview, initialUsers, admin }: {
  initialOverview: AdminOverview;
  initialUsers: AdminUsers;
  admin: User;
}) {
  const [overview, setOverview] = useState(initialOverview);
  const [users, setUsers] = useState(initialUsers);
  const [orders, setOrders] = useState<AdminOrders | null>(null);
  const [orderFilter, setOrderFilter] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [section, setSection] = useState<"overview" | "users" | "orders" | "activity">("overview");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadUsers = async (page = users.page, q = search) => {
    const result = await json<AdminUsers>(`/api/v1/admin/users?page=${page}&q=${encodeURIComponent(q)}`);
    setUsers(result);
  };
  const loadOrders = async (page = 1, user = orderFilter, status = orderStatus) => {
    const result = await json<AdminOrders>(`/api/v1/admin/orders?page=${page}&user=${encodeURIComponent(user)}&status=${status}`);
    setOrders(result);
  };
  const loadDetail = async (id: string) => {
    setDetail(await json<Detail>(`/api/v1/admin/users/${id}`));
    setCreating(false);
    setSection("users");
  };
  const reload = async (id?: string) => {
    const [summary, listing] = await Promise.all([
      json<AdminOverview>("/api/v1/admin/overview"),
      json<AdminUsers>(`/api/v1/admin/users?page=${users.page}&q=${encodeURIComponent(search)}`),
    ]);
    setOverview(summary);
    setUsers(listing);
    if (id) setDetail(await json<Detail>(`/api/v1/admin/users/${id}`));
  };
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try { await work(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Request failed."); }
    finally { setBusy(false); }
  };
  const openOrders = (user = "") => run(async () => {
    setOrderFilter(user);
    setOrderStatus("");
    await loadOrders(1, user, "");
    setSection("orders");
  });

  const createUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    run(async () => {
      const created = await json<{ id: string }>("/api/v1/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), name: data.get("name"),
          password: data.get("password"), verified: data.get("verified") === "on" }),
      });
      await reload();
      await loadDetail(created.id);
      setMessage("Account created.");
    });
  };
  const saveUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!detail) return;
    const data = new FormData(event.currentTarget);
    const id = detail.user.id;
    run(async () => {
      const profile = Object.fromEntries(
        ["username", "full_name", "profession", "affiliation", "location", "website", "bio"]
          .map((key) => [key, String(data.get(key) ?? "").trim() || null]),
      );
      const expiry = String(data.get("premium_until") ?? "");
      await json(`/api/v1/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), role: data.get("role"),
          verified: data.get("verified") === "on", disabled: data.get("disabled") === "on",
          tier: data.get("tier"), premium_until: expiry ? new Date(expiry).toISOString() : null, profile }),
      });
      await reload(id);
      setMessage("Account saved.");
    });
  };
  const changePassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!detail) return;
    const form = event.currentTarget;
    const password = String(new FormData(form).get("password"));
    run(async () => {
      await json(`/api/v1/admin/users/${detail.user.id}/password`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }),
      });
      form.reset();
      setMessage("Password changed. Existing sessions revoked.");
    });
  };
  const deleteUser = () => {
    if (!detail || !window.confirm(`Delete ${detail.user.email} and their diagrams? This cannot be undone.`)) return;
    const id = detail.user.id;
    run(async () => {
      await json(`/api/v1/admin/users/${id}`, { method: "DELETE" });
      setDetail(null);
      await reload();
      setMessage("Account deleted.");
    });
  };

  const tab = (key: typeof section, label: string, icon: ReactNode, onClick?: () => void) => (
    <button type="button" key={key} onClick={onClick ?? (() => setSection(key))} aria-current={section === key ? "page" : undefined}
      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left font-mono text-[12px] transition-colors hover:bg-white/10 ${section === key ? "bg-[#bda0ff] font-semibold text-black hover:bg-[#bda0ff]" : "text-white/75"}`}>
      {icon}{label}
    </button>
  );

  return (
    <main className="min-h-screen bg-bone px-3 py-5 text-ink sm:px-6 sm:py-10">
      <div className="mx-auto flex max-w-[1500px] flex-col overflow-hidden border-[3px] border-edge bg-white shadow-[9px_9px_0_#000] lg:min-h-[750px] lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col bg-[#111111] px-4 py-5 text-white lg:w-[220px] lg:px-5 lg:py-7">
          <Link href="/" className="font-mono text-[19px] font-bold tracking-tight">tingraph<span className="text-[#bda0ff]">.</span></Link>
          <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">Admin workspace</span>
          <div className="mt-6 border-t border-white/20 pt-4 font-mono text-[10px] uppercase tracking-widest text-white/50">Navigation</div>
          <nav aria-label="Admin sections" className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1">
            {tab("overview", "Overview", <LayoutDashboard size={15} />)}
            {tab("users", "Users", <Users size={15} />)}
            {tab("orders", "Transactions", <CreditCard size={15} />, () => { void openOrders(); })}
            {tab("activity", "Activity", <Activity size={15} />)}
          </nav>
          <div className="mt-auto hidden border-t border-white/20 pt-5 lg:block">
            <div className="truncate font-mono text-[11px] font-semibold">{admin.email}</div>
            <div className="mt-1 font-mono text-[10px] text-white/50">Administrator</div>
            <Link href="/profile" className="mt-4 flex items-center gap-2 font-mono text-[11px] text-white/70 hover:text-white"><LogOut size={13} /> Back to site</Link>
          </div>
        </aside>

        <div className="min-w-0 flex-1 bg-[#faf9f6]">
          <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b-2 border-edge bg-white px-5 py-3 sm:px-8">
            <div><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-soft">Control center / {section}</p>
              <h1 className="mt-1 font-mono text-lg font-bold capitalize tracking-tight sm:text-xl">{section === "orders" ? "Transactions" : section}</h1></div>
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1.5 font-mono text-[10px] sm:flex"><ShieldCheck size={14} /> Admin access</span>
              <button type="button" className={primary} onClick={() => { setCreating(true); setDetail(null); setSection("users"); setMessage(""); }}><Plus size={13} /> New user</button>
            </div>
          </header>

          <div className="space-y-5 p-4 sm:p-7">
            {message && <div role="status" className="flex items-center justify-between border-2 border-edge bg-[#e5d9ff] px-3 py-2 font-mono text-[11px]">
              <span>{message}</span><button type="button" aria-label="Dismiss" onClick={() => setMessage("")}><X size={14} /></button>
            </div>}

            {section === "overview" && <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Total users", overview.users, `${overview.verified} verified`, "#bda0ff"],
                  ["Premium", overview.premium, "Active plans", "#b9e8c5"],
                  ["Unverified", overview.users - overview.verified, "Awaiting verification", "#ffd49f"],
                  ["Diagrams", overview.diagrams, `${overview.disabled} disabled accounts`, "#ffd0cb"],
                ].map(([label, value, note, color]) => <div key={label} className="border-2 border-edge bg-white p-4">
                  <div className="mb-5 h-1 w-10" style={{ background: String(color) }} />
                  <div className="font-mono text-[10px] uppercase tracking-wider text-ink-soft">{label}</div>
                  <div className="mt-2 font-mono text-3xl font-bold">{value}</div>
                  <div className="mt-3 border-t border-edge/30 pt-2 font-mono text-[10px] text-ink-soft">{note}</div>
                </div>)}
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                <Panel title="Revenue · settled, excluding refunds" side={<button className="font-mono text-[10px] underline" onClick={() => void openOrders()} type="button">View transactions →</button>}>
                  <div className="grid grid-cols-2 gap-3 p-4">
                    {(["IDR", "USD"] as const).map((currency) => {
                      const total = overview.revenue.find((item) => item.currency === currency);
                      const days = overview.daily.filter((item) => item.currency === currency).slice(-7);
                      const maximum = Math.max(...days.map((item) => item.amount), 1);
                      return <div key={currency} className="min-w-0 border border-edge p-3">
                        <div className="font-mono text-[10px] text-ink-soft">{currency} · {total?.orders ?? 0} payments</div>
                        <div className="mt-1 break-words font-mono text-[19px] font-bold sm:text-2xl">{money(total?.amount ?? 0, currency)}</div>
                        <div className="mt-5 flex h-14 items-end gap-1" aria-label={`Revenue on last seven active days in ${currency}`}>
                          {days.length ? days.map((item) => <div key={item.day} title={`${date(item.day)} · ${money(item.amount, currency)}`}
                            className="min-w-1 flex-1 border border-edge bg-[#bda0ff]" style={{ height: `${Math.max(10, item.amount / maximum * 100)}%` }} />)
                            : <span className="self-center font-mono text-[10px] text-ink-soft">No settled payments yet</span>}
                        </div>
                        <div className="mt-2 font-mono text-[10px] text-ink-soft">Last 30 days · recent activity</div>
                      </div>;
                    })}
                  </div>
                </Panel>
                <Panel title="Quick access" side={<Badge tone="purple">Live data</Badge>}>
                  <div className="divide-y divide-edge/25">
                    <button type="button" className="flex w-full items-center justify-between p-4 text-left hover:bg-bone" onClick={() => setSection("users")}><span><strong className="block font-mono text-[12px]">Manage accounts</strong><small className="mt-1 block text-ink-soft">Verify, edit plans, manage access</small></span><ArrowRight size={16} /></button>
                    <button type="button" className="flex w-full items-center justify-between p-4 text-left hover:bg-bone" onClick={() => void openOrders()}><span><strong className="block font-mono text-[12px]">Payment ledger</strong><small className="mt-1 block text-ink-soft">Providers, status, and revenue</small></span><ArrowRight size={16} /></button>
                    <button type="button" className="flex w-full items-center justify-between p-4 text-left hover:bg-bone" onClick={() => setSection("activity")}><span><strong className="block font-mono text-[12px]">Admin activity</strong><small className="mt-1 block text-ink-soft">Recent account changes</small></span><ArrowRight size={16} /></button>
                  </div>
                </Panel>
              </div>
              <OrdersPanel orders={overview.orders} onUser={(id) => void run(() => loadDetail(id))} title="Recent transactions" />
            </>}

            {section === "users" && <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <Panel title="User directory" side={<Badge>{users.total} accounts</Badge>}>
                <form className="flex gap-2 border-b border-edge/30 p-4" onSubmit={(event) => { event.preventDefault(); void run(() => loadUsers(1)); }}>
                  <div className="relative flex-1"><Search size={15} className="absolute left-3 top-3 text-ink-soft" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Email or username" aria-label="Search users" maxLength={100} className={`${control} pl-9`} /></div>
                  <button className={action} disabled={busy}>Search</button>
                </form>
                <div className="divide-y divide-edge/20">
                  {users.users.map((user) => <button key={user.id} type="button" onClick={() => void run(() => loadDetail(user.id))}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#f3efff] ${detail?.user.id === user.id ? "bg-[#f3efff]" : ""}`}>
                    <span className="flex size-9 shrink-0 items-center justify-center border border-edge bg-bone font-mono text-[13px] font-bold uppercase">{user.email[0]}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-mono text-[12px] font-semibold">{user.name || user.email}</span><span className="block truncate text-[11px] text-ink-soft">{user.email}</span></span>
                    <span className="hidden sm:block"><Badge tone={user.disabled_at ? "red" : user.role === "admin" ? "purple" : user.tier === "premium" ? "green" : "neutral"}>{user.disabled_at ? "Disabled" : user.role === "admin" ? "Admin" : user.tier}</Badge></span>
                    <ArrowRight size={14} />
                  </button>)}
                  {!users.users.length && <p className="p-6 text-center font-mono text-[11px] text-ink-soft">No matching accounts.</p>}
                </div>
                <div className="flex items-center justify-between border-t border-edge/30 p-4 font-mono text-[11px]">
                  <span>Page {users.page} / {Math.max(1, Math.ceil(users.total / 25))}</span>
                  <div className="flex gap-2"><button aria-label="Previous users page" className={action} disabled={users.page <= 1 || busy} onClick={() => void run(() => loadUsers(users.page - 1))}><ArrowLeft size={13} /></button>
                    <button aria-label="Next users page" className={action} disabled={users.page * 25 >= users.total || busy} onClick={() => void run(() => loadUsers(users.page + 1))}><ArrowRight size={13} /></button></div>
                </div>
              </Panel>

              <div className="min-w-0 space-y-4">
                {creating && <Panel title="Create account" side={<button type="button" aria-label="Close" onClick={() => setCreating(false)}><X size={16} /></button>}>
                  <form onSubmit={createUser} className="space-y-4 p-4">
                    <Field label="Email"><input name="email" type="email" required maxLength={320} className={control} /></Field>
                    <Field label="Name"><input name="name" maxLength={80} className={control} /></Field>
                    <Field label={`Password · min ${PASSWORD_MIN} characters`}><input name="password" type="password" minLength={PASSWORD_MIN} required autoComplete="new-password" className={control} /></Field>
                    <label className="flex items-center gap-2 font-mono text-[11px]"><input name="verified" type="checkbox" defaultChecked className="accent-black" /> Verify without email</label>
                    <button className={primary} disabled={busy}><Plus size={13} /> Create user</button>
                  </form>
                </Panel>}
                {detail && <UserDetail key={detail.user.id + detail.user.email + detail.user.tier + detail.user.role + detail.user.verified + detail.user.disabled_at + detail.user.premium_until}
                  detail={detail} self={admin.id === detail.user.id} busy={busy} save={saveUser}
                  password={changePassword} remove={deleteUser} transactions={() => void openOrders(detail.user.id)}
                  close={() => setDetail(null)} />}
                {!detail && !creating && <Panel title="Account details"><div className="flex min-h-72 flex-col items-center justify-center gap-3 p-6 text-center"><Users size={28} strokeWidth={1.5} /><p className="font-mono text-[12px]">Select an account to manage</p><p className="text-[11px] text-ink-soft">Profile, access, plan, payments, and activity in one place.</p></div></Panel>}
              </div>
            </div>}

            {section === "orders" && <>
              <Panel title="Payment ledger" side={<Badge>{orders?.total ?? 0} orders</Badge>}>
                <div className="flex flex-wrap gap-2 p-4">
                  {orderFilter && <button type="button" className={action} onClick={() => { setOrderFilter(""); void run(() => loadOrders(1, "", orderStatus)); }}>User filter ×</button>}
                  <select aria-label="Filter by payment status" className={`${control} max-w-48`} value={orderStatus} onChange={(event) => { setOrderStatus(event.target.value); void run(() => loadOrders(1, orderFilter, event.target.value)); }}>
                    <option value="">All statuses</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="refunded">Refunded</option><option value="failed">Failed</option>
                  </select>
                </div>
                <OrdersPanel orders={orders?.orders ?? []} onUser={(id) => void run(() => loadDetail(id))} title="Transactions" compact />
                <div className="flex items-center justify-between p-4 font-mono text-[11px]">
                  <span>Page {orders?.page ?? 1} / {Math.max(1, Math.ceil((orders?.total ?? 0) / 25))}</span>
                  <div className="flex gap-2"><button aria-label="Previous orders page" className={action} disabled={!orders || orders.page <= 1 || busy} onClick={() => void run(() => loadOrders((orders?.page ?? 1) - 1))}><ArrowLeft size={13} /></button>
                    <button aria-label="Next orders page" className={action} disabled={!orders || orders.page * 25 >= orders.total || busy} onClick={() => void run(() => loadOrders((orders?.page ?? 1) + 1))}><ArrowRight size={13} /></button></div>
                </div>
              </Panel>
            </>}

            {section === "activity" && <Panel title="Recent admin activity" side={<Badge tone="purple">Audit trail</Badge>}>
              <div className="divide-y divide-edge/25">{overview.activity.map((event, index) => <div key={`${event.created_at}-${index}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Badge tone={event.action === "delete" ? "red" : event.action === "create" ? "green" : "purple"}>{event.action}</Badge>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{event.email} <span className="text-ink-soft">by {event.actor ?? "deleted admin"}</span></span>
                <time className="font-mono text-[10px] text-ink-soft">{date(event.created_at)}</time>
              </div>)}{!overview.activity.length && <p className="p-5 font-mono text-[11px] text-ink-soft">No admin changes yet.</p>}</div>
            </Panel>}
            <footer className="flex justify-between border-t border-edge/30 pt-3 font-mono text-[10px] text-ink-soft"><span>Tingraph / Admin</span><Link href="/" className="underline">Back to site ↗</Link></footer>
          </div>
        </div>
      </div>
    </main>
  );
}

function OrdersPanel({ orders, onUser, title, compact = false }: { orders: Order[]; onUser: (id: string) => void; title: string; compact?: boolean }) {
  const content = <div className="overflow-x-auto"><table className="w-full min-w-[590px] text-left text-[11px]">
    <thead className="border-b border-edge bg-bone font-mono text-[10px] uppercase tracking-wider"><tr><th className="px-4 py-3">Account</th><th className="px-3 py-3">Provider</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Amount</th><th className="px-4 py-3">Date</th></tr></thead>
    <tbody className="divide-y divide-edge/20">{orders.map((order) => <tr key={order.id} className="hover:bg-bone"><td className="px-4 py-3"><button type="button" onClick={() => onUser(order.user_id)} className="max-w-48 truncate text-left font-mono font-semibold underline underline-offset-2">{order.email}</button></td>
      <td className="px-3 py-3 font-mono capitalize">{order.provider}<span className="block max-w-24 truncate text-[9px] text-ink-soft" title={order.payment_id || order.provider_id || order.id}>{order.payment_id || order.provider_id || order.id}</span></td><td className="px-3 py-3"><Badge tone={order.status === "paid" ? "green" : order.status === "refunded" || order.status === "failed" ? "red" : "neutral"}>{order.status}</Badge></td>
      <td className="px-3 py-3 whitespace-nowrap font-mono font-semibold">{money(order.amount, order.currency)}</td><td className="whitespace-nowrap px-4 py-3 font-mono text-ink-soft">{date(order.refunded_at || order.paid_at || order.created_at)}</td></tr>)}
    </tbody>
  </table>{!orders.length && <p className="p-6 text-center font-mono text-[11px] text-ink-soft">No transactions yet.</p>}</div>;
  return compact ? content : <Panel title={title} side={<Badge>{orders.length} shown</Badge>}>{content}</Panel>;
}

function UserDetail({ detail, self, busy, save, password, remove, transactions, close }: {
  detail: Detail; self: boolean; busy: boolean;
  save: (event: FormEvent<HTMLFormElement>) => void;
  password: (event: FormEvent<HTMLFormElement>) => void;
  remove: () => void;
  transactions: () => void;
  close: () => void;
}) {
  const { user, profile } = detail;
  const fields = ["username", "full_name", "profession", "affiliation", "location", "website", "bio"] as const;
  return <>
    <Panel title="Account details" side={<button type="button" aria-label="Close account details" onClick={close}><X size={16} /></button>}>
      <div className="flex flex-wrap items-center gap-2 border-b border-edge/25 p-4"><Badge tone={user.role === "admin" ? "purple" : "neutral"}>{user.role}</Badge><Badge tone={user.verified ? "green" : "red"}>{user.verified ? "Verified" : "Unverified"}</Badge><Badge tone={user.tier === "premium" ? "purple" : "neutral"}>{user.tier}</Badge><span className="ml-auto font-mono text-[10px] text-ink-soft">Joined {date(user.created_at)}</span></div>
      <form onSubmit={save} className="space-y-4 p-4">
        <Field label="Email"><input name="email" type="email" required defaultValue={user.email} className={control} /></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Role"><select name="role" defaultValue={user.role} disabled={self} className={control}><option value="user">User</option><option value="admin">Admin</option></select>{self && <input type="hidden" name="role" value="admin" />}</Field>
          <Field label="Plan"><select name="tier" defaultValue={user.tier} className={control}><option value="free">Free</option><option value="premium">Premium</option></select></Field></div>
        <Field label="Premium expires · blank = 30 days"><input name="premium_until" type="datetime-local" defaultValue={user.premium_until ? new Date(user.premium_until).toLocaleString("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(" ", "T") : ""} className={control} /></Field>
        <div className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px]"><label className="flex items-center gap-2"><input type="checkbox" name="verified" defaultChecked={user.verified} /> Email verified</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="disabled" defaultChecked={!!user.disabled_at} disabled={self} /> Disable account</label></div>
        <div className="border-t border-edge/30 pt-4"><h3 className="mb-3 font-mono text-[11px] font-bold uppercase">Profile</h3>
          <div className="grid gap-3 sm:grid-cols-2">{fields.map((field) => <Field key={field} label={PROFILE_FIELDS[field].label}>
            {field === "bio" ? <textarea name={field} defaultValue={profile[field] ?? ""} maxLength={PROFILE_FIELDS[field].max} rows={3} className={control} />
              : <input name={field} defaultValue={profile[field] ?? ""} maxLength={PROFILE_FIELDS[field].max} className={control} />}
          </Field>)}</div>
        </div>
        <button className={primary} disabled={busy}><Check size={14} /> Save changes</button>
      </form>
    </Panel>
    <Panel title="Usage & records">
      <div className="grid grid-cols-2 gap-2 p-4 font-mono text-[11px]"><span className="border border-edge p-2">{user.diagrams} diagrams</span><span className="border border-edge p-2">{user.orders} transactions</span><span className="border border-edge p-2">{detail.generations} generations</span><span className="border border-edge p-2">{detail.ai_tokens} AI tokens</span></div>
      <button type="button" className="mx-4 mb-4 font-mono text-[11px] underline" onClick={transactions}>View all transactions →</button>
      {detail.diagrams.length > 0 && <div className="border-t border-edge/25 px-4 py-3"><h3 className="mb-2 font-mono text-[10px] uppercase text-ink-soft">Saved diagrams</h3>{detail.diagrams.map((diagram) => <p key={diagram.id} className="truncate py-1 font-mono text-[11px]">{diagram.title} <span className="text-ink-soft">· {diagram.category}</span></p>)}</div>}
    </Panel>
    <Panel title="Security & removal">
      <form onSubmit={password} className="space-y-3 p-4"><Field label="Set new password"><input name="password" type="password" minLength={PASSWORD_MIN} required autoComplete="new-password" className={control} /></Field><button className={action} disabled={busy}>Set password & revoke sessions</button></form>
      <div className="border-t border-edge/25 p-4"><p className="mb-2 text-[11px] text-ink-soft">{user.orders ? "Payment history exists. Disable account instead of deleting it." : "Deletion removes account, sessions, and saved diagrams."}</p>
        <button type="button" className={`${action} text-alert`} disabled={busy || self || user.orders > 0} onClick={remove}>Delete account</button></div>
    </Panel>
  </>;
}
