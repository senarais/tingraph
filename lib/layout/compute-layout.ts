import dagre from "@dagrejs/dagre";
import {
  AST,
  DSLEdge,
  DSLEntry,
  DSLNode,
  LayoutDirection,
  NodeType,
  PositionedAST,
  PositionedEdge,
  PositionedLane,
  PositionedNode,
  PositionedPool,
} from "@/lib/types";

const MARGIN = 60;

/** Advance width of one Helvetica glyph, relative to the font size. */
function charRatio(char: string): number {
  if (" ,.;:'!|iljt[]()".includes(char)) return 0.3;
  if ("fr".includes(char)) return 0.37;
  if ("mw".includes(char)) return 0.85;
  if ("MW".includes(char)) return 0.92;
  if (char >= "A" && char <= "Z") return 0.7;
  if (char >= "0" && char <= "9") return 0.56;
  return 0.55;
}

/** Approximate rendered width of a single text line. */
export function textWidth(text: string, fontSize: number): number {
  let ratio = 0;
  for (const char of text) {
    ratio += charRatio(char);
  }
  return ratio * fontSize;
}

// ---------------------------------------------------------------- typography

const FLOW_FONT_SIZE = 16;
const FLOW_LINE_HEIGHT = FLOW_FONT_SIZE * 1.25;
const FLOW_MAX_LABEL_WIDTH = 200;

// bpmn.io typography (BpmnRenderer: Arial 11–12px)
export const BPMN_TASK_FONT_SIZE = 12;
export const BPMN_LABEL_FONT_SIZE = 11;
export const BPMN_LINE_HEIGHT = BPMN_LABEL_FONT_SIZE * 1.25;
export const BPMN_TASK_LINE_HEIGHT = BPMN_TASK_FONT_SIZE * 1.25;

// ---------------------------------------------------------- canonical sizes

export const BPMN_EVENT_SIZE = 36;
export const BPMN_TASK_WIDTH = 100;
export const BPMN_TASK_HEIGHT = 80;
export const BPMN_GATEWAY_SIZE = 50;
export const BPMN_DATA_WIDTH = 36;
export const BPMN_DATA_HEIGHT = 50;

/** Gap between a shape and its external caption. */
export const BPMN_EXTERNAL_LABEL_DISTANCE = 8;
/** Longest external label line before it wraps. */
const BPMN_EXTERNAL_LABEL_MAX_WIDTH = 96;
/** Vertical header band of a pool / lane (bpmn-js uses 30px). */
export const BPMN_HEADER_WIDTH = 30;

// ------------------------------------------------------------- grid metrics

const COL_GAP = 60; // horizontal channel between two columns
const ROW_GAP = 40; // vertical channel between two rows of one lane
const LANE_PAD_X = 30;
const LANE_PAD_Y = 24;
export const POOL_GAP = 40;
export const MIN_LANE_HEIGHT = 110;
const LOOP_GAP = 28; // channel height reserved for a backward edge
const CLEARANCE = 5; // how close a route may pass a shape
const FLOW_SIDE_GAP = 40; // side channel for a flowchart loop

// --------------------------------------------------------------- text utils

export function wrapByWidth(label: string, maxWidth: number, fontSize: number): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate, fontSize) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function linesWidth(lines: string[], fontSize: number): number {
  return lines.reduce((max, line) => Math.max(max, textWidth(line, fontSize)), 0);
}

/** External caption of an event / gateway / data object, already wrapped. */
export function wrapExternalLabel(label: string): string[] {
  return wrapByWidth(label, BPMN_EXTERNAL_LABEL_MAX_WIDTH, BPMN_LABEL_FONT_SIZE);
}

/** Caption inside a task box, already wrapped to the box width. */
export function wrapTaskLabel(label: string): string[] {
  return wrapByWidth(label, BPMN_TASK_WIDTH - 16, BPMN_TASK_FONT_SIZE);
}

// ------------------------------------------------------------- shape sizing

export function bpmnHasExternalLabel(type: NodeType): boolean {
  return (
    type === "start" ||
    type === "end" ||
    type === "msg-start" ||
    type === "msg-end" ||
    type === "timer" ||
    type === "gw-ex" ||
    type === "gw-para" ||
    type === "gw-inc" ||
    type === "data"
  );
}

export function bpmnShapeSize(
  type: NodeType,
  label = "",
): { width: number; height: number } {
  switch (type) {
    case "start":
    case "end":
    case "msg-start":
    case "msg-end":
    case "timer":
      return { width: BPMN_EVENT_SIZE, height: BPMN_EVENT_SIZE };
    case "gw-ex":
    case "gw-para":
    case "gw-inc":
      return { width: BPMN_GATEWAY_SIZE, height: BPMN_GATEWAY_SIZE };
    case "data":
      return { width: BPMN_DATA_WIDTH, height: BPMN_DATA_HEIGHT };
    default: {
      // a task grows downwards when its caption needs more than four lines
      const lines = Math.max(1, wrapTaskLabel(label).length);
      const needed = Math.round(lines * BPMN_TASK_LINE_HEIGHT + 20);
      return {
        width: BPMN_TASK_WIDTH,
        height: Math.max(BPMN_TASK_HEIGHT, needed),
      };
    }
  }
}

// ------------------------------------------------------------ flow (dagre)

