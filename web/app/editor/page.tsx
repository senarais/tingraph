import type { Metadata } from "next";
import { Suspense } from "react";
import EditorShell from "@/components/editor/editor-shell";
import Catalog from "@/components/site/catalog";
import { Mark } from "@/components/site/diagram-art";
import { SiteFooter, SiteNav } from "@/components/site/site-chrome";
import { PLANNED_DIAGRAMS, READY_DIAGRAMS } from "@/lib/diagrams";
import { starterFor } from "@/lib/templates";
import { DiagramCategory } from "@/lib/types";

export const metadata: Metadata = {
  title: "Diagrams | Tingraph",
  description:
    "Browse diagram notations, reopen your saved diagrams, and edit your work on the canvas.",
};

const CATEGORIES: DiagramCategory[] = [
  "flow",
  "bpmn",
  "org",
  "usecase",
  "activity",
  "sequence",
  "erd",
  "architecture",
  "class",
  "dfd",
  "state",
  "tree",
  "bar",
  "histogram",
  "line",
  "pie",
  "scatter",
  "mind",
  "matrix",
  "venn",
  "fishbone",
  "prisma",
  "quadrant",
  "gantt",
  "area",
  "waterfall",
  "funnel",
  "radar",
  "timeline",
  "sankey",
  "block",
];

function requested(value: string | string[] | undefined): DiagramCategory | undefined {
  return CATEGORIES.find((category) => category === value);
}

/**
 * `/editor` is the diagram library. A notation or saved-diagram query opens
 * the canvas directly, preserving existing editor links.
 */
export default async function EditorPage({ searchParams }: PageProps<"/editor">) {
  const { type, diagram, start, starter } = await searchParams;
  const category = requested(type);
  // a starter card opens its notation on the starter's source rather than the template
  const opening = category && typeof starter === "string" ? starterFor(category, starter) : undefined;
  const diagramId = typeof diagram === "string" ? diagram : undefined;
  // keyed on the notation: asking for another one opens a fresh sheet on it
  // rather than leaving the old drawing under a new palette
  if (category || diagramId) {
    return (
      <EditorShell
        key={`${category ?? "bpmn"}:${diagramId ?? "new"}:${opening?.id ?? ""}`}
        initialCategory={category ?? "bpmn"}
        diagramId={diagramId}
        starter={diagramId ? undefined : opening?.source}
        // the catalogue asks for the start dialog; a saved diagram never gets it
        start={start === "1" && !diagramId}
      />
    );
  }

  return (
    <>
      <SiteNav />

      <main className="flex-1 bg-bone">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
          <div
            className="border-2 border-edge bg-white"
            style={{ boxShadow: "8px 8px 0 var(--edge)" }}
          >
            <div className="flex items-center gap-3 border-b-2 border-edge bg-bone px-4 py-3">
              <Mark className="h-4 w-4 text-ink" />
              <span className="font-mono text-[12.5px] font-semibold text-ink">
                Diagram library
              </span>
              <span className="ml-auto font-mono text-[11.5px] text-ink-soft">
                {READY_DIAGRAMS.length} ready, {PLANNED_DIAGRAMS.length} planned
              </span>
            </div>

            <div className="p-5 sm:p-7">
              <h1 className="max-w-2xl font-mono text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
                Browse, build, and keep your work
              </h1>
              <p className="mt-3 max-w-[62ch] text-[14.5px] leading-relaxed text-ink-soft">
                Browse every notation Tingraph can draw, or sign in to reopen
                diagrams you saved from the editor. Saved work keeps its source,
                settings and every change made directly on the canvas.
              </p>

              <div className="mt-9">
                <Suspense
                  fallback={
                    <p className="slab bg-white p-6 text-[13.5px] text-ink-soft">
                      Opening diagram library…
                    </p>
                  }
                >
                  <Catalog />
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
