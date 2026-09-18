import { findBackEdges, rankNodes, routeFlowEdges } from "@/lib/layout/graph";
import { linesWidth, wrapByWidth } from "@/lib/layout/text";
import type {
  AST,
  NodeType,
  PositionedAST,
  PositionedLane,
  PositionedNode,
  PositionedPool,
} from "@/lib/types";

/**
 * A UML activity diagram, laid out.
 *
 * The one thing that separates it from a flowchart is the partitions, and the
 * separation is geometric: an activity reads *down* the page while its
 * partitions run *across* it, so a lane here is a column with its name written
 * above it rather than a row with its name written up the side. That is why
 * this is its own layout rather than a setting on the BPMN one, which reads
 * the other way round.
 *
 * Within that, the arrangement is the flowchart's: a longest-path ranking
 * gives every node its row, and the routing is the same top-down routing a
 * flowchart uses, from `lib/layout/graph.ts`.
 */

export const ACTIVITY_FONT_SIZE = 13;
export const ACTIVITY_LINE_HEIGHT = ACTIVITY_FONT_SIZE * 1.25;
export const ACTIVITY_LABEL_FONT_SIZE = 11;
const MAX_LABEL = 150;

/** The round marker an activity starts and stops with. */
export const ACTIVITY_NODE_SIZE = 26;
export const ACTIVITY_GATE_SIZE = 50;
export const ACTIVITY_BAR_LENGTH = 132;
export const ACTIVITY_BAR_WEIGHT = 7;

const MARGIN = 60;
const ROW_GAP = 46;
const COL_PAD = 30;
const MIN_COL = 190;
/** the band along the top of the frame that the partitions are named in */
export const ACTIVITY_HEADER = 32;
const LANE_PAD_TOP = 26;
const LANE_PAD_BOTTOM = 30;
const SYNTHETIC_LANE = "__column__";

/** The nodes whose caption is written outside the shape, the way BPMN does. */
export function activityHasExternalLabel(type: NodeType | string): boolean {
  return (
    type === "initial" ||
    type === "final" ||
    type === "flow-final" ||
    type === "decision" ||
    type === "merge" ||
    type === "fork" ||
    type === "join"
  );
}

export function activityShapeSize(
  type: NodeType | string,
  label = "",
): { width: number; height: number } {
  switch (type) {
    case "initial":
    case "final":
    case "flow-final":
      return { width: ACTIVITY_NODE_SIZE, height: ACTIVITY_NODE_SIZE };
    case "decision":
    case "merge":
      return { width: ACTIVITY_GATE_SIZE, height: ACTIVITY_GATE_SIZE };
    case "fork":
    case "join":
      return { width: ACTIVITY_BAR_LENGTH, height: ACTIVITY_BAR_WEIGHT };
    default: {
      const lines = wrapByWidth(label, MAX_LABEL, ACTIVITY_FONT_SIZE);
      const text = linesWidth(lines, ACTIVITY_FONT_SIZE);
      const rows = Math.max(1, lines.length);
      return {
        width: Math.round(Math.max(type === "object" ? 120 : 132, text + 40)),
        height: Math.round(Math.max(46, rows * ACTIVITY_LINE_HEIGHT + 26)),
      };
    }
  }
}

/** The caption under a control node, already wrapped. */
export function wrapActivityLabel(label: string): string[] {
  return wrapByWidth(label, 120, ACTIVITY_LABEL_FONT_SIZE);
}

interface Column {
  id: string;
  label: string;
  members: PositionedNode[];
  x: number;
  width: number;
}

