import dagre from "@dagrejs/dagre";
import type { Side } from "@/lib/canvas/connect";
import { findBackEdges, routeAll, spreadEnds } from "@/lib/layout/graph";
import { linesWidth, textWidth, wrapByWidth } from "@/lib/layout/text";
import type { AST, DSLEdge, DSLNode, PositionedAST, PositionedNode } from "@/lib/types";

/**
 * A block diagram, the engineer's kind: a control loop, a signal path, a
 * signal-flow graph.
 *
 * Signals run left to right along the forward path — input, summing junction,
 * the blocks, the takeoff point, the output — and come back right to left
 * underneath it. That is the arrangement every control textbook draws, and it
 * is not one a general graph layout finds by itself: a feedback block is fed
 * from the right of the loop and feeds its left, so a layout that ranks it by
 * its edges stands it to the right of the output.
 *
 * So the diagram is split in two. The **forward path** is every element on a
 * way from an input to an output without going backwards, laid out by dagre
 * across the page. A **feedback element** is one whose signals only go back:
 * it stands under the path, half way between where its loop leaves and where
 * it returns, and a loop nested inside a wider one stands nearer the path. A
 * loop leaves the path from the bottom and comes back up into the bottom of
 * its junction, which is how a minus sign under a junction reads.
 */

export const BLOCK_FONT_SIZE = 13;
export const BLOCK_LINE_HEIGHT = BLOCK_FONT_SIZE * 1.25;
export const SUM_SIZE = 30;
export const POINT_SIZE = 8;
export const NODE_SIZE = 10;
const MAX_LABEL = 140;
const MARGIN = 60;
/** between the forward path and the first row of feedback under it */
const UNDER = 56;
/** between two rows of feedback */
const ROW_GAP = 34;

export function wrapBlockLabel(label: string): string[] {
  return wrapByWidth(label, MAX_LABEL, BLOCK_FONT_SIZE);
}

export function blockShapeSize(node: DSLNode): { width: number; height: number } {
  switch (node.type) {
    case "sum":
      return { width: SUM_SIZE, height: SUM_SIZE };
    case "point":
      return { width: POINT_SIZE, height: POINT_SIZE };
    case "node":
      return { width: NODE_SIZE, height: NODE_SIZE };
    case "input":
    case "output":
      // a signal's name, standing where the signal starts or ends, with room
      // for the padding Excalidraw keeps round a bound caption
      return {
        width: Math.round(Math.max(32, textWidth(node.label, BLOCK_FONT_SIZE) + 24)),
        height: Math.round(BLOCK_LINE_HEIGHT + 6),
      };
    default: {
      const lines = wrapBlockLabel(node.label);
      return {
        width: Math.round(Math.max(72, linesWidth(lines, BLOCK_FONT_SIZE) + 32)),
        height: Math.round(Math.max(42, lines.length * BLOCK_LINE_HEIGHT + 22)),
      };
    }
  }
}

type Sides = { fromSide?: Side; toSide?: Side };

