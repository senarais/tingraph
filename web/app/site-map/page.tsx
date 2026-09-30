import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteNav } from "@/components/site/site-chrome";
import { DOC_GUIDES, docHref } from "@/lib/docs";
import { READY_DIAGRAMS } from "@/lib/diagrams";
import { POLICIES } from "@/lib/legal";

export const metadata: Metadata = { title: "Site map | Tingraph", description: "Find product pages, documentation, every diagram guide, account pages and Tingraph policies." };

export default function SiteMapPage() {
  const groups = [
    { title: "Product & support", links: [{ href: "/", title: "Home" }, { href: "/features", title: "Features" }, { href: "/build", title: "Diagram library" }, { href: "/editor", title: "Editor" }, { href: "/about", title: "About" }, { href: "/support", title: "Support & contact" }] },
    { title: "Documentation", links: DOC_GUIDES.map((guide) => ({ href: docHref(guide.slug), title: guide.title })) },
    { title: "Account & plans", links: [{ href: "/login", title: "Sign in" }, { href: "/login?mode=signup", title: "Create account" }, { href: "/forgot-password", title: "Reset a password" }, { href: "/profile", title: "Your profile" }, { href: "/#pricing", title: "Plans & pricing" }, { href: "/checkout", title: "Premium checkout" }] },
    { title: "Policies & security", links: POLICIES.map((policy) => ({ href: `/${policy.slug}`, title: policy.title })) },
  ];
  return <><SiteNav /><main className="flex-1 bg-white"><div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20"><h1 className="font-mono text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">Find your way around.</h1><p className="mt-5 text-[14px] leading-relaxed text-ink-soft">Product, guides, account pages and policies, all in one place.</p><div className="mt-10 grid gap-6 sm:grid-cols-2">{groups.map((group) => <section key={group.title} className="border-2 border-edge bg-bone p-6"><h2 className="font-mono text-xl font-semibold tracking-tight">{group.title}</h2><ul className="mt-5 space-y-3">{group.links.map((link) => <li key={link.href}><Link href={link.href} className="text-[13px] text-ink-soft underline-offset-4 hover:text-ink hover:underline">{link.title}</Link></li>)}</ul></section>)}</div><section className="mt-8 min-w-0 border-2 border-edge bg-bone p-6"><h2 className="font-mono text-xl font-semibold tracking-tight">Diagram guides</h2><div className="mt-5 overflow-x-auto pb-3"><ul className="grid grid-flow-col grid-rows-5 auto-cols-[minmax(155px,1fr)] gap-x-6 gap-y-3">{READY_DIAGRAMS.map((diagram) => <li key={diagram.id}><Link href={`/docs/${diagram.id}`} className="whitespace-nowrap text-[13px] text-ink-soft underline-offset-4 hover:text-ink hover:underline">{diagram.name}</Link></li>)}</ul></div></section></div></main><SiteFooter /></>;
}