export function flowDimensions(
  type: NodeType,
  label: string,
): { width: number; height: number } {
  const lines = wrapByWidth(label, FLOW_MAX_LABEL_WIDTH, FLOW_FONT_SIZE);
  const width = linesWidth(lines, FLOW_FONT_SIZE);
  const textHeight = Math.max(1, lines.length) * FLOW_LINE_HEIGHT;
  switch (type) {
    case "start":
    case "end":
      return {
        width: Math.round(Math.max(150, width + 80)),
        height: Math.round(Math.max(60, textHeight + 30)),
      };
    case "decision":
      return {
        width: Math.round(Math.max(170, width * 2 + 40)),
        height: Math.round(Math.max(90, textHeight + 56)),
      };
    default:
      return {
        width: Math.round(Math.max(140, width + 56)),
        height: Math.round(Math.max(60, textHeight + 26)),
      };
  }
}

function computeFlowLayout(
  ast: AST,
  direction: LayoutDirection,
): PositionedAST {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({
    rankdir: direction === "right" ? "LR" : "TB",
    nodesep: 52,
    ranksep: 66,
    marginx: MARGIN,
    marginy: MARGIN,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of ast.nodes) {
    const dim = flowDimensions(node.type, node.label);
    graph.setNode(node.id, { width: dim.width, height: dim.height });
  }
  ast.edges.forEach((edge, index) => {
    graph.setEdge(
      edge.from,
      edge.to,
      {
        width: edge.label ? textWidth(edge.label, FLOW_FONT_SIZE) + 12 : 0,
        height: edge.label ? FLOW_LINE_HEIGHT : 0,
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
    edges: routeFlowEdges(nodes, ast.edges, direction),
  };
}

/** A box seen with its axes swapped, for laying a chart out sideways. */
function turned<T extends Box>(box: T): T {
  return { ...box, x: box.y, y: box.x, width: box.height, height: box.width };
}

/**
 * Top-down orthogonal routing for flowcharts: straight down where the boxes
 * line up, a step through the channel between two ranks otherwise, and a run
 * down the side for edges that loop back up.
 *
 * A chart that grows sideways is the same drawing reflected across the
 * diagonal, so it is routed by turning the boxes a quarter turn, routing it as
 * a top-down chart, and turning the route back.
 */
function routeFlowEdges(
  nodes: PositionedNode[],
  edges: DSLEdge[],
  direction: LayoutDirection = "down",
): PositionedEdge[] {
  if (direction === "right") {
    return routeFlowEdges(nodes.map(turned), edges).map((edge) => ({
      ...edge,
      points: edge.points.map((point) => ({ x: point.y, y: point.x })),
    }));
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return edges.map((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) {
      return { ...edge, points: [] };
    }
    const blockers = nodes.filter((node) => node !== from && node !== to);
    const fromCx = from.x + from.width / 2;
    const toCx = to.x + to.width / 2;
    const fromCy = from.y + from.height / 2;
    const toCy = to.y + to.height / 2;
    const downward = to.y >= from.y + from.height;

    if (downward) {
      // one x for both ends, so a near-miss between two centres still drops
      // straight down instead of leaning a pixel to one side
      const shared = Math.round((fromCx + toCx) / 2);
      const straight: Point[] = [
        { x: shared, y: from.y + from.height },
        { x: shared, y: to.y },
      ];
      if (Math.abs(fromCx - toCx) < 1 && !hits(straight, blockers)) {
        return { ...edge, points: straight.map(round) };
      }
      const midY = Math.round((from.y + from.height + to.y) / 2);
      const stepped: Point[] = [
        { x: fromCx, y: from.y + from.height },
        { x: fromCx, y: midY },
        { x: toCx, y: midY },
        { x: toCx, y: to.y },
      ];
      if (!hits(stepped, blockers)) {
        return { ...edge, points: stepped.map(round) };
      }
    }

    // loops back up (or sideways): leave through the nearer side and climb
    const goLeft = toCx <= fromCx;
    const channel = goLeft
      ? Math.min(from.x, to.x) - FLOW_SIDE_GAP
      : Math.max(from.x + from.width, to.x + to.width) + FLOW_SIDE_GAP;
    return {
      ...edge,
      points: [
        { x: goLeft ? from.x : from.x + from.width, y: fromCy },
        { x: channel, y: fromCy },
        { x: channel, y: toCy },
        { x: goLeft ? to.x : to.x + to.width, y: toCy },
      ].map(round),
    };
  });
}

// ------------------------------------------------------------- bpmn ranking

/** Edges that shape the flow; data links are placed relative to their host. */
function isFlowEdge(edge: DSLEdge, typeOf: Map<string, NodeType>): boolean {
  return typeOf.get(edge.from) !== "data" && typeOf.get(edge.to) !== "data";
}

/** Indices of edges that close a cycle — excluded from ranking. */
function findBackEdges(
  nodes: DSLNode[],
  edges: Array<{ from: string; to: string; index: number }>,
): Set<number> {
  const adj = new Map<string, Array<{ to: string; index: number }>>();
  for (const node of nodes) {
    adj.set(node.id, []);
  }
  for (const edge of edges) {
    adj.get(edge.from)?.push({ to: edge.to, index: edge.index });
  }
  const indeg = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const edge of edges) {
    indeg.set(edge.to, (indeg.get(edge.to) ?? 0) + 1);
  }

  const state = new Map<string, 0 | 1 | 2>(nodes.map((n) => [n.id, 0]));
  const back = new Set<number>();
  const roots = [
    ...nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id),
    ...nodes.map((n) => n.id),
  ];

  for (const root of roots) {
    if (state.get(root) !== 0) {
      continue;
    }
    state.set(root, 1);
    const stack: Array<{ id: string; next: number }> = [{ id: root, next: 0 }];
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const list = adj.get(top.id) ?? [];
      if (top.next < list.length) {
        const { to, index } = list[top.next++];
        const seen = state.get(to) ?? 0;
        if (seen === 1) {
          back.add(index); // points at an ancestor → cycle
        } else if (seen === 0) {
          state.set(to, 1);
          stack.push({ id: to, next: 0 });
        }
      } else {
        state.set(top.id, 2);
        stack.pop();
      }
    }
  }
  return back;
}

/** Longest-path ranking: a node sits one column right of its last predecessor. */
function rankNodes(
  nodes: DSLNode[],
  edges: Array<{ from: string; to: string; index: number }>,
): Map<string, number> {
  const rank = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const indeg = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const out = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const edge of edges) {
    out.get(edge.from)?.push(edge.to);
    indeg.set(edge.to, (indeg.get(edge.to) ?? 0) + 1);
  }
  const queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  while (queue.length > 0) {
    const id = queue.shift() as string;
    for (const next of out.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(id) ?? 0) + 1));
      const left = (indeg.get(next) ?? 0) - 1;
      indeg.set(next, left);
      if (left === 0) {
        queue.push(next);
      }
    }
  }
  return rank;
}

