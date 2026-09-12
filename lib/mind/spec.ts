import type { PaletteId } from "@/lib/chart/spec";
import type { FigureSize } from "@/lib/figures/spec";

/**
 * What a mind map is.
 *
 * A mind map is one idea with things hanging off it, and the whole of it is a
 * tree of labels. Everything else — where a branch sits, what shape it is
 * drawn as, what colour it takes — is worked out from the tree unless the
 * reader has said otherwise on that one node, which is what makes the sheet
 * the main place to build one: pin a node where you want it and the rest goes
 * on arranging itself around it.
 *
 * Nothing here draws or measures, so all of it runs under `tsx`.
 */

/** What one node is drawn as. `none` is the label on its own. */
export type MindShape =
  | "round"
  | "pill"
  | "box"
  | "circle"
  | "diamond"
  | "hex"
  | "none";

export const MIND_SHAPES: Array<{ id: MindShape; name: string }> = [
  { id: "round", name: "Rounded" },
  { id: "pill", name: "Pill" },
  { id: "box", name: "Box" },
  { id: "circle", name: "Circle" },
  { id: "diamond", name: "Diamond" },
  { id: "hex", name: "Hexagon" },
  { id: "none", name: "Label only" },
];

/** How the branches are arranged around the idea in the middle. */
export type MindLayout = "radial" | "sides" | "down";

/** What joins a node to its parent. */
export type MindLine = "curve" | "elbow" | "straight";

export type MindStyleId = "formal" | "soft" | "bold" | "wire";

export interface MindStyle {
  id: MindStyleId;
  name: string;
  hint: string;
  /** weight of a node's outline */
  edgeWidth: number;
  /** weight of the line to its parent */
  lineWidth: number;
  /** the fill: the branch colour washed back this far towards paper, 0 is none */
  wash: number;
  /** the outline: the branch colour, or the sheet's ink */
  inkOutline: boolean;
}

/**
 * Four looks, and the first is the one a paper wants: black outlines, white
 * fills, colour carried by the lines alone. The coloured fills a mind map is
 * usually drawn with are `soft`, which is a choice rather than the default.
 */
export const MIND_STYLES: MindStyle[] = [
  {
    id: "formal",
    name: "Formal",
    hint: "black outlines on white, colour in the lines",
    edgeWidth: 1.5,
    lineWidth: 1.5,
    wash: 0,
    inkOutline: true,
  },
  {
    id: "soft",
    name: "Soft",
    hint: "washed fills, the colour of their branch",
    edgeWidth: 1.5,
    lineWidth: 1.5,
    wash: 0.72,
    inkOutline: false,
  },
  {
    id: "bold",
    name: "Bold",
    hint: "filled nodes, thick black outlines",
    edgeWidth: 2.5,
    lineWidth: 2,
    wash: 0.3,
    inkOutline: true,
  },
  {
    id: "wire",
    name: "Wire",
    hint: "no shapes at all, labels on their lines",
    edgeWidth: 0,
    lineWidth: 1.5,
    wash: 0,
    inkOutline: true,
  },
];

export function mindStyle(id: MindStyleId): MindStyle {
  return MIND_STYLES.find((entry) => entry.id === id) ?? MIND_STYLES[0];
}

/** A picture the reader put in place of a node's shape. */
export interface MindImage {
  /** the id Excalidraw files the picture under */
  fileId: string;
  width: number;
  height: number;
}

export interface MindNode {
  id: string;
  label: string;
  children: MindNode[];
  /** set only when this node is drawn differently from the rest */
  shape?: MindShape;
  color?: string;
  image?: MindImage;
  /** where the reader pinned it, measured from the middle of the map */
  at?: { x: number; y: number };
}

export interface MindOptions extends FigureSize {
  layout: MindLayout;
  shape: MindShape;
  line: MindLine;
  palette: PaletteId;
  /** the one colour `single` uses */
  color: string;
  style: MindStyleId;
  /** how far a level sits from the one above it */
  spread: number;
  /**
   * A branch keeps one colour all the way down, rather than every level taking
   * the next hue. This is what makes a mind map readable: the colour says
   * which branch you are in.
   */
  branchColors: boolean;
  fontSize: number;
}

export interface MindSpec {
  kind: "mind";
  title: string;
  root: MindNode;
  options: MindOptions;
}

export function defaultMindOptions(): MindOptions {
  return {
    layout: "radial",
    shape: "round",
    line: "curve",
    palette: "colorful",
    color: "#2a78d6",
    style: "formal",
    spread: 150,
    branchColors: true,
    fontSize: 13,
    width: 760,
    height: 560,
  };
}

// -------------------------------------------------------------- walking it

/** Every node in the map, parents before children. */
export function walkMind(node: MindNode, depth = 0): Array<{ node: MindNode; depth: number }> {
  return [
    { node, depth },
    ...node.children.flatMap((child) => walkMind(child, depth + 1)),
  ];
}

export function findMind(root: MindNode, id: string): MindNode | null {
  if (root.id === id) {
    return root;
  }
  for (const child of root.children) {
    const found = findMind(child, id);
    if (found) {
      return found;
    }
  }
  return null;
}

/** The node one is hanging off, or null for the idea in the middle. */
export function parentOf(root: MindNode, id: string): MindNode | null {
  for (const child of root.children) {
    if (child.id === id) {
      return root;
    }
    const found = parentOf(child, id);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * One node rewritten, and every other node left exactly as it was. A mind map
 * is edited a node at a time, and this is how each of those edits is made.
 */
export function rewriteMind(
  node: MindNode,
  id: string,
  change: (found: MindNode) => MindNode | null,
): MindNode | null {
  if (node.id === id) {
    return change(node);
  }
  return {
    ...node,
    children: node.children
      .map((child) => rewriteMind(child, id, change))
      .filter((child): child is MindNode => child !== null),
  };
}

/** A name nothing else in this map answers to. */
export function freshMindId(root: MindNode): string {
  const taken = new Set(walkMind(root).map((entry) => entry.node.id));
  let n = taken.size + 1;
  while (taken.has(`n${n}`)) {
    n += 1;
  }
  return `n${n}`;
}

export function blankMind(): MindSpec {
  return {
    kind: "mind",
    title: "Mind map",
    root: {
      id: "root",
      label: "Central idea",
      children: [
        { id: "n1", label: "First branch", children: [] },
        { id: "n2", label: "Second branch", children: [] },
        { id: "n3", label: "Third branch", children: [] },
      ],
    },
    options: defaultMindOptions(),
  };
}
