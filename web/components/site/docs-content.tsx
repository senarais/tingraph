import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import CopyButton from "@/components/site/copy-button";
import { DiagramArt } from "@/components/site/diagram-art";
import { DOC_GUIDES, DIAGRAM_DOCS, docHref, type DocSection } from "@/lib/docs";
import { FAMILIES, FLOW_SAMPLE, READY_DIAGRAMS } from "@/lib/diagrams";
import { EXAMPLE, GUIDE_INTRO, GUIDE_SECTIONS, RULES, promptFor } from "@/lib/guide";

export function DocSections({ sections }: { sections: DocSection[] }) {
  return sections.map((section) => (
    <section key={section.id} id={section.id} className="scroll-mt-32 border-b border-edge/15 py-8 first:pt-0 last:border-0">
      <h2 className="font-mono text-2xl font-semibold tracking-[-0.04em]">{section.title}</h2>
      {section.paragraphs?.map((text) => <p key={text} className="mt-4 text-[14px] leading-[1.85] text-ink-soft">{text}</p>)}
      {section.steps && <ol className="mt-4 list-decimal space-y-3 pl-6 text-[14px] leading-[1.8] text-ink-soft marker:font-semibold marker:text-ink">{section.steps.map((text) => <li key={text} className="pl-1">{text}</li>)}</ol>}
      {section.bullets && <ul className="mt-4 list-disc space-y-3 pl-5 text-[14px] leading-[1.8] text-ink-soft marker:text-ink">{section.bullets.map((text) => <li key={text} className="pl-1">{text}</li>)}</ul>}
    </section>
  ));
}

function CodeExample({ source }: { source: string }) {
  return <div className="mt-5 overflow-hidden border-2 border-edge bg-bone"><div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-edge px-4 py-3"><span className="font-mono text-[11px] font-semibold">Tingraph source</span><CopyButton text={source} label="Copy example" /></div><pre className="select-text overflow-x-auto p-4 font-mono text-[12px] leading-[1.9] sm:p-5"><code>{source.trimEnd()}</code></pre></div>;
}

const DOC_ORDER = [...DOC_GUIDES.map((guide) => ({ slug: guide.slug, title: guide.title })), ...READY_DIAGRAMS.map((diagram) => ({ slug: diagram.id, title: diagram.name }))];

