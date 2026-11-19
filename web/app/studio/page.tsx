import type { Metadata } from "next";
import StudioShell from "@/components/studio/studio-shell";

export const metadata: Metadata = {
  title: "Studio | Tingraph",
  description:
    "A free sheet for drawing by hand in every Tingraph notation at once: flowcharts, BPMN, UML, ERDs, charts and more, side by side.",
};

/** Studio: a fresh sheet, or a saved one named by `?diagram=`. */
export default async function StudioPage({ searchParams }: PageProps<"/studio">) {
  const { diagram } = await searchParams;
  const diagramId = typeof diagram === "string" ? diagram : undefined;
  // keyed on the sheet: opening another one starts a fresh canvas
  return <StudioShell key={diagramId ?? "new"} diagramId={diagramId} />;
}