// ---------------------------------------------------------------- bpmn grid

const SYNTHETIC_LANE = "__lane__";
const SYNTHETIC_POOL = "__pool__";

interface LaneSpec {
  id: string;
  label: string;
  poolId: string;
}

interface PoolSpec {
  id: string;
  label: string;
}

interface Cell {
  node: DSLNode;
  laneIdx: number;
  col: number;
  row: number;
  width: number;
  height: number;
  labelLines: string[];
  labelWidth: number;
  labelHeight: number;
  x: number;
  y: number;
}

interface RowMetrics {
  shapeHeight: number;
  labelHeight: number;
  top: number;
}

interface LaneBox {
  spec: LaneSpec;
  top: number;
  height: number;
  rows: RowMetrics[];
  /** y positions of horizontal channels reserved for backward edges */
  loopChannels: number[];
  loopUsed: number;
}

function buildLaneSpecs(ast: AST): { lanes: LaneSpec[]; pools: PoolSpec[] } {
  const lanes: LaneSpec[] = [];
  const pools: PoolSpec[] = [];
  for (const pool of ast.pools ?? []) {
    pools.push({ id: pool.id, label: pool.label });
    for (const lane of pool.lanes) {
      // a pool wrapping a single implicit lane needs one caption, not two
      const duplicate =
        pool.lanes.length === 1 && lane.label === pool.label && pool.label !== "";
      lanes.push({
        id: lane.id,
        label: duplicate ? "" : lane.label,
        poolId: pool.id,
      });
    }
  }
  const known = new Set(lanes.map((l) => l.id));
  const loose = ast.nodes.some((n) => !n.lane || !known.has(n.lane));
  if (loose) {
    lanes.push({ id: SYNTHETIC_LANE, label: "", poolId: SYNTHETIC_POOL });
    pools.push({ id: SYNTHETIC_POOL, label: "" });
  }
  return { lanes, pools };
}

