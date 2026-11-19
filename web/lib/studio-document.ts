import type { InkChoice } from "@/lib/ink";
import type { Json } from "@/lib/json";
import { readInk, withSceneFiles } from "@/lib/saved-diagrams";
import type { SheetStyleId } from "@/lib/sheet";

/**
 * What a saved Studio sheet is, kept apart from the canvas code so that a page
 * which only lists or routes sheets does not load Excalidraw with it.
 */

/** The category a Studio sheet is saved under. It is not a notation. */
export const STUDIO_CATEGORY = "studio" as const;

/** What a new Studio sheet is called until the reader names it. */
export const UNTITLED_STUDIO = "Untitled studio";

/** What a Studio sheet is saved as: the editor's document with no source. */
export interface StudioDocument {
  version: 1;
  category: typeof STUDIO_CATEGORY;
  source: "";
  direction: "down";
  ink: InkChoice;
  style: SheetStyleId;
  scene: Json;
}

function record(value: Json | undefined): value is { [key: string]: Json | undefined } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Validate a saved Studio sheet before it reaches Excalidraw's restore. */
export function readStudioDocument(value: Json): StudioDocument | null {
  if (
    !record(value) ||
    value.version !== 1 ||
    value.category !== STUDIO_CATEGORY ||
    value.source !== "" ||
    value.direction !== "down" ||
    (value.style !== "formal" && value.style !== "playful") ||
    !record(value.scene)
  ) {
    return null;
  }
  const scene = withSceneFiles(value.scene);
  if (!record(scene) || !Array.isArray(scene.elements) || !record(scene.files)) {
    return null;
  }
  const ink = readInk(value.ink);
  if (!ink) {
    return null;
  }
  return { version: 1, category: STUDIO_CATEGORY, source: "", direction: "down", ink, style: value.style, scene };
}
