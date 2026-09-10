import type { Metadata } from "next";
import EditorShell from "@/components/editor-shell";
import { DiagramCategory } from "@/lib/types";

export const metadata: Metadata = {
  title: "Editor — Tingraph",
  description:
    "Write the source, watch the drawing follow, then edit it on the canvas and export a PNG or an SVG.",
};

const CATEGORIES: DiagramCategory[] = ["flow", "bpmn", "org"];

function requested(value: string | string[] | undefined): DiagramCategory | undefined {
  return CATEGORIES.find((category) => category === value);
}

/** `/editor?type=flow` opens on that notation's example instead of the default. */
export default async function EditorPage({ searchParams }: PageProps<"/editor">) {
  const { type } = await searchParams;
  return <EditorShell initialCategory={requested(type)} />;
}
