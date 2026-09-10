import { newElementWith } from "@excalidraw/excalidraw";
import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
} from "@excalidraw/excalidraw/element/types";
import { unitOf } from "@/lib/canvas/units";
import { typeset } from "@/lib/canvas/text-metrics";
import type { Ink } from "@/lib/ink";
import type { SheetStyle } from "@/lib/sheet";

/**
 * Everything that writes a change into the scene: a new ink, a new drawing
 * style, or one setting from the properties panel. None of them redraw from
 * the source, so a shape the reader moved, retyped or dropped by hand
 * survives all three.
 */

type Elements = readonly ExcalidrawElement[];

function isText(element: ExcalidrawElement): element is ExcalidrawTextElement {
  return element.type === "text";
}

/** Swaps one ink for another: stroke for stroke, wash for wash. */
export function reink(elements: Elements, was: Ink, now: Ink): ExcalidrawElement[] {
  return elements.map((element) => {
    // a washed piece says so on itself, because the wash can be plain white —
    // the same colour half the drawing is already filled with
    if (unitOf(element)?.wash) {
      return newElementWith(element, { backgroundColor: now.tint });
    }
    const reinked = (colour: string) =>
      colour === was.color ? now.color : colour;
    return newElementWith(element, {
      strokeColor: reinked(element.strokeColor),
      backgroundColor: reinked(element.backgroundColor),
    });
  });
}

/**
 * Swaps the drawing style. Line wobble reaches everything; the font reaches
 * every caption, which is then measured again so it stays on its anchor; and a
 * corner radius reaches only the boxes whose notation leaves them free.
 */
export function restyle(elements: Elements, to: SheetStyle): ExcalidrawElement[] {
  const corner = to.corner > 0 ? { type: 3, value: to.corner } : null;
  return elements.map((element) => {
    const mark = unitOf(element);
    // the ported bpmn.io markers and outlines are notation, not decoration:
    // they keep their true lines here, the way the mapper draws them
    const marker = mark?.kind === "node" && !mark.core;
    const patch: Record<string, unknown> = marker ? {} : { roughness: to.roughness };
    if (mark?.soft) {
      patch.roundness = corner;
    }
    if (isText(element)) {
      Object.assign(patch, typeset(element, to.fontFamily, element.fontSize));
    }
    return Object.keys(patch).length === 0
      ? element
      : newElementWith(element, patch as never);
  });
}

// ------------------------------------------------------------------- editing

export interface StylePatch {
  strokeColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  roundness?: { type: number; value: number } | null;
  opacity?: number;
  fontFamily?: number;
  fontSize?: number;
  textAlign?: "left" | "center" | "right";
}

/** Pieces the panel writes shape settings to: markers ride along untouched. */
function owns(element: ExcalidrawElement): boolean {
  const mark = unitOf(element);
  return !mark || mark.core === true;
}

/**
 * Writes one change into the picked elements.
 *
 * A colour is swapped by value rather than assigned, the way re-inking the
 * sheet does, so a marker drawn in the same ink follows the shape while the
 * white fold inside a filled envelope stays white.
 */
export function applyStyle(
  elements: Elements,
  ids: Set<string>,
  patch: StylePatch,
  was: { strokeColor?: string } = {},
): ExcalidrawElement[] {
  const { strokeColor, fontFamily, fontSize, textAlign, ...box } = patch;
  return elements.map((element) => {
    if (element.isDeleted || !ids.has(element.id)) {
      return element;
    }
    const update: Record<string, unknown> = {};
    if (strokeColor && (!was.strokeColor || element.strokeColor === was.strokeColor)) {
      update.strokeColor = strokeColor;
    }
    if (isText(element)) {
      const caption = element;
      if (textAlign !== undefined) update.textAlign = textAlign;
      if (fontFamily !== undefined || fontSize !== undefined) {
        // the box has to be measured again, or the caption is cut short
        Object.assign(
          update,
          typeset(
            caption,
            fontFamily ?? caption.fontFamily,
            fontSize ?? caption.fontSize,
          ),
        );
      }
      if (box.opacity !== undefined) update.opacity = box.opacity;
    } else if (owns(element)) {
      Object.assign(update, box);
    } else if (box.opacity !== undefined) {
      update.opacity = box.opacity;
    }
    return Object.keys(update).length === 0
      ? element
      : newElementWith(element, update as never);
  });
}
