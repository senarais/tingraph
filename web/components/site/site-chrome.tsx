import Link from "next/link";
import Image from "next/image";
import AccountButton from "@/components/account/account-button";
import PremiumPreview from "@/components/site/premium-preview";
import { POLICIES, SUPPORT_EMAIL, SUPPORT_PHONE } from "@/lib/legal";

const PAGES = [
  { href: "/features", label: "Features" },
  { href: "/support", label: "Support" },
] as const;

export function SiteNav() {
  return (
    <header className="sticky top-0 z-30 border-b-2 border-edge bg-bone">
      <nav className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6 md:flex-nowrap md:gap-6 md:py-0">
        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
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
        <Link href="/docs" className="border-l border-edge/25 py-1 pl-3 font-mono text-[12px] font-semibold text-ink underline-offset-4 hover:underline">Docs</Link>
        </div>

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
          <PremiumPreview />
          <Link
            href="/editor"
            className="slab-tight press flex min-h-10 items-center whitespace-nowrap bg-white px-2 font-mono text-[12.5px] font-semibold text-ink sm:px-3"
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
  const groups = [
    { title: "Product", links: [{ href: "/editor", label: "Open editor" }, { href: "/build", label: "Diagram library" }, { href: "/features", label: "Features" }, { href: "/#pricing", label: "Plans & pricing" }] },
    { title: "Learn", links: [{ href: "/docs", label: "Documentation" }, { href: "/docs/getting-started", label: "Getting started" }, { href: "/docs/tingraph-ai", label: "AI & copy prompts" }, { href: "/docs/saving-and-exporting", label: "Saving & exporting" }] },
    { title: "Tingraph", links: [{ href: "/about", label: "About" }, { href: "/support", label: "Support & contact" }, { href: "/security", label: "Security" }, { href: "/profile", label: "Your account" }] },
  ];

  return (
    <footer className="mt-12 border-t-2 border-edge bg-white sm:mt-16">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_2fr] lg:gap-16">
          <div>
            <Link href="/" className="inline-flex items-center gap-2 font-mono text-[17px] font-semibold text-ink"><Image src="/icon.png" alt="" width={1000} height={1000} sizes="32px" className="h-8 w-8 object-contain" />tingraph</Link>
            <p className="mt-4 max-w-sm text-[13px] leading-[1.8] text-ink-soft">Code to diagram, then yours to edit. An independent tool from Indonesia for clear workflows, systems, data and ideas.</p>
            <address className="mt-5 space-y-2 text-[12px] not-italic text-ink-soft"><a href={`mailto:${SUPPORT_EMAIL}`} className="block break-all underline underline-offset-4 hover:text-ink">{SUPPORT_EMAIL}</a><a href={`tel:${SUPPORT_PHONE.replace(/[^+\d]/g, "")}`} className="block underline underline-offset-4 hover:text-ink">{SUPPORT_PHONE}</a></address>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3">{groups.map((group) => <nav key={group.title} aria-label={group.title}><h2 className="font-mono text-[12px] font-semibold">{group.title}</h2><ul className="mt-4 space-y-3">{group.links.map((link) => <li key={link.href}><Link href={link.href} className="text-[12px] text-ink-soft underline-offset-4 hover:text-ink hover:underline">{link.label}</Link></li>)}</ul></nav>)}</div>
        </div>
      </div>

      <div className="border-t-2 border-edge">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6"><nav aria-label="Legal and site information" className="flex flex-wrap gap-x-5 gap-y-3">{POLICIES.map((policy) => <Link key={policy.slug} href={`/${policy.slug}`} className="text-[11px] text-ink-soft underline-offset-4 hover:text-ink hover:underline">{policy.title}</Link>)}<Link href="/site-map" className="text-[11px] text-ink-soft underline-offset-4 hover:text-ink hover:underline">Site map</Link></nav><p className="font-mono text-[10px] text-ink-soft">© {new Date().getFullYear()} Tingraph. Start with code. Finish on your own terms.</p></div>
      </div>
    </footer>
  );
}