export function computeActivityLayout(ast: AST): PositionedAST {
  const lanes: Array<{ id: string; label: string }> = [];
  for (const pool of ast.pools ?? []) {
    for (const lane of pool.lanes) {
      lanes.push({ id: lane.id, label: lane.label });
    }
  }
  const known = new Set(lanes.map((lane) => lane.id));
  if (ast.nodes.some((node) => !node.lane || !known.has(node.lane))) {
    lanes.push({ id: SYNTHETIC_LANE, label: "" });
  }
  const chrome = (ast.pools?.length ?? 0) > 0;

  // --- rows, from a longest-path ranking over everything but the back edges
  const flow = ast.edges.map((edge, index) => ({ from: edge.from, to: edge.to, index }));
  const back = findBackEdges(ast.nodes, flow);
  const rank = rankNodes(
    ast.nodes,
    flow.filter((edge) => !back.has(edge.index)),
  );

  const nodes: PositionedNode[] = ast.nodes.map((node) => {
    const size = activityShapeSize(node.type, node.label);
    return {
      ...node,
      x: 0,
      y: 0,
      width: size.width,
      height: size.height,
      rank: rank.get(node.id) ?? 0,
    };
  });

  const rows = Math.max(1, ...nodes.map((node) => node.rank + 1));
  const rowHeight = Array.from({ length: rows }, (_, at) => {
    const mine = nodes.filter((node) => node.rank === at);
    const tallest = Math.max(0, ...mine.map((node) => node.height));
    const captions = mine.some(
      (node) => activityHasExternalLabel(node.type) && node.label && node.label !== node.id,
    );
    return tallest + (captions ? ACTIVITY_LINE_HEIGHT + 8 : 0);
  });
  const rowTop: number[] = [];
  let y = MARGIN + (chrome ? ACTIVITY_HEADER + LANE_PAD_TOP : 0);
  for (let at = 0; at < rows; at += 1) {
    rowTop.push(y);
    y += rowHeight[at] + ROW_GAP;
  }
  const bottom = y - ROW_GAP + LANE_PAD_BOTTOM;

  // --- columns, one per partition, wide enough for the widest thing in them
  const columns: Column[] = lanes.map((lane) => {
    const members = nodes.filter((node) =>
      lane.id === SYNTHETIC_LANE
        ? !node.lane || !known.has(node.lane)
        : node.lane === lane.id,
    );
    return {
      id: lane.id,
      label: lane.label,
      members,
      x: 0,
      width: Math.max(MIN_COL, Math.max(0, ...members.map((n) => n.width)) + COL_PAD * 2),
    };
  });
  let x = MARGIN;
  for (const column of columns) {
    column.x = x;
    x += column.width;
  }
  const right = x;

  // --- and everything in its cell, spread when two things share one
  for (const column of columns) {
    for (let at = 0; at < rows; at += 1) {
      const cell = column.members.filter((node) => node.rank === at);
      if (cell.length === 0) {
        continue;
      }
      const span = cell.reduce((sum, node) => sum + node.width, 0) + (cell.length - 1) * 30;
      let cursor = column.x + (column.width - span) / 2;
      for (const node of cell) {
        node.x = Math.round(cursor);
        node.y = Math.round(rowTop[at] + (rowHeight[at] - node.height) / 2 -
          (activityHasExternalLabel(node.type) && node.label && node.label !== node.id
            ? (ACTIVITY_LINE_HEIGHT + 8) / 2
            : 0));
        cursor += node.width + 30;
      }
    }
  }

  const pools: PositionedPool[] = [];
  if (chrome) {
    const top = MARGIN;
    const laneBoxes: PositionedLane[] = columns.map((column) => ({
      id: column.id,
      label: column.label,
      x: column.x,
      y: top,
      width: column.width,
      height: bottom - top,
      headerWidth: 0,
      headerHeight: ACTIVITY_HEADER,
      poolId: ast.pools?.[0]?.id ?? "partitions",
    }));
    pools.push({
      id: ast.pools?.[0]?.id ?? "partitions",
      label: "",
      x: MARGIN,
      y: top,
      width: right - MARGIN,
      height: bottom - top,
      headerWidth: 0,
      headerHeight: ACTIVITY_HEADER,
      lanes: laneBoxes,
    });
  }

  return {
    category: ast.category,
    title: ast.title,
    nodes,
    edges: routeFlowEdges(nodes, ast.edges, "down"),
    pools,
  };
}
