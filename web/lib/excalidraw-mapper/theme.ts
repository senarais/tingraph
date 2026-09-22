import type { DiagramCategory } from "@/lib/types";
import type { Ink } from "@/lib/ink";
import { FORMAL, type SheetStyle } from "@/lib/sheet";
import { BPMN_LABEL_FONT_SIZE } from "@/lib/layout/compute-layout";

/**
 * What every notation draws with before it draws anything of its own: the
 * stroke, the face, the line wobble and the corner radius the sheet is set to.
 *
 * It sits apart from the mappers so each notation's own file can read it
 * without reaching back into the one that dispatches to it.
 */

export const ACADEMIC_MONOCHROME_THEME = {
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 0,
  fontFamily: 2, // Helvetica — formal sans-serif for diagrams
  fontSize: 16,
  textAlign: "center",
  verticalAlign: "middle",
  opacity: 100,
} as const;

export const WHITE = "#ffffff";
export const CHROME_STROKE_WIDTH = 1.5;

/**
 * An org chart is drawn in plain black whatever the ink is, so that the wash
 * behind the role bands is the only colour on the sheet. The value is kept
 * apart from every ink preset on purpose: re-inking the sheet swaps ink for
 * ink and wash for wash, and these rules must sit out both swaps.
 */
export const ORG_STROKE = "#111827";

export interface Theme {
  strokeColor: string;
  /** wash behind highlighted text — the org band and its sub-role pills */
  tint: string;
  fontSize: number;
  fontFamily: number;
  lineHeight: number;
  /** 0 draws true lines, 1 wobbles them */
  roughness: number;
  /** corner radius for the boxes the notation leaves free */
  corner: number;
}

export function themeFor(
  ink: Ink,
  category: DiagramCategory,
  style: SheetStyle = FORMAL,
): Theme {
  return {
    strokeColor: category === "org" ? ORG_STROKE : ink.color,
    tint: ink.tint,
    fontFamily: style.fontFamily,
    lineHeight: style.lineHeight,
    roughness: style.roughness,
    corner: style.corner,
    fontSize: category === "bpmn" ? BPMN_LABEL_FONT_SIZE : 16,
  };
}

/** Corner setting for a box the notation lets the style round. */
export function softRoundness(theme: Theme) {
  return theme.corner > 0 ? { type: 3, value: theme.corner } : null;
}