function computeBpmnLayout(ast: AST): PositionedAST {
  const hasChrome = (ast.pools?.length ?? 0) > 0;
  const { lanes: laneSpecs, pools: poolSpecs } = buildLaneSpecs(ast);
  const laneIndex = new Map(laneSpecs.map((lane, i) => [lane.id, i]));
  const typeOf = new Map(ast.nodes.map((n) => [n.id, n.type]));

  // ---- ranking (columns) over sequence flow only
  const flowEdges = ast.edges
    .map((edge, index) => ({ from: edge.from, to: edge.to, index }))
    .filter((edge) => isFlowEdge(ast.edges[edge.index], typeOf));
  const back = findBackEdges(ast.nodes, flowEdges);
  const forward = flowEdges.filter((edge) => !back.has(edge.index));
  const rank = rankNodes(ast.nodes, forward);

  // ---- cells
  const cells = new Map<string, Cell>();
  ast.nodes.forEach((node) => {
    const size = bpmnShapeSize(node.type, node.label);
    const labelLines = bpmnHasExternalLabel(node.type)
      ? wrapExternalLabel(node.label === node.id ? "" : node.label)
      : [];
    const laneIdx = laneIndex.get(node.lane ?? "") ?? laneSpecs.length - 1;
    cells.set(node.id, {
      node,
      laneIdx: Math.max(0, laneIdx),
      col: rank.get(node.id) ?? 0,
      row: 0,
      width: size.width,
      height: size.height,
      labelLines,
      labelWidth: linesWidth(labelLines, BPMN_LABEL_FONT_SIZE),
      labelHeight: labelLines.length * BPMN_LINE_HEIGHT,
      x: 0,
      y: 0,
    });
  });

  // a data object shares the column of the task it is attached to
  for (const edge of ast.edges) {
    const source = cells.get(edge.from);
    const target = cells.get(edge.to);
    if (!source || !target) {
      continue;
    }
    if (target.node.type === "data" && source.node.type !== "data") {
      target.col = source.col;
    } else if (source.node.type === "data" && target.node.type !== "data") {
      source.col = target.col;
    }
  }

  // ---- rows inside each lane
  const predecessors = new Map<string, string[]>();
  for (const edge of forward) {
    const list = predecessors.get(edge.to) ?? [];
    list.push(edge.from);
    predecessors.set(edge.to, list);
  }
  const attachedTo = new Map<string, string>();
  for (const edge of ast.edges) {
    if (typeOf.get(edge.to) === "data" && typeOf.get(edge.from) !== "data") {
      attachedTo.set(edge.to, edge.from);
    } else if (typeOf.get(edge.from) === "data" && typeOf.get(edge.to) !== "data") {
      attachedTo.set(edge.from, edge.to);
    }
  }

  // a data object follows its host straight away, so nothing slips between
  // them and their association stays a short vertical hop
  const declIndex = new Map(ast.nodes.map((node, i) => [node.id, i]));
  const sortKey = (cell: Cell): number => {
    const host = attachedTo.get(cell.node.id);
    return declIndex.get(host ?? cell.node.id) ?? 0;
  };
  const order = [...cells.values()].sort((a, b) => {
    if (a.col !== b.col) return a.col - b.col;
    if (sortKey(a) !== sortKey(b)) return sortKey(a) - sortKey(b);
    return (a.node.type === "data" ? 1 : 0) - (b.node.type === "data" ? 1 : 0);
  });

  const taken = new Map<string, Set<number>>(); // `lane:col` → rows in use
  for (const cell of order) {
    const key = `${cell.laneIdx}:${cell.col}`;
    const used = taken.get(key) ?? new Set<number>();
    let row = 0;
    const host = attachedTo.get(cell.node.id);
    const hostCell = host ? cells.get(host) : undefined;
    if (cell.node.type === "data" && hostCell && hostCell.laneIdx === cell.laneIdx) {
      row = hostCell.row + 1;
    } else {
      const sameLanePred = (predecessors.get(cell.node.id) ?? [])
        .map((id) => cells.get(id))
        .find((pred) => pred && pred.laneIdx === cell.laneIdx);
      row = sameLanePred ? sameLanePred.row : 0;
    }
    while (used.has(row)) {
      row += 1;
    }
    used.add(row);
    taken.set(key, used);
    cell.row = row;
  }

  // ---- column widths and channels
  const colCount = Math.max(1, ...[...cells.values()].map((c) => c.col + 1));
  const colWidth = new Array<number>(colCount).fill(0);
  for (const cell of cells.values()) {
    colWidth[cell.col] = Math.max(
      colWidth[cell.col],
      cell.width,
      Math.round(cell.labelWidth),
    );
  }
  const gapWidth = new Array<number>(Math.max(1, colCount - 1)).fill(COL_GAP);
  for (const edge of ast.edges) {
    const source = cells.get(edge.from);
    const target = cells.get(edge.to);
    if (!edge.label || !source || !target || target.col <= source.col) {
      continue;
    }
    const gap = source.col;
    if (gap < gapWidth.length) {
      gapWidth[gap] = Math.max(
        gapWidth[gap],
        Math.round(textWidth(edge.label, BPMN_LABEL_FONT_SIZE)) + 24,
      );
    }
  }

  const poolHeaderWidth =
    hasChrome && poolSpecs.some((p) => p.label) ? BPMN_HEADER_WIDTH : 0;
  const laneHeaderWidth =
    hasChrome && laneSpecs.some((l) => l.label) ? BPMN_HEADER_WIDTH : 0;
  const contentLeft = MARGIN + poolHeaderWidth + laneHeaderWidth;
  const colX: number[] = [];
  let cursorX = contentLeft + LANE_PAD_X;
  for (let c = 0; c < colCount; c++) {
    colX.push(cursorX);
    cursorX += colWidth[c] + (gapWidth[c] ?? 0);
  }
  const contentWidth =
    LANE_PAD_X * 2 +
    colWidth.reduce((sum, w) => sum + w, 0) +
    gapWidth.slice(0, Math.max(0, colCount - 1)).reduce((sum, w) => sum + w, 0);

  // ---- lane heights (rows + reserved loop channels)
  const laneLoopCount = new Array<number>(laneSpecs.length).fill(0);
  for (const edge of ast.edges) {
    const source = cells.get(edge.from);
    const target = cells.get(edge.to);
    if (!source || !target) continue;
    if (source.laneIdx === target.laneIdx && target.col < source.col) {
      laneLoopCount[source.laneIdx] += 1;
    }
  }

  const laneBoxes: LaneBox[] = laneSpecs.map((spec, index) => {
    const laneCells = [...cells.values()].filter((c) => c.laneIdx === index);
    const rowCount = Math.max(0, ...laneCells.map((c) => c.row + 1));
    const rows: RowMetrics[] = [];
    for (let r = 0; r < rowCount; r++) {
      const rowCells = laneCells.filter((c) => c.row === r);
      rows.push({
        shapeHeight: Math.max(0, ...rowCells.map((c) => c.height)),
        labelHeight: Math.max(0, ...rowCells.map((c) => c.labelHeight)),
        top: 0,
      });
    }
    const rowsHeight = rows.reduce(
      (sum, row, i) =>
        sum +
        row.shapeHeight +
        (row.labelHeight > 0 ? BPMN_EXTERNAL_LABEL_DISTANCE + row.labelHeight : 0) +
        (i < rows.length - 1 ? ROW_GAP : 0),
      0,
    );
    const loops = laneLoopCount[index];
    const height = Math.max(
      MIN_LANE_HEIGHT,
      Math.round(LANE_PAD_Y * 2 + rowsHeight + loops * LOOP_GAP),
    );
    return { spec, top: 0, height, rows, loopChannels: [], loopUsed: 0 };
  });

  // ---- stack lanes into pools
  const positionedPools: PositionedPool[] = [];
  let cursorY = MARGIN;
  for (const pool of poolSpecs) {
    const boxes = laneBoxes.filter((box) => box.spec.poolId === pool.id);
    if (boxes.length === 0) {
      continue;
    }
    const poolTop = cursorY;
    const positionedLanes: PositionedLane[] = [];
    for (const box of boxes) {
      box.top = cursorY;
      let rowTop = cursorY + LANE_PAD_Y;
      for (const row of box.rows) {
        row.top = rowTop;
        rowTop +=
          row.shapeHeight +
          (row.labelHeight > 0 ? BPMN_EXTERNAL_LABEL_DISTANCE + row.labelHeight : 0) +
          ROW_GAP;
      }
      const loops = laneLoopCount[laneBoxes.indexOf(box)];
      for (let i = 0; i < loops; i++) {
        box.loopChannels.push(
          Math.round(cursorY + box.height - LANE_PAD_Y - i * LOOP_GAP),
        );
      }
      positionedLanes.push({
        id: box.spec.id,
        label: box.spec.label,
        x: MARGIN + poolHeaderWidth,
        y: cursorY,
        width: laneHeaderWidth + contentWidth,
        height: box.height,
        // an unlabelled lane needs no band; content stays on the global grid
        headerWidth: box.spec.label ? laneHeaderWidth : 0,
        poolId: pool.id,
      });
      cursorY += box.height;
    }
    positionedPools.push({
      id: pool.id,
      label: pool.label,
      x: MARGIN,
      y: poolTop,
      width: poolHeaderWidth + laneHeaderWidth + contentWidth,
      height: cursorY - poolTop,
      headerWidth: poolHeaderWidth,
      lanes: positionedLanes,
    });
    cursorY += POOL_GAP;
  }

  // ---- place the shapes
  for (const cell of cells.values()) {
    const box = laneBoxes[cell.laneIdx];
    const row = box?.rows[cell.row];
    const colLeft = colX[cell.col] ?? contentLeft + LANE_PAD_X;
    cell.x = Math.round(colLeft + (colWidth[cell.col] - cell.width) / 2);
    cell.y = Math.round(
      (row?.top ?? box?.top ?? MARGIN) + ((row?.shapeHeight ?? cell.height) - cell.height) / 2,
    );
  }

  const nodes: PositionedNode[] = ast.nodes.map((node) => {
    const cell = cells.get(node.id) as Cell;
    return {
      ...node,
      x: cell.x,
      y: cell.y,
      width: cell.width,
      height: cell.height,
      rank: cell.col,
    };
  });

  const edges = routeEdges(ast.edges, cells, laneBoxes, {
    colX,
    colWidth,
    gapWidth,
  });

  return {
    category: ast.category,
    title: ast.title,
    nodes,
    edges,
    ...(hasChrome ? { pools: positionedPools } : {}),
  };
}

