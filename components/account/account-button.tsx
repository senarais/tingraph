"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { accountsReady, createClient } from "@/lib/supabase/client";

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
  // undefined until the session has been read, so nothing flicks from "Sign in" to a face
  const [account, setAccount] = useState<Account | null | undefined>(undefined);

  useEffect(() => {
    if (!accountsReady) {
      return;
    }
    const supabase = createClient();
    const show = async (session: Session | null) => {
      if (!session) {
        setAccount(null);
        return;
      }
      const meta = session.user.user_metadata;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, username, avatar_url")
        .eq("id", session.user.id)
        .maybeSingle();
      setAccount({
        name: data?.full_name || data?.username || meta.full_name || session.user.email || "",
        avatar: data?.avatar_url ?? null,
      });
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") {
        return;
      }
      // Supabase warns against awaiting its own calls inside this callback,
      // so the work is put off until the callback has returned
      setTimeout(() => void show(session), 0);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!accountsReady) {
    return null;
  }
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
  return (
    <Link
      href="/profile"
      {...away}
      title={account.name || "Your profile"}
      aria-label="Your profile"
      className="press shrink-0 rounded-full shadow-[3px_3px_0_var(--edge)]"
    >
      <Avatar url={account.avatar} name={account.name} className="h-8 w-8 text-[12px]" />
    </Link>
  );
}
