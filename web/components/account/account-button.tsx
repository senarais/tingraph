"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { APIError, apiFetch, clearSessionCache, getSession } from "@/lib/api/client";

/** A face, or the first letter of a name when there is no picture. */
export function Avatar({
  url,
  name,
  className,
}: {
  url: string | null;
  name: string;
  className: string;
}) {
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-edge bg-bone font-mono font-semibold text-ink ${className}`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      ) : (
        (Array.from(name.trim())[0] ?? "?").toUpperCase()
      )}
    </span>
  );
}

interface Account {
  name: string;
  avatar: string | null;
  role: "user" | "admin";
}

/** The ways in, which a sign-in should never be sent back to. */
const ACCOUNT_PATHS = ["/login", "/forgot-password", "/reset-password", "/auth"];

/**
 * The reader's way to their account, in the site's bar and the editor's.
 *
 * It asks the browser rather than the server: the pages it sits on are
 * prerendered, and reading a cookie on the server would make every one of them
 * render per request. What it shows is only a label; every page behind the
 * link checks the session again on the server.
 *
 * `detached` opens the account in a new tab, which is what the editor wants:
 * its drawing lives in memory, and a link followed in the same tab throws it
 * away.
 */
export default function AccountButton({ detached = false }: { detached?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  // undefined until the session has been read, so nothing flicks from "Sign in" to a face
  const [account, setAccount] = useState<Account | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    const show = async () => {
      const session = await getSession(true).catch(() => null);
      if (!alive) return;
      if (!session?.user) {
        setAccount(null);
        return;
      }
      const profile = session.user.profile;
      setAccount({
        name: profile.full_name || profile.username || session.user.email,
        avatar: profile.avatar_url,
        role: session.user.role,
      });
    };
    const refresh = () => void show();
    void show();
    window.addEventListener("tingraph:session", refresh);
    return () => {
      alive = false;
      window.removeEventListener("tingraph:session", refresh);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  if (account === undefined) {
    return <span aria-hidden="true" className="block h-8 w-8 shrink-0" />;
  }

  const away = detached ? { target: "_blank", rel: "noopener noreferrer" } : {};
  if (account === null) {
    const next =
      detached || ACCOUNT_PATHS.some((path) => pathname.startsWith(path)) ? "/profile" : pathname;
    return (
      <Link
        href={`/login?next=${encodeURIComponent(next)}`}
        {...away}
        className="slab-tight press whitespace-nowrap bg-white px-2 py-1.5 text-[12.5px] font-medium text-ink sm:px-3"
      >
        Sign in
      </Link>
    );
  }
  return <div ref={menu} className="relative shrink-0">
    <button ref={trigger} type="button" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
      className="press rounded-full shadow-[3px_3px_0_var(--edge)]">
      <Avatar url={account.avatar} name={account.name} className="h-8 w-8 text-[12px]" />
    </button>
    <div role="menu" className={`absolute right-0 top-full z-50 mt-3 w-52 origin-top-right border-2 border-edge bg-white p-1.5 shadow-[5px_5px_0_var(--edge)] transition-all duration-150 ${open ? "visible scale-100 opacity-100" : "invisible scale-95 opacity-0"}`}>
      <p className="truncate border-b border-edge/25 px-2 py-2 font-mono text-[11px] text-ink-soft">{account.name}</p>
      <Link role="menuitem" tabIndex={open ? 0 : -1} href="/profile" {...away} onClick={() => setOpen(false)} className="block px-2 py-2 text-[12px] hover:bg-bone">Profile</Link>
      {account.role === "admin" && <Link role="menuitem" tabIndex={open ? 0 : -1} href="/admin" {...away} onClick={() => setOpen(false)} className="block px-2 py-2 text-[12px] hover:bg-bone">Admin dashboard</Link>}
      <button role="menuitem" tabIndex={open ? 0 : -1} type="button" disabled={busy} className="w-full border-t border-edge/25 px-2 py-2 text-left text-[12px] hover:bg-bone disabled:opacity-50" onClick={async () => {
        setBusy(true); setProblem("");
        try {
          const response = await apiFetch("/api/v1/auth/logout", { method: "POST" });
          if (!response.ok && response.status !== 401) throw await APIError.from(response);
          clearSessionCache(); setAccount(null); setOpen(false);
          if (!detached) { router.replace("/"); router.refresh(); }
        } catch (error) { setProblem(error instanceof Error ? error.message : "Sign out failed."); }
        finally { setBusy(false); }
      }}>{busy ? "Signing out…" : "Sign out"}</button>
      {problem && <p role="alert" className="px-2 text-[11px] text-alert">{problem}</p>}
    </div>
  </div>;
}
