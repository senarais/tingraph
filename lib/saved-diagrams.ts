import { customInk, INK_PRESETS, type InkChoice } from "@/lib/ink";
import { detectCategory } from "@/lib/parser/parse-dsl";
import type { Json, Tables } from "@/lib/supabase/database.types";
import { TEMPLATES } from "@/lib/templates";
import type { SheetStyleId } from "@/lib/sheet";
import type { DiagramCategory, LayoutDirection } from "@/lib/types";

export const MAX_DIAGRAM_TITLE = 120;
export const MAX_DIAGRAM_SOURCE = 200_000;

export interface SavedDiagramDocument {
  version: 1;
  category: DiagramCategory;
  source: string;
  direction: LayoutDirection;
  ink: InkChoice;
  style: SheetStyleId;
  scene: Json;
}

export interface OpenedDiagram {
  id: string;
  title: string;
  document: SavedDiagramDocument;
}

export type SavedDiagramRow = Pick<
  Tables<"diagrams">,
  "id" | "title" | "category" | "document" | "created_at" | "updated_at"
>;

function record(value: Json | undefined): value is { [key: string]: Json | undefined } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Excalidraw omits `files` when a scene has no images. Persist an explicit map. */
export function withSceneFiles(value: Json, files: Json = {}): Json {
  return record(value) && value.files === undefined ? { ...value, files } : value;
}

export function isDiagramCategory(value: unknown): value is DiagramCategory {
  return typeof value === "string" && Object.hasOwn(TEMPLATES, value);
}

export function diagramTitle(value: string, fallback = "Untitled diagram"): string {
  const title = value.trim() || fallback;
  return Array.from(title).slice(0, MAX_DIAGRAM_TITLE).join("");
}

function readInk(value: Json | undefined): InkChoice | null {
  if (!record(value) || typeof value.id !== "string") {
    return null;
  }
  if (value.id === "custom") {
    return typeof value.color === "string" && /^#[\da-f]{6}$/i.test(value.color)
      ? customInk(value.color)
      : null;
  }
  const preset = INK_PRESETS.find((entry) => entry.id === value.id);
  return preset
    ? { id: preset.id, name: preset.name, color: preset.color, tint: preset.tint }
    : null;
}

/** Validate user-owned JSON before it reaches the editor or Excalidraw restore. */
export function readSavedDiagram(
  value: Json,
  expectedCategory?: string,
): SavedDiagramDocument | null {
  if (
    !record(value) ||
    value.version !== 1 ||
    !isDiagramCategory(value.category) ||
    (expectedCategory !== undefined && value.category !== expectedCategory) ||
    typeof value.source !== "string" ||
    value.source.length > MAX_DIAGRAM_SOURCE ||
    detectCategory(value.source) !== value.category ||
    (value.direction !== "down" && value.direction !== "right") ||
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
  return {
    version: 1,
    category: value.category,
    source: value.source,
    direction: value.direction,
    ink,
    style: value.style,
    scene,
  };
}
