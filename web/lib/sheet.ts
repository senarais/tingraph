/**
 * Two ways the same drawing can be drawn.
 *
 * The editor never offers a font on its own. A font, a stroke wobble and a
 * corner radius arrive together as one choice, so a sheet always reads as one
 * deliberate thing rather than a pile of settings. Everything the canvas is
 * allowed to vary per style lives in this file, and nowhere else.
 */

export type SheetStyleId = "formal" | "playful";

export interface SheetStyle {
  id: SheetStyleId;
  name: string;
  hint: string;
  /** Excalidraw font id — 2 is Helvetica, 5 is Excalifont */
  fontFamily: number;
  /** the unitless line height Excalidraw stores on a text element */
  lineHeight: number;
  /** 0 draws true lines; 1 lets the sketch renderer wobble them */
  roughness: number;
  /** corner radius for boxes the notation leaves free; 0 keeps them square */
  corner: number;
  /** the face itself, for asking the browser to load it before measuring */
  family: string;
  /** CSS stack, for measuring a caption outside the canvas */
  css: string;
}

export const SHEET_STYLES: SheetStyle[] = [
  {
    id: "formal",
    name: "Formal",
    hint: "True lines and a formal sans. What a journal expects.",
    fontFamily: 2,
    lineHeight: 1.15,
    roughness: 0,
    corner: 0,
    family: "Helvetica",
    css: "Helvetica, Segoe UI Emoji",
  },
  {
    id: "playful",
    name: "Playful",
    hint: "Sketched lines, handwritten labels, soft corners.",
    fontFamily: 5,
    lineHeight: 1.25,
    roughness: 1,
    corner: 14,
    family: "Excalifont",
    css: "Excalifont, Xiaolai, Segoe UI Emoji",
  },
];

export const DEFAULT_SHEET_STYLE: SheetStyleId = "formal";

export function styleFor(id: SheetStyleId): SheetStyle {
  return SHEET_STYLES.find((entry) => entry.id === id) ?? SHEET_STYLES[0];
}

/** The style every drawing is built in unless the reader picks the other one. */
export const FORMAL = styleFor("formal");
