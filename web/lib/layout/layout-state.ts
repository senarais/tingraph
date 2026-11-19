import dagre from "@dagrejs/dagre";
import { routeFlowEdges, spreadEnds } from "@/lib/layout/graph";
import { linesWidth, textWidth, wrapByWidth } from "@/lib/layout/text";
import type {
  AST,
  DSLNode,
  LayoutDirection,
  PositionedAST,
  PositionedNode,
} from "@/lib/types";

/**
 * A UML state machine diagram, laid out.
 *
 * A state is a rounded box. When it has internal activities — what runs on
 * entry, while it is in the state, and on exit — the name moves into a
 * compartment of its own and the activities are listed under a rule, one to a
 * line, as `entry / heater_on()`. Everything else on the sheet is a
 * pseudostate: the filled dot a machine starts from, the bullseye it ends on,
 * the diamond a transition branches at, and the bar it splits or joins at.
 *
 * It is ranked and routed the way a flowchart is, because a transition is a
 * line from one box to another and a state machine reads in the order its
 * transitions fire.
 */

export const STATE_FONT_SIZE = 13;
export const STATE_LINE_HEIGHT = STATE_FONT_SIZE * 1.25;
export const STATE_ROW_FONT_SIZE = 11.5;
export const STATE_ROW_HEIGHT = 19;
export const STATE_PAD_X = 12;
/** the compartment a state's name sits in when activities are listed under it */
export const STATE_NAME_BAND = 28;
export const STATE_DOT = 22;
export const STATE_FINAL = 26;
export const STATE_CHOICE = 40;
export const STATE_BAR_LENGTH = 110;
export const STATE_BAR_WEIGHT = 7;
const MAX_LABEL = 160;
const MARGIN = 60;

/** One internal activity as it is written in the box: `entry / lamp_on()`. */
export function stateActivity(entry: { label: string; name?: string }): string {
  return `${entry.label} / ${entry.name ?? ""}`;
}

export interface StateLayout {
  width: number;
  height: number;
  /** 0 when there are no activities, and the name fills the box */
  band: number;
  name: string[];
  rows: Array<{ text: string; top: number }>;
}

/** How one state box is cut up: its name, and the activities under it. */
export function stateBoxLayout(node: DSLNode): StateLayout {
  const name = wrapByWidth(node.label, MAX_LABEL, STATE_FONT_SIZE);
  const nameWidth = linesWidth(name, STATE_FONT_SIZE);
  const activities = node.entries ?? [];
  if (activities.length === 0) {
    return {
      width: Math.round(Math.max(110, nameWidth + 40)),
      height: Math.round(Math.max(46, Math.max(1, name.length) * STATE_LINE_HEIGHT + 24)),
      band: 0,
      name,
      rows: [],
    };
  }
  const band = Math.round(
    Math.max(STATE_NAME_BAND, Math.max(1, name.length) * STATE_LINE_HEIGHT + 12),
  );
  const rows = activities.map((entry, at) => ({
    text: stateActivity(entry),
    top: band + 6 + at * STATE_ROW_HEIGHT,
  }));
  const widest = Math.max(
    nameWidth + 40,
    ...rows.map((row) => textWidth(row.text, STATE_ROW_FONT_SIZE) + STATE_PAD_X * 2),
  );
  return {
    width: Math.round(Math.max(130, widest)),
    height: band + 12 + rows.length * STATE_ROW_HEIGHT,
    band,
    name,
    rows,
  };
}

export function stateShapeSize(
  node: DSLNode,
  direction: LayoutDirection = "down",
): { width: number; height: number } {
  switch (node.type) {
    case "initial":
      return { width: STATE_DOT, height: STATE_DOT };
    case "final":
      return { width: STATE_FINAL, height: STATE_FINAL };
    case "choice":
      return { width: STATE_CHOICE, height: STATE_CHOICE };
    case "fork":
    case "join":
      // a bar lies across the way the machine reads
      return direction === "right"
        ? { width: STATE_BAR_WEIGHT, height: STATE_BAR_LENGTH }
        : { width: STATE_BAR_LENGTH, height: STATE_BAR_WEIGHT };
    default: {
      const box = stateBoxLayout(node);
      return { width: box.width, height: box.height };
    }
  }
}

export function computeStateLayout(
  ast: AST,
  direction: LayoutDirection = "down",
): PositionedAST {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({
    rankdir: direction === "right" ? "LR" : "TB",
    nodesep: 64,
    // an open head needs 50 straight under it, and a transition is labelled
    ranksep: 84,
    marginx: MARGIN,
    marginy: MARGIN,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of ast.nodes) {
    const size = stateShapeSize(node, direction);
    graph.setNode(node.id, { width: size.width, height: size.height });
  }
  ast.edges.forEach((edge, index) => {
    graph.setEdge(
      edge.from,
      edge.to,
      {
        width: edge.label ? Math.min(110, textWidth(edge.label, 11) + 12) : 0,
        height: edge.label ? 16 : 0,
      },
      `e${index}`,
    );
  });
  dagre.layout(graph);

  const nodes: PositionedNode[] = ast.nodes.map((node) => {
    const laid = graph.node(node.id);
    return {
      ...node,
      width: laid.width,
      height: laid.height,
      x: Math.round(laid.x - laid.width / 2),
      y: Math.round(laid.y - laid.height / 2),
      rank: laid.rank ?? 0,
    };
  });

  return {
    category: ast.category,
    title: ast.title,
    nodes,
    edges: spreadEnds(
      routeFlowEdges(nodes, ast.edges, direction, "state"),
      new Map(nodes.map((node) => [node.id, node])),
      "state",
    ),
  };
}
