import type { PaletteId } from "@/lib/chart/spec";
import type { FigureSize } from "@/lib/figures/spec";

/**
 * What a Venn diagram is.
 *
 * Two or three sets, and a label for each of the regions they make between
 * them. The regions are named by which sets they are in — `A`, `AB`, `ABC` —
 * so the language reads as the diagram does, and a region nobody named is
 * simply left empty rather than drawn as a blank.
 */

export type VennStyleId = "outline" | "tint" | "bold";

export interface VennStyle {
  id: VennStyleId;
  name: string;
  hint: string;
  /** how solid the fill is, 0 for none */
  fill: number;
  edgeWidth: number;
  /** the outline is the sheet's ink rather than the set's own colour */
  inkOutline: boolean;
}

export const VENN_STYLES: VennStyle[] = [
  {
    id: "outline",
    name: "Outline",
    hint: "black rings, nothing filled",
    fill: 0,
    edgeWidth: 1.5,
    inkOutline: true,
  },
  {
    id: "tint",
    name: "Tinted",
    hint: "washed fills, so the overlaps deepen",
    fill: 28,
    edgeWidth: 1.5,
    inkOutline: false,
  },
  {
    id: "bold",
    name: "Bold",
    hint: "thick black rings over washed fills",
    fill: 34,
    edgeWidth: 2.5,
    inkOutline: true,
  },
];

export function vennStyle(id: VennStyleId): VennStyle {
  return VENN_STYLES.find((entry) => entry.id === id) ?? VENN_STYLES[0];
}

export interface VennSet {
  /** the name written outside the ring */
  label: string;
  color?: string;
}

export interface VennOptions extends FigureSize {
  style: VennStyleId;
  palette: PaletteId;
  color: string;
  /** how far the rings sit into each other, 0 apart to 1 nearly on top */
  overlap: number;
  fontSize: number;
  /** a region with nothing in it is written as a nought rather than left blank */
  zeros: boolean;
}

export interface VennSpec {
  kind: "venn";
  title: string;
  /** two or three; a fourth is not a Venn diagram anybody can read */
  sets: VennSet[];
  /**
   * What is in each region, keyed by the sets it belongs to: `A`, `B`, `AB`,
   * `ABC`, and `out` for everything in none of them.
   */
  regions: Record<string, string>;
  options: VennOptions;
}

/** Every region two or three sets make, in the order they are written. */
export function vennRegions(count: number): string[] {
  return count >= 3
    ? ["A", "B", "C", "AB", "AC", "BC", "ABC"]
    : ["A", "B", "AB"];
}

export function defaultVennOptions(): VennOptions {
  return {
    style: "outline",
    palette: "single",
    color: "#1e1e1e",
    overlap: 0.5,
    fontSize: 13,
    width: 520,
    height: 460,
    zeros: false,
  };
}

export function blankVenn(): VennSpec {
  return {
    kind: "venn",
    title: "Venn diagram",
    sets: [{ label: "Set A" }, { label: "Set B" }, { label: "Set C" }],
    regions: { A: "126", B: "129", C: "128", AB: "32", AC: "33", BC: "30", ABC: "9" },
    options: defaultVennOptions(),
  };
}
