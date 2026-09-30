import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DocsContent, { docTitle, isDocSlug } from "@/components/site/docs-content";
import { DOC_GUIDES } from "@/lib/docs";
import { READY_DIAGRAMS } from "@/lib/diagrams";

export const dynamicParams = false;

export function generateStaticParams() {
  return [...DOC_GUIDES.filter((guide) => guide.slug !== "overview"), ...READY_DIAGRAMS.map((diagram) => ({ slug: diagram.id }))].map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: PageProps<"/docs/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${docTitle(slug)} | Tingraph Docs`, description: `Learn ${docTitle(slug)} in Tingraph, with instructions, working examples and notation-specific reference material.` };
}

export default async function DocPage({ params }: PageProps<"/docs/[slug]">) {
  const { slug } = await params;
  if (!isDocSlug(slug) || slug === "overview") notFound();
  return <DocsContent slug={slug} />;
}