export default function DocsContent({ slug }: { slug: string }) {
  const guide = DOC_GUIDES.find((item) => item.slug === slug);
  const diagram = READY_DIAGRAMS.find((item) => item.id === slug);
  const category = diagram?.keyword;
  const details = category ? DIAGRAM_DOCS[category] : null;
  const title = guide?.title ?? diagram?.name;
  const sections = guide?.sections ?? [
    { id: "when-to-use", title: "When to use it" },
    { id: "working-example", title: "Working example" },
    { id: "syntax-reference", title: "Syntax reference" },
    { id: "language-rules", title: "Language rules" },
    { id: "editing", title: "Edit on the canvas" },
    { id: "ai-prompt", title: "Write it with an assistant" },
  ];
  const index = DOC_ORDER.findIndex((item) => item.slug === slug);
  const previous = DOC_ORDER[index - 1];
  const next = DOC_ORDER[index + 1];

  return (
    <article className="min-w-0 select-text px-4 py-10 sm:px-8 sm:py-12 lg:px-12">
      <header className="border-b-2 border-edge pb-8">
        <p className="font-mono text-[11px] text-ink-soft"><Link href="/docs" className="underline underline-offset-4">Documentation</Link>{diagram && <span> · {diagram.family}</span>}</p>
        <h1 className="mt-5 text-balance font-mono text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-tight tracking-[-0.055em]">{title}</h1>
        <p className="mt-4 max-w-[65ch] text-[15px] leading-[1.8] text-ink-soft">{guide?.description ?? (category ? GUIDE_INTRO[category] : "")}</p>
        <div className="mt-6 flex flex-wrap items-start gap-3">
          <Link href={diagram ? `/editor?type=${diagram.id}` : "/editor?type=flow"} className="slab-tight press inline-flex min-h-10 items-center gap-2 bg-edge px-4 py-2 font-mono text-[12px] font-semibold text-white">{diagram ? `Open ${diagram.name}` : "Open the editor"}<ArrowUpRight size={15} aria-hidden="true" /></Link>
          {category && <CopyButton text={promptFor(category)} label="Copy AI prompt" />}
        </div>
      </header>

      <nav aria-label="On this page" className="my-8 border-l-2 border-edge bg-bone p-4"><p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]">On this page</p><ul className="flex flex-wrap gap-x-5 gap-y-2">{sections.map((section) => <li key={section.id}><a href={`#${section.id}`} className="text-[12px] text-ink-soft underline-offset-4 hover:text-ink hover:underline">{section.title}</a></li>)}</ul></nav>

      {guide && <>
        <DocSections sections={slug === "getting-started" ? guide.sections.slice(0, 2) : guide.sections} />
        {slug === "getting-started" && <><section id="first-example" className="scroll-mt-32 border-b border-edge/15 py-8"><h2 className="font-mono text-2xl font-semibold tracking-tight">Your first example</h2><CodeExample source={FLOW_SAMPLE} /><Link href="/editor?type=flow" className="mt-5 inline-flex items-center gap-2 text-[13px] font-semibold underline underline-offset-4">Open flowchart editor <ArrowUpRight size={15} aria-hidden="true" /></Link></section><DocSections sections={guide.sections.slice(2)} /></>}
        {slug === "overview" && <>
          <section className="border-t border-edge/15 py-8"><h2 className="font-mono text-2xl font-semibold tracking-tight">Learn the workflow</h2><div className="mt-5 grid gap-4 sm:grid-cols-2">{DOC_GUIDES.slice(1).map((item) => <Link key={item.slug} href={docHref(item.slug)} className="slab-tight press bg-white p-5"><h3 className="font-mono text-[14px] font-semibold">{item.title} <span aria-hidden="true">↗</span></h3><p className="mt-3 text-[12px] leading-relaxed text-ink-soft">{item.description}</p></Link>)}</div></section>
          <section className="border-t border-edge/15 py-8"><h2 className="font-mono text-2xl font-semibold tracking-tight">Every diagram, documented</h2><div className="mt-5 grid gap-4 sm:grid-cols-2">{FAMILIES.map((family) => <div key={family} className="border-2 border-edge bg-bone p-5"><h3 className="font-mono text-[14px] font-semibold">{family}</h3><ul className="mt-4 space-y-3">{READY_DIAGRAMS.filter((item) => item.family === family).map((item) => <li key={item.id}><Link href={`/docs/${item.id}`} className="flex items-center justify-between gap-2 text-[13px] text-ink-soft hover:text-ink hover:underline">{item.name}<ArrowRight size={14} aria-hidden="true" /></Link></li>)}</ul></div>)}</div></section>
        </>}
      </>}

      {diagram && category && details && <>
        <section id="when-to-use" className="scroll-mt-32 border-b border-edge/15 pb-8"><h2 className="font-mono text-2xl font-semibold tracking-tight">When to use it</h2><p className="mt-4 text-[14px] leading-[1.85] text-ink-soft">{details.use}</p><div className="mt-5 border-2 border-edge bg-bone p-6"><DiagramArt id={diagram.id} accent={diagram.accent} className="mx-auto h-52 w-full max-w-lg" /></div><p className="mt-5 border-l-2 border-navy bg-[#e5ebf3] p-4 text-[13px] leading-relaxed text-ink">{details.tip}</p></section>
        <section id="working-example" className="scroll-mt-32 border-b border-edge/15 py-8"><h2 className="font-mono text-2xl font-semibold tracking-tight">Working example</h2><p className="mt-4 text-[14px] leading-relaxed text-ink-soft">Copy this complete example into the Source tab, then press Generate. Change its labels or values to make your first version.</p><CodeExample source={EXAMPLE[category]} /></section>
        <section id="syntax-reference" className="scroll-mt-32 border-b border-edge/15 py-8"><h2 className="font-mono text-2xl font-semibold tracking-tight">Syntax reference</h2><p className="mt-4 text-[14px] leading-relaxed text-ink-soft">The same reference used by the editor and AI briefing. Syntax is notation-specific; use the keywords listed here.</p>{GUIDE_SECTIONS[category].map((section) => <div key={section.title} className="mt-7"><h3 className="mb-3 font-mono text-[16px] font-semibold">{section.title}</h3><div className="overflow-x-auto border-2 border-edge"><table className="w-full border-collapse text-left text-[12px]"><thead className="border-b-2 border-edge bg-bone"><tr><th scope="col" className="px-4 py-3 font-mono">Syntax</th><th scope="col" className="px-4 py-3 font-mono">Meaning</th></tr></thead><tbody className="divide-y divide-edge/15">{section.rows.map((row) => <tr key={row.syntax}><td className="px-4 py-3 align-top"><code className="whitespace-pre font-mono text-[11px]">{row.syntax}</code></td><td className="min-w-48 px-4 py-3 leading-relaxed text-ink-soft">{row.meaning}</td></tr>)}</tbody></table></div></div>)}</section>
        <section id="language-rules" className="scroll-mt-32 border-b border-edge/15 py-8"><h2 className="font-mono text-2xl font-semibold tracking-tight">Language rules</h2><ul className="mt-4 list-disc space-y-3 pl-5 text-[13px] leading-[1.85] text-ink-soft">{RULES[category].map((rule) => <li key={rule}>{rule.replaceAll("`", "")}</li>)}</ul></section>
        <section id="editing" className="scroll-mt-32 border-b border-edge/15 py-8"><h2 className="font-mono text-2xl font-semibold tracking-tight">Edit on the canvas</h2><ul className="mt-4 list-disc space-y-3 pl-5 text-[14px] leading-[1.85] text-ink-soft">{details.editing.map((text) => <li key={text}>{text}</li>)}</ul><p className="mt-4 text-[14px] leading-[1.85] text-ink-soft">Generate replaces the drawing from source. Save before generating again if you want to preserve manual finishing touches.</p><Link href="/docs/saving-and-exporting" className="mt-4 inline-block text-[13px] font-semibold underline underline-offset-4">Read Saving & exporting</Link></section>
        <section id="ai-prompt" className="scroll-mt-32 py-8"><h2 className="font-mono text-2xl font-semibold tracking-tight">Write it with an assistant</h2><p className="mt-4 text-[14px] leading-[1.85] text-ink-soft">Tingraph AI already knows this notation. For another assistant, copy the tutorial below, describe your diagram under MY DIAGRAM, then paste the returned source into the editor. This prompt includes every syntax row, rule and working example above.</p><div className="mt-5"><CopyButton text={promptFor(category)} label="Copy AI prompt" /></div><details className="mt-5 border-2 border-edge bg-bone"><summary className="cursor-pointer px-4 py-3 font-mono text-[12px] font-semibold">Read the complete prompt</summary><pre className="select-text whitespace-pre-wrap break-words border-t-2 border-edge p-4 font-mono text-[11px] leading-[1.8]">{promptFor(category)}</pre></details><Link href="/docs/tingraph-ai" className="mt-4 inline-block text-[13px] font-semibold underline underline-offset-4">How AI requests, attachments and privacy work</Link></section>
      </>}

      <nav aria-label="Previous and next guide" className="mt-8 grid gap-4 border-t-2 border-edge pt-6 sm:grid-cols-2">
        {previous ? <Link href={docHref(previous.slug)} className="border-2 border-edge bg-bone p-4"><span className="flex items-center gap-2 font-mono text-[10px] text-ink-soft"><ArrowLeft size={13} aria-hidden="true" /> Previous</span><span className="mt-2 block text-[13px] font-semibold">{previous.title}</span></Link> : <span />}
        {next && <Link href={docHref(next.slug)} className="border-2 border-edge bg-bone p-4 sm:text-right"><span className="flex items-center gap-2 font-mono text-[10px] text-ink-soft sm:justify-end">Next <ArrowRight size={13} aria-hidden="true" /></span><span className="mt-2 block text-[13px] font-semibold">{next.title}</span></Link>}
      </nav>
      <p className="mt-6 text-[12px] text-ink-soft">Something unclear? <Link href="/support" className="font-semibold underline underline-offset-4">Contact support</Link> or read the <Link href="/privacy" className="underline underline-offset-4">Privacy Policy</Link>.</p>
    </article>
  );
}

export function isDocSlug(slug: string): boolean {
  return DOC_ORDER.some((item) => item.slug === slug);
}

export function docTitle(slug: string): string {
  return DOC_ORDER.find((item) => item.slug === slug)?.title ?? "Documentation";
}