export function computeBlockLayout(ast: AST): PositionedAST {
  const indexed = ast.edges.map((edge, index) => ({ from: edge.from, to: edge.to, index }));
  // the loops are found from the inputs, so the forward path runs from them
  const inputs = ast.nodes.filter((node) => node.type === "input");
  const ordered = [...inputs, ...ast.nodes.filter((node) => node.type !== "input")];
  const back = findBackEdges(ordered, indexed);

  // --- which elements only send signals back: the feedback elements
  const feedback = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const node of ast.nodes) {
      if (feedback.has(node.id) || node.type === "input" || node.type === "output") continue;
      const out = ast.edges.map((edge, index) => ({ edge, index })).filter(({ edge }) => edge.from === node.id);
      if (out.length > 0 && out.every(({ edge, index }) => back.has(index) || feedback.has(edge.to))) {
        feedback.add(node.id);
        changed = true;
      }
    }
  }

  // --- the forward path, across the page
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({ rankdir: "LR", nodesep: 46, ranksep: 64, marginx: MARGIN, marginy: MARGIN });
  graph.setDefaultEdgeLabel(() => ({}));
  const sizes = new Map(ast.nodes.map((node) => [node.id, blockShapeSize(node)]));
  for (const node of ast.nodes) {
    if (!feedback.has(node.id)) graph.setNode(node.id, { ...sizes.get(node.id)! });
  }
  ast.edges.forEach((edge, index) => {
    if (back.has(index) || feedback.has(edge.from) || feedback.has(edge.to)) return;
    // room on the line for the signal's name, the way dagre leaves it
    graph.setEdge(
      edge.from,
      edge.to,
      edge.label ? { width: Math.min(110, textWidth(edge.label, 11) + 10), height: 16, labelpos: "c" } : {},
      `e${index}`,
    );
  });
  dagre.layout(graph);
  const placed = new Map<string, { x: number; y: number }>();
  for (const node of ast.nodes) {
    if (feedback.has(node.id)) continue;
    const laid = graph.node(node.id);
    const size = sizes.get(node.id)!;
    placed.set(node.id, { x: Math.round(laid.x - size.width / 2), y: Math.round(laid.y - size.height / 2) });
  }
  const centreX = (id: string) => (placed.get(id)?.x ?? 0) + (sizes.get(id)?.width ?? 0) / 2;
  const pathBottom = Math.max(MARGIN, ...[...placed].map(([id, at]) => at.y + sizes.get(id)!.height));

  // --- the feedback elements, chain by chain, under the path
  type Chain = { nodes: string[]; left: number; right: number };
  const chains: Chain[] = [];
  const claimed = new Set<string>();
  ast.edges.forEach((edge) => {
    if (feedback.has(edge.from) || !feedback.has(edge.to) || claimed.has(edge.to)) return;
    const nodes: string[] = [];
    let at: string | undefined = edge.to;
    let exit: string | undefined;
    while (at && feedback.has(at) && !claimed.has(at)) {
      nodes.push(at);
      claimed.add(at);
      const onward: DSLEdge | undefined = ast.edges.find((next) => next.from === at);
      at = onward?.to;
      if (at && !feedback.has(at)) exit = at;
    }
    const from = centreX(edge.from);
    const to = exit ? centreX(exit) : from - 200;
    chains.push({ nodes, left: Math.min(from, to), right: Math.max(from, to) });
  });
  // a feedback element with no forward way in still has to stand somewhere
  for (const node of ast.nodes) {
    if (feedback.has(node.id) && !claimed.has(node.id)) {
      chains.push({ nodes: [node.id], left: MARGIN, right: MARGIN + 200 });
      claimed.add(node.id);
    }
  }
  // the narrowest loop stands nearest the path; a wider one round it
  chains.sort((a, b) => a.right - a.left - (b.right - b.left));
  const rows: Chain[][] = [];
  const rowOf = new Map<Chain, number>();
  for (const chain of chains) {
    let row = 0;
    while ((rows[row] ?? []).some((other) => chain.left < other.right && other.left < chain.right)) row += 1;
    (rows[row] ??= []).push(chain);
    rowOf.set(chain, row);
  }
  const rowHeights = rows.map((row) => Math.max(...row.flatMap((chain) => chain.nodes.map((id) => sizes.get(id)!.height))));
  for (const chain of chains) {
    const row = rowOf.get(chain)!;
    const top = pathBottom + UNDER + rowHeights.slice(0, row).reduce((sum, height) => sum + height + ROW_GAP, 0);
    // signals come back right to left, so the chain is set out that way
    chain.nodes.forEach((id, index) => {
      const size = sizes.get(id)!;
      const x = chain.right - ((index + 1) * (chain.right - chain.left)) / (chain.nodes.length + 1);
      placed.set(id, { x: Math.round(x - size.width / 2), y: Math.round(top + (rowHeights[row] - size.height) / 2) });
    });
  }

  const nodes: PositionedNode[] = ast.nodes.map((node) => ({
    ...node,
    ...sizes.get(node.id)!,
    ...placed.get(node.id)!,
    rank: feedback.has(node.id) ? 1 : 0,
  }));

  // --- which side each signal leaves and enters by
  const sides = (edge: DSLEdge, index: number): Sides => {
    const fromBack = feedback.has(edge.from);
    const toBack = feedback.has(edge.to);
    if (fromBack && toBack) return { fromSide: "left", toSide: "right" };
    if (!fromBack && toBack) return { fromSide: "bottom", toSide: "right" };
    if (fromBack && !toBack) return { fromSide: "left", toSide: "bottom" };
    // a loop straight back along the path, with nothing on it, goes under it
    if (back.has(index)) return { fromSide: "bottom", toSide: "bottom" };
    return {};
  };
  const edges = ast.edges.map((edge, index) => ({ ...edge, ...sides(edge, index) }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return {
    category: ast.category,
    title: ast.title,
    nodes,
    edges: spreadEnds(
      routeAll(edges, byId, nodes, "block", "right", (edge) => ({
        ...(edge.fromSide ? { fromSide: edge.fromSide } : {}),
        ...(edge.toSide ? { toSide: edge.toSide } : {}),
      })),
      byId,
      "block",
    ),
  };
}
