import type { ReactNode } from "react";
import DocsSidebar from "@/components/site/docs-sidebar";
import { SiteFooter, SiteNav } from "@/components/site/site-chrome";
import { DOC_GUIDES, docHref } from "@/lib/docs";
import { FAMILIES, READY_DIAGRAMS } from "@/lib/diagrams";

export default function DocsLayout({ children }: { children: ReactNode }) {
  const groups = [
    { title: "Start here", links: DOC_GUIDES.slice(0, 2).map((guide) => ({ href: docHref(guide.slug), title: guide.title })) },
    { title: "Using Tingraph", links: DOC_GUIDES.slice(2).map((guide) => ({ href: docHref(guide.slug), title: guide.title })) },
    ...FAMILIES.map((family) => ({ title: `${family} diagrams`, links: READY_DIAGRAMS.filter((diagram) => diagram.family === family).map((diagram) => ({ href: `/docs/${diagram.id}`, title: diagram.name })) })),
  ];
  return <><a href="#docs-content" className="sr-only focus:not-sr-only focus:block focus:border-b-2 focus:border-edge focus:bg-white focus:px-4 focus:py-3 focus:font-mono focus:text-[12px]">Skip to documentation content</a><SiteNav /><div className="mx-auto grid w-full max-w-7xl flex-1 lg:grid-cols-[240px_minmax(0,1fr)]"><DocsSidebar groups={groups} /><main id="docs-content" className="min-w-0 bg-white">{children}</main></div><SiteFooter /></>;
}
