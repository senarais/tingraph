"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getSession } from "@/lib/api/client";

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
