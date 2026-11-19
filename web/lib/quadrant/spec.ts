import type { FigureSize } from "@/lib/figures/spec";

/**
 * What a 2×2 quadrant is.
 *
 * Two axes crossed at their middles, each named and with its low and its high
 * end written on it, so the four quarters they make are read off the axes:
 * high impact and low effort is the top-left quarter, whatever it is called.
 * Each quarter carries a caption, and items may be plotted anywhere on the
 * field at a share of each axis, 0 at the low end and 100 at the high.
 *
 * This is the impact/effort chart, the Eisenhower matrix and the BCG matrix,
 * and every other chart that sorts things into four by two judgements.
 */

export type QuadrantCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** The quarters in the order the panel lists them: across the top, then the bottom. */
export const QUADRANT_CORNERS: QuadrantCorner[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

export interface QuadrantAxis {
  /** what the axis measures, written along it */
  label: string;
  /** the words at either end */
  low: string;
  high: string;
}

export interface QuadrantItem {
  label: string;
  /** a share of the across axis, 0 low to 100 high */
  x: number;
  /** a share of the up axis, 0 low to 100 high */
  y: number;
}

export type QuadrantStyleId = "outline" | "tint";

export const QUADRANT_STYLES: Array<{ id: QuadrantStyleId; name: string; hint: string }> = [
  { id: "outline", name: "Outline", hint: "ruled quarters, nothing filled" },
  { id: "tint", name: "Tinted", hint: "each quarter washed in its own hue" },
];

export interface QuadrantOptions extends FigureSize {
  style: QuadrantStyleId;
  /** the colour every plotted item takes */
  color: string;
  fontSize: number;
}

export interface QuadrantSpec {
  kind: "quadrant";
  title: string;
  x: QuadrantAxis;
  y: QuadrantAxis;
  /** the caption written in each quarter; one nobody named is left empty */
  quarters: Partial<Record<QuadrantCorner, string>>;
  items: QuadrantItem[];
  options: QuadrantOptions;
}

export function defaultQuadrantOptions(): QuadrantOptions {
  return { style: "outline", color: "#2a78d6", fontSize: 13, width: 560, height: 500 };
}

export function blankQuadrant(): QuadrantSpec {
  return {
    kind: "quadrant",
    title: "Impact and effort",
    x: { label: "Effort", low: "Low", high: "High" },
    y: { label: "Impact", low: "Low", high: "High" },
    quarters: {
      "top-left": "Quick wins",
      "top-right": "Major projects",
      "bottom-left": "Fill-ins",
      "bottom-right": "Thankless tasks",
    },
    items: [],
    options: defaultQuadrantOptions(),
  };
}

/** A share kept on the axis and to a whole number, the way the source writes it. */
export function clampShare(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}