// ------------------------------------------------------------------ routing

interface Point {
  x: number;
  y: number;
}

interface Grid {
  colX: number[];
  colWidth: number[];
  gapWidth: number[];
}

function centerX(cell: Cell): number {
  return cell.x + cell.width / 2;
}
function centerY(cell: Cell): number {
  return cell.y + cell.height / 2;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function hits(points: Point[], boxes: readonly Box[]): boolean {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const minX = Math.min(a.x, b.x) - CLEARANCE;
    const maxX = Math.max(a.x, b.x) + CLEARANCE;
    const minY = Math.min(a.y, b.y) - CLEARANCE;
    const maxY = Math.max(a.y, b.y) + CLEARANCE;
    for (const box of boxes) {
      if (
        minX < box.x + box.width &&
        box.x < maxX &&
        minY < box.y + box.height &&
        box.y < maxY
      ) {
        return true;
      }
    }
  }
  return false;
}

type Plan =
  | { kind: "straight"; points: Point[] }
  | { kind: "z"; gap: number }
  | { kind: "loop"; above: boolean };

function planEdge(from: Cell, to: Cell, grid: Grid, blockers: Cell[]): Plan {
  const fromCy = centerY(from);
  const toCy = centerY(to);
  const fromCx = centerX(from);
  const toCx = centerX(to);
  const sameRow = Math.abs(fromCy - toCy) < 1;
  const sameCol = Math.abs(fromCx - toCx) < 1;

  const direct: Point[][] = [];
  if (sameRow && to.x >= from.x + from.width) {
    direct.push([
      { x: from.x + from.width, y: fromCy },
      { x: to.x, y: toCy },
    ]);
  }
  if (sameCol && to.y >= from.y + from.height) {
    direct.push([
      { x: fromCx, y: from.y + from.height },
      { x: toCx, y: to.y },
    ]);
  }
  if (sameCol && from.y >= to.y + to.height) {
    direct.push([
      { x: fromCx, y: from.y },
      { x: toCx, y: to.y + to.height },
    ]);
  }
  for (const points of direct) {
    if (!hits(points, blockers)) {
      return { kind: "straight", points };
    }
  }
  if (sameCol) {
    // something sits between the two: swing out into the column channel and
    // come back in from the side
    const x = channelCentre(from.col, grid);
    return {
      kind: "straight",
      points: [
        { x: from.x + from.width, y: fromCy },
        { x, y: fromCy },
        { x, y: toCy },
        { x: to.x + to.width, y: toCy },
      ],
    };
  }
  if (to.col > from.col) {
    // forward with a row change: vertical run in a column channel. Prefer the
    // channel right after the source, fall back to the one before the target.
    for (const gap of [from.col, to.col - 1]) {
      const x = channelCentre(gap, grid);
      const trial: Point[] = [
        { x: from.x + from.width, y: fromCy },
        { x, y: fromCy },
        { x, y: toCy },
        { x: to.x, y: toCy },
      ];
      if (!hits(trial, blockers)) {
        return { kind: "z", gap };
      }
    }
    // both channels are busy: detour through a horizontal channel instead
    return { kind: "loop", above: toCy < fromCy };
  }
  return { kind: "loop", above: toCy < fromCy };
}

function channelCentre(gap: number, grid: Grid): number {
  const left = (grid.colX[gap] ?? 0) + (grid.colWidth[gap] ?? 0);
  return left + (grid.gapWidth[gap] ?? COL_GAP) / 2;
}

