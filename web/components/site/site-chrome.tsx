import Link from "next/link";
import Image from "next/image";
import AccountButton from "@/components/account/account-button";
import { READY_DIAGRAMS } from "@/lib/diagrams";

/** Anchors on the landing page, written absolute so the bar works from /build. */
const SECTIONS = [
  { href: "/#diagrams", label: "Diagrams" },
  { href: "/#features", label: "Features" },
  { href: "/#how", label: "How it works" },
  { href: "/#faq", label: "FAQ" },
] as const;

export function SiteNav() {
  return (
    <header className="sticky top-0 z-30 border-b-2 border-edge bg-bone">
      <nav className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6 md:gap-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-mono text-[15px] font-semibold tracking-tight text-ink"
        >
          <Image
            src="/icon.png"
            alt=""
            width={1000}
            height={1000}
            sizes="28px"
            className="h-7 w-7 object-contain"
          />
          tingraph
        </Link>

        <div className="hidden items-center gap-5 md:flex">
          {SECTIONS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[13px] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Link
            href="/build?view=mine"
            className="slab-tight press whitespace-nowrap bg-white px-3 py-1.5 text-[12.5px] font-medium text-ink"
          >
            <span className="sm:hidden">Mine</span>
            <span className="hidden sm:inline">My diagrams</span>
          </Link>
          <Link
            href="/editor"
            className="slab-tight press whitespace-nowrap bg-edge px-3 py-1.5 font-mono text-[12.5px] font-semibold text-bone"
          >
            <span className="sm:hidden">Editor</span>
            <span className="hidden sm:inline">Open editor</span>
          </Link>
          <AccountButton />
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t-2 border-edge bg-bone">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2 font-mono text-[15px] font-semibold text-ink">
            <Image
              src="/icon.png"
              alt=""
              width={1000}
              height={1000}
              sizes="24px"
              className="h-6 w-6 object-contain"
            />
            tingraph
          </div>
          <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-ink-soft">
            Diagrams written as code, drawn to the conventions a journal, a
            thesis or a course report expects. Runs in your browser.
          </p>
        </div>

        <div>
          <h2 className="text-[13px] font-semibold text-ink">Notations</h2>
          <ul className="mt-3 space-y-2">
            {READY_DIAGRAMS.map((kind) => (
              <li key={kind.id}>
                <Link
                  href={`/editor?type=${kind.id}`}
                  className="text-[13px] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
                >
                  {kind.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-[13px] font-semibold text-ink">Go</h2>
          <ul className="mt-3 space-y-2">
            <li>
              <Link
                href="/build"
                className="text-[13px] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
              >
                All diagrams
              </Link>
            </li>
            <li>
              <Link
                href="/editor"
                className="text-[13px] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
              >
                Editor
              </Link>
            </li>
            <li>
              <Link
                href="/#faq"
                className="text-[13px] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
              >
                Questions
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t-2 border-edge">
        <p className="mx-auto max-w-6xl px-4 py-4 font-mono text-[11px] text-ink-faint sm:px-6">
          Nothing you write leaves the browser tab.
        </p>
      </div>
    </footer>
  );
}
