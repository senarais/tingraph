import type { FigureSize } from "@/lib/figures/spec";

/**
 * What a Sankey diagram is.
 *
 * A set of flows, each a quantity moving from one node to another, drawn as a
 * band whose width is that quantity on one scale for the whole diagram. A node
 * is as tall as what passes through it — the larger of what comes in and what
 * goes out — so a node that takes in more than it passes on shows the
 * difference, and a reader who wants the loss drawn writes it as a flow of its
 * own: `"Power station" -> "Losses" 70`. Nothing is made up to balance the
 * books; the diagram draws what it was told.
 *
 * Flows run one way. A Sankey with a loop in it has no left and right to lay
 * out, so the parser refuses one, the way a tree refuses two parents.
 */

export interface SankeyNode {
  /** the name it is written by in a flow, which is also what it is called */
  label: string;
  /** a colour the reader pinned on it */
  color?: string;
}

export interface SankeyFlow {
  /** indices into `nodes` */
  from: number;
  to: number;
  value: number;
}

export type SankeyPalette = "ink" | "colorful";

export interface SankeyOptions extends FigureSize {
  /** written after every value, e.g. "PJ", "kt", "$m"; empty for none */
  unit: string;
  /** a node's total written under its name */
  values: boolean;
  /** formal grey bands, or a hue per source carried along its flows */
  palette: SankeyPalette;
  fontSize: number;
}

export interface SankeySpec {
  kind: "sankey";
  title: string;
  nodes: SankeyNode[];
  flows: SankeyFlow[];
  options: SankeyOptions;
}

export function defaultSankeyOptions(): SankeyOptions {
  return { unit: "", values: true, palette: "ink", fontSize: 12, width: 760, height: 420 };
}

export function blankSankey(): SankeySpec {
  return {
    kind: "sankey",
    title: "Flows",
    nodes: [{ label: "Source" }, { label: "Used" }, { label: "Lost" }],
    flows: [
      { from: 0, to: 1, value: 70 },
      { from: 0, to: 2, value: 30 },
    ],
    options: defaultSankeyOptions(),
  };
}

/**
 * Whether the flows loop back on themselves, and where: the first flow that
 * closes a loop, or null when they all run one way.
 */
export function sankeyLoop(spec: SankeySpec): SankeyFlow | null {
  const out = new Map<number, SankeyFlow[]>();
  for (const flow of spec.flows) out.set(flow.from, [...(out.get(flow.from) ?? []), flow]);
  const state = new Map<number, 1 | 2>();
  let found: SankeyFlow | null = null;
  const visit = (node: number) => {
    state.set(node, 1);
    for (const flow of out.get(node) ?? []) {
      if (found) return;
      const seen = state.get(flow.to);
      if (seen === 1) {
        found = flow;
        return;
      }
      if (!seen) visit(flow.to);
    }
    state.set(node, 2);
  };
  spec.nodes.forEach((_, node) => {
    if (!state.has(node) && !found) visit(node);
  });
  return found;
}

/** A node taken out, with every flow that touched it, and the rest renumbered. */
export function dropNode(spec: SankeySpec, index: number): SankeySpec {
  const shift = (node: number) => (node > index ? node - 1 : node);
  return {
    ...spec,
    nodes: spec.nodes.filter((_, at) => at !== index),
    flows: spec.flows
      .filter((flow) => flow.from !== index && flow.to !== index)
      .map((flow) => ({ ...flow, from: shift(flow.from), to: shift(flow.to) })),
  };
}

/** Nodes no flow touches any more, taken out. */
export function withoutStrays(spec: SankeySpec): SankeySpec {
  let next = spec;
  for (let index = next.nodes.length - 1; index >= 0; index--) {
    if (!next.flows.some((flow) => flow.from === index || flow.to === index)) next = dropNode(next, index);
  }
  return next;
}
