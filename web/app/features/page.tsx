import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Sparkles } from "lucide-react";
import { DiagramArt } from "@/components/site/diagram-art";
import { SiteFooter, SiteNav } from "@/components/site/site-chrome";
import { FAMILIES, READY_DIAGRAMS } from "@/lib/diagrams";

export const metadata: Metadata = {
  title: "Features | Tingraph",
  description: "Explore Tingraph AI, code-to-diagram generation, an editable canvas, 16 notations, styling, saved diagrams and export options.",
};

const WORKFLOW = [
  {
    number: "01",
    label: "START WITH AN IDEA",
    title: "Write the source. Or ask AI to.",
    body: "Describe your idea to Tingraph AI and get diagram source in the notation you chose. Prefer to write it yourself? Start from a working example and follow the built-in syntax guide. Either way, you review the source before pressing Generate.",
    points: ["Plain-language AI assistance", "Examples and notation-specific syntax", "Errors with line numbers"],
    art: "mind",
    accent: "#e6eee7",
  },
  {
    number: "02",
    label: "LET IT TAKE SHAPE",
    title: "Layout without the busywork.",
    body: "Tingraph parses your source, arranges the elements and draws them onto the canvas. Spacing, routes, lanes and diagram-specific geometry are worked out for you, so you can focus on what the figure says.",
    points: ["Code-to-diagram generation", "Notation-aware layout", "Connectors that follow your edits"],
    art: "bpmn",
    accent: "#e5ebf3",
  },
  {
    number: "03",
    label: "MAKE IT YOURS",
    title: "A real canvas. Not a screenshot.",
    body: "Move elements, change labels, add shapes and connect them by hand. Edit figure data through its controls or directly on the sheet. Generated content is a starting point; the canvas stays yours to finish.",
    points: ["Editable shapes and captions", "Direct controls for charts and figures", "Your manual changes stay on the sheet"],
    art: "bar",
    accent: "#f2e9df",
  },
];

