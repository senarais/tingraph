import Link from "next/link";
import Image from "next/image";
import AccountButton from "@/components/account/account-button";
import { READY_DIAGRAMS } from "@/lib/diagrams";

const PAGES = [
  { href: "/features", label: "Features" },
  { href: "/support", label: "Support" },
] as const;

export function SiteNav() {
  return (
    <header className="sticky top-0 z-30 border-b-2 border-edge bg-bone">
      <nav className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6 md:flex-nowrap md:gap-6 md:py-0">
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
          <span className="hidden sm:inline">tingraph</span>
        </Link>

        <div className="order-3 flex w-full items-center gap-6 border-t border-edge/15 pt-2 md:order-none md:w-auto md:border-0 md:pt-0">
          {PAGES.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="py-1 font-mono text-[12px] font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
          <Link
            href="/checkout"
            className="slab-tight press flex min-h-10 items-center whitespace-nowrap bg-[#f1d483] px-2 font-mono text-[11px] font-semibold text-ink sm:px-3 sm:text-[12px]"
          >
            <span aria-hidden="true" className="mr-1.5 text-[15px] leading-none">✦</span>
            <span className="sm:hidden">Premium</span>
            <span className="hidden sm:inline">Go Premium</span>
          </Link>
          <Link
            href="/editor"
            className="slab-tight press flex min-h-10 items-center whitespace-nowrap bg-edge px-2 font-mono text-[12.5px] font-semibold text-bone sm:px-3"
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
            Code to diagram, then yours to edit. Make clean figures for papers
            and reports, or take a more playful direction.
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
                href="/features"
                className="text-[13px] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
              >
                Features
              </Link>
            </li>
            <li>
              <Link
                href="/support"
                className="text-[13px] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
              >
                Support
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t-2 border-edge">
        <p className="mx-auto max-w-6xl px-4 py-4 font-mono text-[11px] text-ink-faint sm:px-6">
          Start with code. Finish on your own terms.
        </p>
      </div>
    </footer>
  );
}