function routeEdges(
  edges: DSLEdge[],
  cells: Map<string, Cell>,
  laneBoxes: LaneBox[],
  grid: Grid,
): PositionedEdge[] {
  const blockers = [...cells.values()];
  const plans = edges.map((edge) => {
    const from = cells.get(edge.from);
    const to = cells.get(edge.to);
    if (!from || !to) {
      return null;
    }
    return planEdge(from, to, grid, blockers.filter((c) => c !== from && c !== to));
  });

  // spread parallel vertical runs across their shared channel
  const perGap = new Map<number, number[]>();
  plans.forEach((plan, index) => {
    if (plan?.kind === "z") {
      const list = perGap.get(plan.gap) ?? [];
      list.push(index);
      perGap.set(plan.gap, list);
    }
  });
  const channelX = new Map<number, number>();
  for (const [gap, indices] of perGap) {
    const left = (grid.colX[gap] ?? 0) + (grid.colWidth[gap] ?? 0);
    const width = grid.gapWidth[gap] ?? COL_GAP;
    indices.forEach((edgeIndex, i) => {
      channelX.set(
        edgeIndex,
        Math.round(left + (width * (i + 1)) / (indices.length + 1)),
      );
    });
  }

  return edges.map((edge, index) => {
    const from = cells.get(edge.from);
    const to = cells.get(edge.to);
    const plan = plans[index];
    if (!from || !to || !plan) {
      return { ...edge, points: [] };
    }
    if (plan.kind === "straight") {
      return { ...edge, points: plan.points.map(round) };
    }
    if (plan.kind === "z") {
      const x = channelX.get(index) ?? channelCentre(plan.gap, grid);
      const fromCy = centerY(from);
      const toCy = centerY(to);
      return {
        ...edge,
        points: [
          { x: from.x + from.width, y: fromCy },
          { x, y: fromCy },
          { x, y: toCy },
          { x: to.x, y: toCy },
        ].map(round),
      };
    }
    // backward: drop into a reserved channel, run back, re-enter vertically
    const lane = laneBoxes[from.laneIdx];
    const above = plan.above;
    let channelY: number;
    if (!above && lane && lane.loopUsed < lane.loopChannels.length) {
      channelY = lane.loopChannels[lane.loopUsed++];
    } else if (above) {
      channelY = Math.min(from.y, to.y) - LOOP_GAP;
    } else {
      channelY = Math.max(from.y + from.height, to.y + to.height) + LOOP_GAP;
    }
    const exitY = above ? from.y : from.y + from.height;
    const entryY = above ? to.y : to.y + to.height;
    return {
      ...edge,
      points: [
        { x: centerX(from), y: exitY },
        { x: centerX(from), y: channelY },
        { x: centerX(to), y: channelY },
        { x: centerX(to), y: entryY },
      ].map(round),
    };
  });
}

