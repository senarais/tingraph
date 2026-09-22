import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DiagramArt } from "@/components/site/diagram-art";
import { SiteFooter, SiteNav } from "@/components/site/site-chrome";
import { ACCENTS, PLANNED_DIAGRAMS, READY_DIAGRAMS } from "@/lib/diagrams";

/**
 * The editor is built around one notation at a time — its shapes, its guide,
 * its rules — so the notation is chosen before the sheet opens rather than
 * swapped underneath it afterwards.
 */
export default function NotationPicker() {
  return (
    <>
      <SiteNav />

      <main className="flex-1 bg-bone font-mono">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="tick">Step 1 of 1</p>
          <h1 className="mt-3 max-w-2xl text-balance text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
            What are you drawing?
          </h1>
          <p className="mt-3 max-w-[54ch] font-mono text-[13.5px] leading-relaxed text-ink-soft">
            The editor sets itself up around your answer: the shape palette, the
            language guide and the rules on the sheet all come from the notation
            you pick here.
          </p>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {READY_DIAGRAMS.map((kind) => (
              <Link
                key={kind.id}
                href={`/editor?type=${kind.id}`}
                className="slab press redraw flex flex-col bg-white"
              >
                <div
                  className="flex h-44 items-center justify-center overflow-hidden border-b-2 border-edge px-5 py-4"
                  style={{ backgroundColor: ACCENTS[kind.accent].wash }}
                >
                  <DiagramArt
                    id={kind.id}
                    accent={kind.accent}
                    className="h-full w-full"
                  />
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-[16px] font-semibold tracking-tight text-ink">
                      {kind.name}
                    </h2>
                    <code className="border border-edge bg-bone px-1.5 py-0.5 text-[10.5px] text-ink">
                      {kind.keyword}
                    </code>
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
                    {kind.summary}
                  </p>
                  <span className="mt-auto flex items-center gap-1.5 pt-4 text-[12.5px] font-semibold text-ink">
                    Open the editor
                    <ArrowRight size={13} />
                  </span>
                </div>
              </Link>
            ))}
          </div>

          <div className="slab mt-10 bg-white">
            <div className="flex items-center gap-3 border-b-2 border-edge bg-bone px-4 py-2.5">
              <span className="text-[12px] font-semibold text-ink">
                Not drawable yet
              </span>
              <span className="ml-auto text-[11px] text-ink-soft">
                {PLANNED_DIAGRAMS.length} on the way
              </span>
            </div>
            <ul className="grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-4">
              {PLANNED_DIAGRAMS.map((kind) => (
                <li key={kind.id} className="bg-white px-4 py-3">
                  <span className="block text-[13px] font-medium text-ink-faint">
                    {kind.name}
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-relaxed text-ink-faint">
                    {kind.summary}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