export default function FeaturesPage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-bone">
        <section className="relative overflow-hidden border-b-2 border-edge bg-bone">
          <div aria-hidden="true" className="bracket-grid grid-fade absolute inset-0" />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1fr_0.94fr] lg:items-center lg:gap-16">
            <div className="site-enter">
              <span className="inline-block border-2 border-edge bg-white px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.12em]">THE TOOLKIT / 01</span>
              <h1 className="mt-8 max-w-[13ch] text-balance font-mono text-[clamp(2.6rem,6vw,5.3rem)] font-semibold leading-[1.02] tracking-[-0.065em] text-ink">
                From first line to final figure<span className="text-navy">.</span>
              </h1>
              <p className="mt-6 max-w-[52ch] text-[15px] leading-[1.8] text-ink-soft sm:text-base">
                Turn code or a prompt into an editable diagram. Keep it precise for a paper or report. Make it colorful, sketchy or playful when the project calls for it.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/editor" className="slab-tight press inline-flex min-h-12 items-center gap-2 bg-edge px-5 font-mono text-[13px] font-semibold text-bone">
                  Open the editor <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
                <Link href="/build" className="slab-tight press inline-flex min-h-12 items-center gap-2 bg-white px-5 font-mono text-[13px] font-semibold text-ink">
                  Explore diagrams <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>

            <div className="site-enter relative pb-5 pr-5 sm:pb-7 sm:pr-7" style={{ animationDelay: "120ms" }}>
              <div aria-hidden="true" className="absolute inset-5 border-2 border-edge bg-[#dce8df] sm:inset-7" />
              <div className="slab relative bg-white">
                <div className="flex items-center justify-between border-b-2 border-edge px-4 py-3 font-mono text-[10px] font-semibold tracking-[0.12em] sm:px-5">
                  <span>FIG. 01 / YOUR WORKFLOW</span><span>✦ TINGRAPH</span>
                </div>
                <div className="grid gap-0 sm:grid-cols-[0.82fr_1.18fr]">
                  <div className="flex flex-col justify-between border-b-2 border-edge bg-bone p-4 sm:border-b-0 sm:border-r-2 sm:p-5">
                    <div>
                      <span className="font-mono text-[10px] text-ink-soft">SOURCE / FLOW</span>
                      <pre className="mt-5 overflow-x-auto font-mono text-[10px] leading-[1.9] text-ink sm:text-[11px]">{'flow "Idea to figure" {\n  start A "Idea"\n  process B "Draft"\n  end C "Publish"\n  A -> B -> C\n}'}</pre>
                    </div>
                    <span className="mt-8 w-fit border border-edge bg-white px-2 py-1 font-mono text-[10px] font-semibold">EDITABLE SOURCE</span>
                  </div>
                  <div className="flex min-h-64 flex-col p-4 sm:p-5">
                    <span className="font-mono text-[10px] text-ink-soft">CANVAS / READY TO REFINE</span>
                    <div className="flex flex-1 items-center justify-center py-4"><DiagramArt id="flow" accent="forest" className="w-full max-w-sm" /></div>
                    <div className="flex justify-between border-t border-edge/20 pt-3 font-mono text-[10px] text-ink-soft"><span>DRAG · EDIT · STYLE</span><span>01 / 16</span></div>
                  </div>
                </div>
              </div>
              <span className="absolute bottom-0 right-0 border-2 border-edge bg-[#f1d483] px-3 py-2 font-mono text-[11px] font-semibold shadow-[3px_3px_0_var(--edge)]">YOUR FINISHING TOUCH →</span>
            </div>
          </div>
        </section>

        <div className="border-b-2 border-edge bg-edge text-bone">
          <div className="mx-auto grid max-w-6xl grid-cols-3 divide-x divide-white/25 px-4 sm:px-6">
            {[[String(READY_DIAGRAMS.length).padStart(2, "0"), "ready notations"], ["02", "ways to start"], ["01", "editable canvas"]].map(([value, label]) => (
              <div key={label} className="px-2 py-5 text-center sm:py-7"><strong className="block font-mono text-2xl tracking-tight sm:text-4xl">{value}</strong><span className="mt-1 block text-[10px] text-white/70 sm:text-[12px]">{label}</span></div>
            ))}
          </div>
        </div>

        <section className="border-b-2 border-edge bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-ink-soft">THE WORKFLOW / 01—03</p>
            <h2 className="mt-4 max-w-[19ch] text-balance font-mono text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-5xl">A shorter way from idea to diagram.</h2>
            <div className="mt-12 space-y-6">
              {WORKFLOW.map((item, index) => (
                <article key={item.number} className={`site-reveal slab grid bg-white lg:grid-cols-2 ${index % 2 ? "lg:[&>*:first-child]:order-2" : ""}`}>
                  <div className="flex flex-col p-6 sm:p-9 lg:p-12">
                    <span className="font-mono text-[11px] font-semibold tracking-[0.12em] text-ink-soft">{item.number} / {item.label}</span>
                    <h3 className="mt-8 max-w-[17ch] font-mono text-2xl font-semibold leading-tight tracking-[-0.04em] sm:text-3xl">{item.title}</h3>
                    <p className="mt-5 max-w-[55ch] text-[14px] leading-[1.8] text-ink-soft">{item.body}</p>
                    <ul className="mt-8 space-y-3 border-t-2 border-edge/15 pt-5">
                      {item.points.map((point) => <li key={point} className="flex items-start gap-3 text-[13px] font-medium"><Check size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{point}</li>)}
                    </ul>
                  </div>
                  <div className="flex min-h-64 items-center justify-center border-t-2 border-edge p-7 sm:min-h-80 sm:p-12 lg:border-l-2 lg:border-t-0" style={{ backgroundColor: item.accent }}>
                    <div className="w-full max-w-[420px] border-2 border-edge bg-white p-3 shadow-[7px_7px_0_var(--edge)] sm:p-5">
                      <div className="mb-4 flex items-center justify-between border-b border-edge/25 pb-2 font-mono text-[10px] font-semibold"><span>TINGRAPH / {item.number}</span><span>↗</span></div>
                      <DiagramArt id={item.art} className="h-48 w-full sm:h-56" />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b-2 border-edge bg-bone">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-ink-soft">YOUR OUTPUT / 04</p>
            <h2 className="mt-4 max-w-[20ch] text-balance font-mono text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">Formal by default. Anything but one-note.</h2>
            <p className="mt-5 max-w-[65ch] text-[14px] leading-[1.8] text-ink-soft">Clean outlines and readable labels suit papers, journals and reports. Choose another ink, set a custom color or switch between formal and sketched styles when you want the diagram to feel different.</p>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {[
                { n: "A", title: "Style the sheet", body: "Choose a formal or sketched hand, then select an ink or mix your own color.", bg: "bg-white", art: "venn" },
                { n: "B", title: "Export with control", body: "Preview your output and set its format, scale, padding and background. Export PNG, JPG, SVG or PDF, subject to your plan.", bg: "bg-[#e5ebf3]", art: "erd" },
                { n: "C", title: "Keep the whole work", body: "With an account, save private diagrams including the edits you made after generation. Come back and keep going.", bg: "bg-[#e6eee7]", art: "architecture" },
              ].map((card) => (
                <article key={card.n} className="site-reveal slab flex flex-col bg-white">
                  <div className={`flex h-44 items-center justify-center border-b-2 border-edge p-5 ${card.bg}`}><DiagramArt id={card.art} className="h-full w-full" /></div>
                  <div className="flex flex-1 flex-col p-6"><span className="font-mono text-[11px] font-semibold">/ {card.n}</span><h3 className="mt-4 font-mono text-xl font-semibold tracking-tight">{card.title}</h3><p className="mt-3 text-[13px] leading-[1.8] text-ink-soft">{card.body}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b-2 border-edge bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-ink-soft">THE LIBRARY / 05</p><h2 className="mt-4 font-mono text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">A notation for the job.</h2><p className="mt-4 max-w-[60ch] text-[14px] leading-relaxed text-ink-soft">From workflows and systems to data and ideas. Every one starts with a working example.</p></div><Link href="/build" className="slab-tight press inline-flex items-center gap-2 bg-white px-4 py-3 font-mono text-[12px] font-semibold">Browse all {READY_DIAGRAMS.length} <ArrowRight size={15} aria-hidden="true" /></Link></div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FAMILIES.map((family, index) => {
                const diagrams = READY_DIAGRAMS.filter((diagram) => diagram.family === family);
                return <div key={family} className="site-reveal border-2 border-edge bg-bone p-5" style={{ animationDelay: `${index * 70}ms` }}><span className="font-mono text-[11px] font-semibold text-ink-soft">0{index + 1} / {String(diagrams.length).padStart(2, "0")}</span><h3 className="mt-7 font-mono text-xl font-semibold">{family}</h3><ul className="mt-4 space-y-2 border-t border-edge/20 pt-4">{diagrams.map((diagram) => <li key={diagram.id}><Link href={`/editor?type=${diagram.id}`} className="group flex items-center justify-between gap-2 text-[13px] text-ink-soft hover:text-ink">{diagram.name}<ArrowUpRight size={13} className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" /></Link></li>)}</ul></div>;
              })}
            </div>
          </div>
        </section>

        <section className="bg-edge text-bone"><div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6 sm:py-20 md:flex-row md:items-center md:justify-between"><div><Sparkles size={24} className="text-[#f1d483]" aria-hidden="true" /><h2 className="mt-5 max-w-[19ch] font-mono text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">Make the first draft. Own the final one.</h2><p className="mt-4 text-[14px] text-white/70">Start free. Go Premium when you need more room to make and save.</p></div><div className="flex flex-wrap gap-3"><Link href="/editor" className="press border-2 border-bone bg-bone px-5 py-3 font-mono text-[13px] font-semibold text-ink shadow-[5px_5px_0_#505050]">Open editor ↗</Link><Link href="/checkout" className="border-2 border-[#f1d483] px-5 py-3 font-mono text-[13px] font-semibold text-[#f1d483] hover:bg-[#f1d483] hover:text-ink">Go Premium →</Link></div></div></section>
      </main>
      <SiteFooter />
    </>
  );
}
