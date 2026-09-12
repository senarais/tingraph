import type { PaletteId } from "@/lib/chart/spec";
import type { FigureSize } from "@/lib/figures/spec";

/**
 * What a fishbone is.
 *
 * One effect, at the head, and the categories of cause that lead to it as
 * bones off the spine. Each bone carries its own causes, and a cause may carry
 * the causes behind it in turn — which is the whole method: keep asking what
 * is behind the thing you just wrote.
 */

export type FishboneStyleId = "formal" | "boxed" | "bold";

export interface FishboneStyle {
  id: FishboneStyleId;
  name: string;
  hint: string;
  /** the bone's name sits in a box rather than on the paper */
  boxedNames: boolean;
  spineWidth: number;
  boneWidth: number;
  /** the bones carry their own colour rather than the sheet's ink */
  coloured: boolean;
}

export const FISHBONE_STYLES: FishboneStyle[] = [
  {
    id: "formal",
    name: "Formal",
    hint: "black lines, names in boxes at the ends",
    boxedNames: true,
    spineWidth: 1.5,
    boneWidth: 1.5,
    coloured: false,
  },
  {
    id: "boxed",
    name: "Coloured",
    hint: "a colour per bone, names in filled boxes",
    boxedNames: true,
    spineWidth: 2,
    boneWidth: 1.5,
    coloured: true,
  },
  {
    id: "bold",
    name: "Bold",
    hint: "a heavy spine and bare names",
    boxedNames: false,
    spineWidth: 3,
    boneWidth: 2,
    coloured: false,
  },
];

export function fishboneStyle(id: FishboneStyleId): FishboneStyle {
  return FISHBONE_STYLES.find((entry) => entry.id === id) ?? FISHBONE_STYLES[0];
}

/** How the effect is drawn at the end of the spine. */
export type FishboneHead = "arrow" | "box" | "curve";

export interface FishboneCause {
  label: string;
  /** what is behind this cause in turn */
  causes: string[];
}

export interface FishboneBone {
  label: string;
  causes: FishboneCause[];
  color?: string;
}

export interface FishboneOptions extends FigureSize {
  style: FishboneStyleId;
  head: FishboneHead;
  palette: PaletteId;
  color: string;
  /** how steeply a bone leaves the spine, in degrees */
  angle: number;
  fontSize: number;
  /** an arrowhead where each cause meets its bone */
  arrows: boolean;
}

export interface FishboneSpec {
  kind: "fishbone";
  /** the effect, which is what the whole diagram is about */
  title: string;
  bones: FishboneBone[];
  options: FishboneOptions;
}

export function defaultFishboneOptions(): FishboneOptions {
  return {
    style: "formal",
    head: "arrow",
    palette: "single",
    color: "#1e1e1e",
    angle: 60,
    fontSize: 12,
    arrows: false,
    width: 820,
    height: 460,
  };
}

export function blankFishbone(): FishboneSpec {
  return {
    kind: "fishbone",
    title: "The effect",
    bones: [
      { label: "Method", causes: [{ label: "A cause", causes: [] }] },
      { label: "Machine", causes: [{ label: "A cause", causes: [] }] },
      { label: "Material", causes: [{ label: "A cause", causes: [] }] },
      { label: "People", causes: [{ label: "A cause", causes: [] }] },
    ],
    options: defaultFishboneOptions(),
  };
}
