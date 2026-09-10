import type { Metadata } from "next";
import EditorShell from "@/components/editor/editor-shell";
import NotationPicker from "@/components/editor/notation-picker";
import { DiagramCategory } from "@/lib/types";

export const metadata: Metadata = {
  title: "Editor — Tingraph",
  description:
    "Pick a notation, write the source, watch the drawing follow, then edit it on the sheet and export a PNG, JPG, SVG or PDF.",
};

const CATEGORIES: DiagramCategory[] = ["flow", "bpmn", "org"];

function requested(value: string | string[] | undefined): DiagramCategory | undefined {
  return CATEGORIES.find((category) => category === value);
}

/**
 * `/editor` asks which notation first, because the editor is built around one
 * at a time. `/editor?type=flow` skips the question.
 */
export default async function EditorPage({ searchParams }: PageProps<"/editor">) {
  const { type } = await searchParams;
  const category = requested(type);
  // keyed on the notation: asking for another one opens a fresh sheet on it
  // rather than leaving the old drawing under a new palette
  return category ? (
    <EditorShell key={category} initialCategory={category} />
  ) : (
    <NotationPicker />
  );
}
