import type { ChartSpec } from "@/lib/chart/spec";
import type { MindSpec } from "@/lib/mind/spec";
import type { MatrixSpec } from "@/lib/matrix/spec";
import type { VennSpec } from "@/lib/venn/spec";
import type { FishboneSpec } from "@/lib/fishbone/spec";

/**
 * A figure is a notation whose whole state is one object.
 *
 * The graph notations — flowchart, BPMN, org chart — are a bag of elements the
 * reader edits one at a time, and the sheet is the record of them. A figure is
 * the other thing: a chart, a mind map, a matrix, a Venn diagram, a fishbone.
 * Its marks are drawn *from* a spec rather than being the spec, so the sheet
 * carries that spec on one invisible frame element and every edit — from the
 * panel, from a handle on the sheet, or from the source — rewrites it and has
 * the figure drawn again.
 *
 * That is the only thing the figures share. Each one's geometry, language,
 * panel and handles are entirely its own, because a mind map and a pie chart
 * have nothing useful in common beyond "one object, drawn".
 */
export type FigureSpec =
  | ChartSpec
  | MindSpec
  | MatrixSpec
  | VennSpec
  | FishboneSpec;

/** Every figure says how big it is drawn, because every figure can be resized. */
export interface FigureSize {
  width: number;
  height: number;
}
