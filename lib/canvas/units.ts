/**
 * A Tingraph element (a task with its marker, a pool with its header band, a
 * flow with its caption) is drawn as several Excalidraw shapes. The mark below
 * is stamped on each piece so the canvas can keep them behaving as one shape:
 * the group is re-formed whenever it is broken, and only pieces flagged `core`
 * can be reached on their own, so a caption stays editable while the marker
 * strokes never become a separate selection.
 */

import type { Side } from "@/lib/canvas/connect";

export type UnitKind = "node" | "edge" | "pool" | "lane";

/** One end of a connector: the element it is tied to, and the side it uses. */
export interface LinkEnd {
  /** a unit name, or an element id when the shape it points at has no unit */
  unit: string;
  /** set only when the reader chose the side themselves */
  side?: Side;
}

/**
 * What makes a connector Tingraph's rather than Excalidraw's. The two ends
 * name what they join, and the route between them is cut by
 * `lib/canvas/connect.ts` rather than by Excalidraw's binding, which is what
 * keeps a reporting line leaving the bottom of a box and meeting the top of
 * the next one instead of sliding around the outline.
 */
export interface LinkMark {
  /** which of the notation's lines this is, from `lib/connectors.ts` */
  line: string;
  from: LinkEnd;
  to: LinkEnd;
  /** where the reader dragged the middle leg to, on its own axis */
  bend?: number | null;
  /** the two boxes the route on the sheet was last cut against */
  at?: string;
}

export interface UnitMark {
  /** group id shared by every piece of this element */
  unit: string;
  kind: UnitKind;
  /** a piece the reader may pick inside the element (the caption carrier) */
  core?: true;
  /** a piece filled with the ink's wash, so re-inking can find it by name */
  wash?: true;
  /** a box whose corners the notation leaves free, so a style may round them */
  soft?: true;
  /** pool only: width of its own header band */
  band?: number;
  /** pool only: width of the header band its lanes use */
  laneBand?: number;
  /** edge only: the two ends this connector joins, and how it is routed */
  link?: LinkMark;
}

interface Marked {
  customData?: Record<string, unknown>;
}

export function unitOf(element: Marked): UnitMark | null {
  return (element.customData?.tingraph as UnitMark | undefined) ?? null;
}

/** Spread into a skeleton to stamp it as part of `mark.unit`. */
export function marked(mark: UnitMark): { customData: { tingraph: UnitMark } } {
  return { customData: { tingraph: mark } };
}
