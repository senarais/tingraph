/**
 * A Tingraph element (a task with its marker, a pool with its header band, a
 * flow with its caption) is drawn as several Excalidraw shapes. The mark below
 * is stamped on each piece so the canvas can keep them behaving as one shape:
 * the group is re-formed whenever it is broken, and only pieces flagged `core`
 * can be reached on their own, so a caption stays editable while the marker
 * strokes never become a separate selection.
 */

export type UnitKind = "node" | "edge" | "pool" | "lane";

export interface UnitMark {
  /** group id shared by every piece of this element */
  unit: string;
  kind: UnitKind;
  /** a piece the reader may pick inside the element (the caption carrier) */
  core?: true;
  /** pool only: width of its own header band */
  band?: number;
  /** pool only: width of the header band its lanes use */
  laneBand?: number;
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
