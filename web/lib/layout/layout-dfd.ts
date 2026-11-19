import dagre from "@dagrejs/dagre";
import { routeAll, spreadEnds } from "@/lib/layout/graph";
import { linesWidth, textWidth, wrapByWidth } from "@/lib/layout/text";
import type {
  AST,
  DSLNode,
  LayoutDirection,
  PositionedAST,
  PositionedNode,
} from "@/lib/types";

/**
 * A data flow diagram in Gane–Sarson notation, laid out.
 *
 * Three shapes and one line, and each shape is told from the others by its
 * outline alone: a process is a rounded box with its number in a band across
 * the top, an external entity is a plain square box, and a data store is a box
 * open on the right with its code in a cell on the left. The notation was
 * chosen over Yourdon's circles because a rounded box holds a sentence and a
 * circle does not.
 *
 * Where they go is dagre's job, over the flows. Two flows between the same
 * pair — a request and its answer — are two lines, and the router keeps the
 * second beside the first.
 */

export const DFD_FONT_SIZE = 13;
export const DFD_LINE_HEIGHT = DFD_FONT_SIZE * 1.25;
export const DFD_CODE_FONT_SIZE = 11.5;
/** the band along the top of a process that its number is written in */
export const DFD_BAND = 22;
/** the cell at the left of a data store that its code is written in */
export const DFD_CELL = 38;
const MAX_LABEL = 150;
const MARGIN = 60;

/** The caption inside a DFD shape, already wrapped. */
export function wrapDfdLabel(label: string): string[] {
  return wrapByWidth(label, MAX_LABEL, DFD_FONT_SIZE);
}

export function dfdShapeSize(node: DSLNode): { width: number; height: number } {
  const lines = wrapDfdLabel(node.label);
  const text = linesWidth(lines, DFD_FONT_SIZE);
  const rows = Math.max(1, lines.length);
  switch (node.type) {
    case "process":
      return {
        width: Math.round(Math.max(128, text + 36)),
        height: Math.round(Math.max(76, DFD_BAND + rows * DFD_LINE_HEIGHT + 26)),
      };
    case "store": {
      const cell = Math.max(DFD_CELL, textWidth(node.name ?? "", DFD_CODE_FONT_SIZE) + 16);
      return {
        width: Math.round(Math.max(150, cell + text + 32)),
        height: Math.round(Math.max(40, rows * DFD_LINE_HEIGHT + 20)),
      };
    }
    default:
      return {
        width: Math.round(Math.max(118, text + 36)),
        height: Math.round(Math.max(58, rows * DFD_LINE_HEIGHT + 30)),
      };
  }
}

/** How wide a store's code cell is, which the mapper draws the rule at. */
export function dfdCellWidth(node: DSLNode): number {
  return Math.round(
    Math.max(DFD_CELL, textWidth(node.name ?? "", DFD_CODE_FONT_SIZE) + 16),
  );
}

/**
 * The number a process and the code a store are drawn with when the source
 * gives none: processes count 1, 2, 3 and stores D1, D2, D3, in the order they
 * are declared. A level-1 sheet writes its own (`"1.1"`), and that wins.
 */
export function numberDfd(nodes: readonly DSLNode[]): DSLNode[] {
  let process = 0;
  let store = 0;
  return nodes.map((node) => {
    if (node.type === "process") {
      process += 1;
      return node.name ? node : { ...node, name: String(process) };
    }
    if (node.type === "store") {
      store += 1;
      return node.name ? node : { ...node, name: `D${store}` };
    }
    return node;
  });
}

export function computeDfdLayout(
  ast: AST,
  direction: LayoutDirection = "down",
): PositionedAST {
  const numbered = numberDfd(ast.nodes);
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({
    rankdir: direction === "right" ? "LR" : "TB",
    nodesep: 70,
    // room for a named flow to be read between two shapes
    ranksep: 120,
    marginx: MARGIN,
    marginy: MARGIN,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of numbered) {
    const size = dfdShapeSize(node);
    graph.setNode(node.id, { width: size.width, height: size.height });
  }
  ast.edges.forEach((edge, index) => {
    graph.setEdge(edge.from, edge.to, {}, `e${index}`);
  });
  dagre.layout(graph);

  const nodes: PositionedNode[] = numbered.map((node) => {
    const laid = graph.node(node.id);
    return {
      ...node,
      width: laid.width,
      height: laid.height,
      x: Math.round(laid.x - laid.width / 2),
      y: Math.round(laid.y - laid.height / 2),
      rank: 0,
    };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return {
    category: ast.category,
    title: ast.title,
    nodes,
    edges: spreadEnds(routeAll(ast.edges, byId, nodes, "dfd", direction), byId, "dfd"),
  };
}