function round(p: Point): Point {
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

// ------------------------------------------------------------------ org tree

export const ORG_TITLE_FONT_SIZE = 12;
export const ORG_NAME_FONT_SIZE = 13;
export const ORG_TITLE_LINE_HEIGHT = ORG_TITLE_FONT_SIZE * 1.25;
export const ORG_NAME_LINE_HEIGHT = ORG_NAME_FONT_SIZE * 1.25;
/** Text inset from the box edge. */
export const ORG_PAD_X = 12;
/** Text inset inside a sub-role pill. */
export const ORG_PILL_PAD_X = 8;

const ORG_MIN_WIDTH = 160;
const ORG_MAX_WIDTH = 232;
const ORG_BAND_PAD_Y = 9;
const ORG_BODY_PAD_Y = 10;
const ORG_PILL_PAD_Y = 5;
const ORG_ENTRY_GAP = 8;
const ORG_ENTRY_NAME_GAP = 4;
const ORG_COL_GAP = 28;
const ORG_ROW_GAP = 64;
/** Distance from a box to the advisory node parked beside it. */
const ORG_SATELLITE_GAP = 90;

/** One sub-role listed inside a box: a tinted pill and the name under it. */
export interface OrgEntryRow {
  label: string[];
  name: string[];
  pillTop: number;
  pillHeight: number;
  pillWidth: number;
  nameTop: number;
  nameHeight: number;
}

export interface OrgLayout {
  width: number;
  height: number;
  /** height of the tinted header band holding the role */
  bandHeight: number;
  title: string[];
  /** the name under the band; empty when the box lists sub-roles instead */
  name: string[];
  rows: OrgEntryRow[];
}

/**
 * Text rows of one org box. Both the layout and the mapper read this, so the
 * drawn rows and the reserved height can never drift apart.
 */
export function orgBoxLayout(node: DSLNode): OrgLayout {
  const entries: DSLEntry[] = node.entries ?? [];
  const natural = Math.max(
    textWidth(node.label, ORG_TITLE_FONT_SIZE),
    node.name ? textWidth(node.name, ORG_NAME_FONT_SIZE) : 0,
    ...entries.map(
      (entry) => textWidth(entry.label, ORG_TITLE_FONT_SIZE) + ORG_PILL_PAD_X * 2,
    ),
    ...entries.map((entry) =>
      entry.name ? textWidth(entry.name, ORG_NAME_FONT_SIZE) : 0,
    ),
  );
  const width = Math.round(
    Math.min(ORG_MAX_WIDTH, Math.max(ORG_MIN_WIDTH, natural + ORG_PAD_X * 2)),
  );
  const text = width - ORG_PAD_X * 2;

  const title = wrapByWidth(node.label, text, ORG_TITLE_FONT_SIZE);
  const bandHeight = Math.round(
    Math.max(1, title.length) * ORG_TITLE_LINE_HEIGHT + ORG_BAND_PAD_Y * 2,
  );

  if (entries.length === 0) {
    const name = node.name
      ? wrapByWidth(node.name, text, ORG_NAME_FONT_SIZE)
      : [];
    const bodyHeight =
      name.length === 0
        ? 0
        : Math.round(name.length * ORG_NAME_LINE_HEIGHT + ORG_BODY_PAD_Y * 2);
    return {
      width,
      height: bandHeight + bodyHeight,
      bandHeight,
      title,
      name,
      rows: [],
    };
  }

  const pillText = text - ORG_PILL_PAD_X * 2;
  const rows: OrgEntryRow[] = [];
  let cursor = bandHeight + ORG_ENTRY_GAP;
  for (const entry of entries) {
    const label = wrapByWidth(entry.label, pillText, ORG_TITLE_FONT_SIZE);
    const pillHeight = Math.round(
      Math.max(1, label.length) * ORG_TITLE_LINE_HEIGHT + ORG_PILL_PAD_Y * 2,
    );
    const name = entry.name
      ? wrapByWidth(entry.name, text, ORG_NAME_FONT_SIZE)
      : [];
    const nameHeight = Math.round(name.length * ORG_NAME_LINE_HEIGHT);
    rows.push({
      label,
      name,
      pillTop: cursor,
      pillHeight,
      pillWidth: Math.round(
        Math.min(text, linesWidth(label, ORG_TITLE_FONT_SIZE) + ORG_PILL_PAD_X * 2),
      ),
      nameTop: cursor + pillHeight + (nameHeight > 0 ? ORG_ENTRY_NAME_GAP : 0),
      nameHeight,
    });
    cursor +=
      pillHeight +
      (nameHeight > 0 ? ORG_ENTRY_NAME_GAP + nameHeight : 0) +
      ORG_ENTRY_GAP;
  }
  return { width, height: cursor, bandHeight, title, name: [], rows };
}

/**
 * A tidy top-down tree. Solid edges are the reporting lines that build it;
 * a dotted edge to a box that reports to nobody parks that box beside its
 * partner, the way a senate sits next to a dean.
 */
function computeOrgLayout(
  ast: AST,
  direction: LayoutDirection,
): PositionedAST {
  // the tree is laid out along two axes: levels stack along the one the chart
  // grows in, and the boxes on one level are packed along the other
  const sideways = direction === "right";
  const boxes = new Map<string, OrgLayout>(
    ast.nodes.map((node) => [node.id, orgBoxLayout(node)]),
  );
  const parent = new Map<string, string>();
  const children = new Map<string, string[]>();

  const isAncestor = (ancestor: string, of: string): boolean => {
    const seen = new Set<string>();
    let cursor: string | undefined = of;
    while (cursor && !seen.has(cursor)) {
      if (cursor === ancestor) {
        return true;
      }
      seen.add(cursor);
      cursor = parent.get(cursor);
    }
    return false;
  };

  for (const edge of ast.edges) {
    // a second reporting line, a self-link or a loop stays a plain connector
    if (
      edge.kind === "association" ||
      edge.from === edge.to ||
      parent.has(edge.to) ||
      !boxes.has(edge.from) ||
      !boxes.has(edge.to) ||
      isAncestor(edge.to, edge.from)
    ) {
      continue;
    }
    parent.set(edge.to, edge.from);
    const kids = children.get(edge.from);
    if (kids) {
      kids.push(edge.to);
    } else {
      children.set(edge.from, [edge.to]);
    }
  }

  // a box that reports to nobody and is only tied in by a dotted line rides
  // along beside the box it is tied to
  const satelliteOf = new Map<string, string>();
  for (const edge of ast.edges) {
    if (edge.kind !== "association") {
      continue;
    }
    for (const [rider, host] of [
      [edge.to, edge.from],
      [edge.from, edge.to],
    ]) {
      const loose =
        !parent.has(rider) &&
        !satelliteOf.has(rider) &&
        (children.get(rider)?.length ?? 0) === 0;
      const anchored = !parent.has(host) && (children.get(host)?.length ?? 0) > 0;
      if (loose && anchored && rider !== host && boxes.has(rider)) {
        satelliteOf.set(rider, host);
        break;
      }
    }
  }

  const roots = ast.nodes
    .map((node) => node.id)
    .filter((id) => !parent.has(id) && !satelliteOf.has(id));

  const depth = new Map<string, number>();
  const walk = (id: string, level: number): void => {
    if (depth.has(id)) {
      return;
    }
    depth.set(id, level);
    for (const child of children.get(id) ?? []) {
      walk(child, level + 1);
    }
  };
  roots.forEach((id) => walk(id, 0));
  for (const [rider, host] of satelliteOf) {
    depth.set(rider, depth.get(host) ?? 0);
  }
  // anything the forest never reached (a node in a cycle) lands on its own row
  for (const node of ast.nodes) {
    if (!depth.has(node.id)) {
      depth.set(node.id, 0);
      roots.push(node.id);
    }
  }

  const grows = (id: string): number =>
    (sideways ? boxes.get(id)?.width : boxes.get(id)?.height) ?? 0;
  const packs = (id: string): number =>
    (sideways ? boxes.get(id)?.height : boxes.get(id)?.width) ?? ORG_MIN_WIDTH;

  const levelSize: number[] = [];
  for (const [id, level] of depth) {
    levelSize[level] = Math.max(levelSize[level] ?? 0, grows(id));
  }
  const levelStart: number[] = [];
  let stack = MARGIN;
  for (let level = 0; level < levelSize.length; level++) {
    levelStart[level] = stack;
    stack += (levelSize[level] ?? 0) + ORG_ROW_GAP;
  }

  const span = new Map<string, number>();
  const measure = (id: string): number => {
    const own = packs(id);
    const kids = children.get(id) ?? [];
    const inner =
      kids.length === 0
        ? 0
        : kids.reduce((sum, kid) => sum + measure(kid), 0) +
          (kids.length - 1) * ORG_COL_GAP;
    const total = Math.max(own, inner);
    span.set(id, total);
    return total;
  };

  const across = new Map<string, number>();
  const place = (id: string, slot: number): void => {
    const own = packs(id);
    const total = span.get(id) ?? own;
    const kids = children.get(id) ?? [];
    if (kids.length === 0) {
      across.set(id, Math.round(slot + (total - own) / 2));
      return;
    }
    const inner =
      kids.reduce((sum, kid) => sum + (span.get(kid) ?? 0), 0) +
      (kids.length - 1) * ORG_COL_GAP;
    let cursor = slot + (total - inner) / 2;
    for (const kid of kids) {
      place(kid, cursor);
      cursor += (span.get(kid) ?? 0) + ORG_COL_GAP;
    }
    const first = kids[0];
    const last = kids[kids.length - 1];
    const centre =
      ((across.get(first) ?? 0) +
        packs(first) / 2 +
        (across.get(last) ?? 0) +
        packs(last) / 2) /
      2;
    across.set(id, Math.round(centre - own / 2));
  };

  let cursor = MARGIN;
  for (const root of roots) {
    measure(root);
    place(root, cursor);
    cursor += (span.get(root) ?? 0) + ORG_COL_GAP;
  }

  // a satellite parks just past its host on the packing axis, nudged clear of
  // anything else already standing on that level
  for (const [rider, host] of satelliteOf) {
    let at = (across.get(host) ?? MARGIN) + packs(host) + ORG_SATELLITE_GAP;
    const row = depth.get(rider) ?? 0;
    for (const [other, level] of depth) {
      if (other === rider || other === host || level !== row) {
        continue;
      }
      const start = across.get(other);
      if (start === undefined) {
        continue;
      }
      if (at < start + packs(other) && start < at + packs(rider)) {
        at = start + packs(other) + ORG_COL_GAP;
      }
    }
    across.set(rider, Math.round(at));
  }

  const nodes: PositionedNode[] = ast.nodes.map((node) => {
    const box = boxes.get(node.id) as OrgLayout;
    const level = depth.get(node.id) ?? 0;
    const along = levelStart[level] ?? MARGIN;
    const cross = across.get(node.id) ?? MARGIN;
    return {
      ...node,
      x: sideways ? along : cross,
      y: sideways ? cross : along,
      width: box.width,
      height: box.height,
      rank: level,
    };
  });
  const edges: PositionedEdge[] = ast.edges.map((edge) => {
    const from = nodes.find((n) => n.id === edge.from);
    const to = nodes.find((n) => n.id === edge.to);
    if (!from || !to) {
      return { ...edge, points: [] };
    }
    const reporting = edge.kind !== "association" && parent.get(edge.to) === edge.from;
    return {
      ...edge,
      points: reporting
        ? orgTreeRoute(from, to, sideways)
        : orgSideRoute(from, to),
      ...(reporting ? { reporting: true } : {}),
    };
  });

  return { category: "org", title: ast.title, nodes, edges };
}

/**
 * Out of the parent's trailing edge, onto the rail every one of its children
 * shares, along it, then into the child's leading edge.
 */
function orgTreeRoute(from: Box, to: Box, sideways: boolean): Point[] {
  const at = (along: number, across: number): Point =>
    sideways ? { x: along, y: across } : { x: across, y: along };
  const leave = sideways
    ? Math.round(from.x + from.width)
    : Math.round(from.y + from.height);
  const reach = Math.round(sideways ? to.x : to.y);
  const fromMid = sideways
    ? Math.round(from.y + from.height / 2)
    : Math.round(from.x + from.width / 2);
  const toMid = sideways
    ? Math.round(to.y + to.height / 2)
    : Math.round(to.x + to.width / 2);
  if (fromMid === toMid) {
    return [at(leave, fromMid), at(reach, toMid)];
  }
  const rail = Math.round((leave + reach) / 2);
  return [
    at(leave, fromMid),
    at(rail, fromMid),
    at(rail, toMid),
    at(reach, toMid),
  ];
}

/** A plain connector between two boxes that are not parent and child. */
function orgSideRoute(from: Box, to: Box): Point[] {
  const overlapTop = Math.max(from.y, to.y);
  const overlapBottom = Math.min(from.y + from.height, to.y + to.height);
  if (overlapBottom - overlapTop > 8) {
    const y = Math.round((overlapTop + overlapBottom) / 2);
    return to.x >= from.x
      ? [
          { x: Math.round(from.x + from.width), y },
          { x: Math.round(to.x), y },
        ]
      : [
          { x: Math.round(from.x), y },
          { x: Math.round(to.x + to.width), y },
        ];
  }
  const fromX = Math.round(from.x + from.width / 2);
  const toX = Math.round(to.x + to.width / 2);
  const downward = to.y > from.y;
  const start = { x: fromX, y: Math.round(downward ? from.y + from.height : from.y) };
  const finish = { x: toX, y: Math.round(downward ? to.y : to.y + to.height) };
  if (fromX === toX) {
    return [start, finish];
  }
  const mid = Math.round((start.y + finish.y) / 2);
  return [start, { x: fromX, y: mid }, { x: toX, y: mid }, finish];
}

// --------------------------------------------------------------------- api

export function computeLayout(
  ast: AST,
  direction: LayoutDirection = "down",
): PositionedAST {
  switch (ast.category) {
    case "bpmn":
      // a BPMN diagram already reads along its lanes; it has one direction
      return computeBpmnLayout(ast);
    case "org":
      return computeOrgLayout(ast, direction);
    default:
      return computeFlowLayout(ast, direction);
  }
}
