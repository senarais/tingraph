import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Code2, Pencil, Shapes } from "lucide-react";
import { SiteFooter, SiteNav } from "@/components/site/site-chrome";
import { READY_DIAGRAMS } from "@/lib/diagrams";

export const metadata: Metadata = {
  title: "About | Tingraph",
  description: "An independent diagram tool from Indonesia: compact source, notation-aware layout and a canvas you can finish by hand.",
};

const PRINCIPLES = [
  { icon: Code2, title: "A readable starting point", body: "Write compact source, start from a working example or ask Tingraph AI to draft it. Review before generating." },
  { icon: Shapes, title: "Layout that knows the notation", body: `${READY_DIAGRAMS.length} ready notations cover processes, structures, data and ideas. Their layout and controls follow what each diagram actually needs.` },
  { icon: Pencil, title: "The finishing touches are yours", body: "Move, rename, connect and style the result. Saving keeps source and the finished canvas, rather than throwing away manual edits." },
];

export default function AboutPage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-bone">
        <section className="border-b-2 border-edge">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <p className="font-mono text-[11px] font-semibold tracking-[0.12em] text-ink-soft">About Tingraph</p>
            <h1 className="mt-6 max-w-[16ch] text-balance font-mono text-[clamp(2.5rem,6vw,5rem)] font-semibold leading-tight tracking-[-0.06em]">A first draft from code. A final figure from you.</h1>
            <p className="mt-6 max-w-[65ch] text-[15px] leading-[1.85] text-ink-soft">Tingraph is an independently operated diagram tool based in Indonesia. It turns a small text description into a real canvas, so you can spend less time arranging a first draft and more time communicating the idea.</p>
            <Link href="/docs/getting-started" className="slab-tight press mt-8 inline-flex items-center gap-3 bg-white px-5 py-3 font-mono text-[13px] font-semibold">Meet the workflow <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </section>

        <section className="border-b-2 border-edge bg-white">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 className="font-mono text-3xl font-semibold tracking-[-0.04em]">Built around the figure, not the busywork.</h2>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {PRINCIPLES.map((item) => {
                const Icon = item.icon;
                return <article key={item.title} className="slab bg-bone p-6"><Icon size={24} aria-hidden="true" /><h3 className="mt-5 font-mono text-xl font-semibold tracking-tight">{item.title}</h3><p className="mt-4 text-[13px] leading-[1.8] text-ink-soft">{item.body}</p></article>;
              })}
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2">
            <div>
              <h2 className="font-mono text-2xl font-semibold tracking-tight">Useful for papers. Open to other ideas.</h2>
              <p className="mt-4 text-[14px] leading-[1.85] text-ink-soft">Formal ink and readable labels are the default. The same sheet can take a sketchier or more colorful direction when a report, presentation or planning session calls for it. Tingraph uses Excalidraw for its editable canvas and provides its own notation-aware generation and controls.</p>
            </div>
            <div>
              <h2 className="font-mono text-2xl font-semibold tracking-tight">Clear about the service.</h2>
              <p className="mt-4 text-[14px] leading-[1.85] text-ink-soft">Start on the Free plan and purchase prepaid Premium when you need larger allowances. No automatic renewal. Read the docs for the product&apos;s behavior and the policies for how accounts, AI, data and payments work.</p>
              <div className="mt-5 flex flex-wrap gap-5 text-[13px] font-semibold"><Link href="/support" className="underline underline-offset-4">Talk to support</Link><Link href="/privacy" className="underline underline-offset-4">Privacy Policy</Link><Link href="/billing-policy" className="underline underline-offset-4">Billing & Refunds</Link></div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
