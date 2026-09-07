import dagre from "@dagrejs/dagre";
import {
  AST,
  DSLNode,
  PositionedAST,
  PositionedEdge,
  PositionedLane,
  PositionedNode,
  PositionedPool,
} from "@/lib/types";

const AVG_CHAR_WIDTH = 0.62; // relative to font size
const MAX_LABEL_WIDTH = 200;
const MARGIN = 60;

const FLOW_FONT_SIZE = 16;
const FLOW_LINE_HEIGHT = FLOW_FONT_SIZE * 1.25;
const FLOW_AVG_CHAR_WIDTH = FLOW_FONT_SIZE * AVG_CHAR_WIDTH;

// bpmn.io typography (BpmnRenderer: Arial 11–12px)
export const BPMN_TASK_FONT_SIZE = 12;
export const BPMN_LABEL_FONT_SIZE = 11;
const BPMN_LINE_HEIGHT = BPMN_LABEL_FONT_SIZE * 1.2;
const BPMN_AVG_CHAR_WIDTH = BPMN_LABEL_FONT_SIZE * AVG_CHAR_WIDTH;

// Canonical BPMN element sizes (bpmn-js)
export const BPMN_EVENT_SIZE = 36;
export const BPMN_TASK_WIDTH = 100;
export const BPMN_TASK_HEIGHT = 80;
export const BPMN_GATEWAY_SIZE = 50;
export const BPMN_DATA_WIDTH = 36;
export const BPMN_DATA_HEIGHT = 50;

export const BPMN_EXTERNAL_LABEL_DISTANCE = 11;

// pool/lane chrome
export const BPMN_LANE_LABEL_WIDTH = 28; // vertical header column (bpmn-js)
export const BPMN_POOL_LABEL_WIDTH = 28;

function wrapLabelByWidth(label: string, maxChars: number): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [""];
  }
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
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

function measureFlowLabel(label: string): { lines: string[]; width: number } {
  const maxChars = Math.max(
    8,
    Math.floor(MAX_LABEL_WIDTH / FLOW_AVG_CHAR_WIDTH),
  );
  const lines = wrapLabelByWidth(label, maxChars);
  const longest = Math.max(...lines.map((l) => l.length));
  return { lines, width: longest * FLOW_AVG_CHAR_WIDTH };
}

function flowDimensions(
  type: PositionedNode["type"],
  label: string,
): { width: number; height: number } {
  const { lines, width } = measureFlowLabel(label);
  const textHeight = lines.length * FLOW_LINE_HEIGHT;
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

export function bpmnHasExternalLabel(type: PositionedNode["type"]): boolean {
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

/** External label box below the element, per bpmn-js label placement. */
function bpmnLabelBox(
  label: string,
): { width: number; height: number; lines: string[] } {
  if (!label) {
    return { width: 0, height: 0, lines: [] };
  }
  const lines = wrapLabelByWidth(label, Math.round(90 / BPMN_AVG_CHAR_WIDTH));
  const longest = Math.max(...lines.map((l) => l.length));
  return {
    width: longest * BPMN_AVG_CHAR_WIDTH,
    height: lines.length * BPMN_LINE_HEIGHT,
    lines,
  };
}

function bpmnDimensions(
  type: PositionedNode["type"],
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
    default:
      return { width: BPMN_TASK_WIDTH, height: BPMN_TASK_HEIGHT };
  }
}

/**
 * BPMN shapes with external labels reserve vertical space below the shape so
 * that dagre accounts for the caption.
 */
function withLabelHeight(
  type: PositionedNode["type"],
  label: string,
  shape: { width: number; height: number },
): { width: number; height: number } {
  if (!bpmnHasExternalLabel(type)) {
    return shape;
  }
  const box = bpmnLabelBox(label);
  if (box.height === 0) {
    return shape;
  }
  return {
    width: Math.max(shape.width, Math.round(box.width)),
    height:
      shape.height + BPMN_EXTERNAL_LABEL_DISTANCE + Math.round(box.height),
  };
}

function nodeBox(
  category: PositionedAST["category"],
  type: PositionedNode["type"],
  label: string,
): { width: number; height: number } {
  if (category === "bpmn") {
    return withLabelHeight(type, label, bpmnDimensions(type));
  }
  return flowDimensions(type, label);
}

const DEFAULT_LANE_ID = "__default_lane__";

function assignLanes(ast: AST): Map<string, string> {
  // node id → lane id for layout grouping
  const lanes = ast.pools?.flatMap((p) => p.lanes) ?? [];
  const nodeLane = new Map<string, string>();
  for (const node of ast.nodes) {
    if (node.lane) {
      nodeLane.set(node.id, node.lane);
    } else if (lanes.length === 1 && ast.pools?.length === 1) {
      nodeLane.set(node.id, lanes[0].id);
    }
  }
  return nodeLane;
}

interface LaneGeometry {
  id: string;
  label: string;
  poolId?: string;
  top: number;
  height: number; // interior height (excludes lane label header)
  left: number;
  width: number;
}

function hasPools(ast: AST): boolean {
  return (ast.pools?.length ?? 0) > 0;
}

export function computeLayout(ast: AST): PositionedAST {
  const isBpmn = ast.category === "bpmn";

  if (isBpmn && hasPools(ast)) {
    return computePooledLayout(ast);
  }

  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph(
    isBpmn
      ? { rankdir: "LR", nodesep: 50, ranksep: 70, marginx: MARGIN, marginy: MARGIN }
      : { rankdir: "TB", nodesep: 60, ranksep: 90, marginx: MARGIN, marginy: MARGIN },
  );
  graph.setDefaultEdgeLabel(() => ({}));

  const dims = new Map<string, { width: number; height: number }>();
  for (const node of ast.nodes) {
    const dim = nodeBox(ast.category, node.type, node.label);
    dims.set(node.id, dim);
    graph.setNode(node.id, { width: dim.width, height: dim.height });
  }

  const labelCharWidth = isBpmn ? BPMN_AVG_CHAR_WIDTH : FLOW_AVG_CHAR_WIDTH;
  const labelHeight = isBpmn ? BPMN_LINE_HEIGHT : FLOW_LINE_HEIGHT;
  ast.edges.forEach((edge, index) => {
    graph.setEdge(
      edge.from,
      edge.to,
      {
        width: edge.label ? edge.label.length * labelCharWidth + 12 : 0,
        height: edge.label ? labelHeight : 0,
      },
      `e${index}`,
    );
  });

  dagre.layout(graph);

  const nodes: PositionedNode[] = ast.nodes.map((node) => {
    const laid = graph.node(node.id);
    const dim = dims.get(node.id) as { width: number; height: number };
    const shapeDim = isBpmn ? bpmnDimensions(node.type) : dim;
    return {
      ...node,
      width: shapeDim.width,
      height: shapeDim.height,
      x: Math.round(laid.x - shapeDim.width / 2),
      y: Math.round(laid.y - dim.height / 2 + (dim.height - shapeDim.height) / 2),
      rank: laid.rank,
      ...(node.lane ? { lane: node.lane } : {}),
    };
  });

  const edges: PositionedEdge[] = ast.edges.map((edge, index) => {
    const laid = graph.edge({ v: edge.from, w: edge.to, name: `e${index}` });
    const points: Array<{ x: number; y: number }> =
      laid?.points?.map((p: { x: number; y: number }) => ({
        x: p.x,
        y: p.y,
      })) ?? [];
    return { ...edge, points };
  });

  return { category: ast.category, title: ast.title, nodes, edges };
}

/**
 * Pool/lane layout: each pool is a horizontally-flowing stack of lanes.
 * Lanes are laid out independently (each lane's own LR dagre), then pools and
 * lanes are sized to the widest lane / tallest stack. Cross-lane edges are
 * routed orthogonally after placement.
 */
function computePooledLayout(ast: AST): PositionedAST {
  const pools = ast.pools ?? [];
  const nodeLane = assignLanes(ast);
  const laneNodes = new Map<string, DSLNode[]>();
  for (const node of ast.nodes) {
    const laneId = nodeLane.get(node.id) ?? DEFAULT_LANE_ID;
    const list = laneNodes.get(laneId) ?? [];
    list.push(node);
    laneNodes.set(laneId, list);
  }

  // Lay out each lane independently, left-to-right.
  const laneRaw = new Map<string, { nodes: PositionedNode[]; width: number; height: number }>();
  for (const [laneId, nodes] of laneNodes) {
    const graph = new dagre.graphlib.Graph({ multigraph: true });
    graph.setGraph({
      rankdir: "LR",
      nodesep: 50,
      ranksep: 70,
      marginx: 30,
      marginy: 30,
    });
    graph.setDefaultEdgeLabel(() => ({}));
    const dims = new Map<string, { width: number; height: number }>();
    for (const node of nodes) {
      const dim = nodeBox(ast.category, node.type, node.label);
      dims.set(node.id, dim);
      graph.setNode(node.id, { width: dim.width, height: dim.height });
    }
    // edges fully contained within this lane (plus any cross-lane member edges
    // participate only when both endpoints share the lane)
    const inLane = new Set(nodes.map((n) => n.id));
    ast.edges.forEach((edge, index) => {
      if (inLane.has(edge.from) && inLane.has(edge.to)) {
        graph.setEdge(edge.from, edge.to, {}, `e${index}`);
      }
    });
    dagre.layout(graph);

    let width = 0;
    let height = 0;
    const laid: PositionedNode[] = nodes.map((node) => {
      const g = graph.node(node.id);
      const dim = dims.get(node.id) as { width: number; height: number };
      const shapeDim = bpmnDimensions(node.type);
      const n: PositionedNode = {
        ...node,
        width: shapeDim.width,
        height: shapeDim.height,
        x: Math.round(g.x - shapeDim.width / 2),
        y: Math.round(g.y - dim.height / 2 + (dim.height - shapeDim.height) / 2),
        rank: g.rank,
        lane: laneId,
      };
      width = Math.max(width, n.x + n.width);
      height = Math.max(height, n.y + n.height);
      return n;
    });
    laneRaw.set(laneId, { nodes: laid, width, height });
  }

  // Build lane geometry in declaration order.
  const lanes: LaneGeometry[] = [];
  const laneById = new Map<string, LaneGeometry>();
  const laneDepth = new Map<string, number>();
  let laneIndex = 0;
  for (const pool of pools) {
    for (const lane of pool.lanes) {
      lanes.push({
        id: lane.id,
        label: lane.label,
        poolId: pool.id,
        top: 0,
        height: 0,
        left: 0,
        width: 0,
      });
      laneById.set(lane.id, lanes[lanes.length - 1]);
      laneDepth.set(lane.id, laneIndex++);
    }
  }
  for (const laneId of laneNodes.keys()) {
    if (!laneById.has(laneId)) {
      // orphan lane content (no explicit lane declared) → anonymous lane
      lanes.push({
        id: laneId,
        label: "",
        poolId: undefined,
        top: 0,
        height: 0,
        left: 0,
        width: 0,
      });
      laneById.set(laneId, lanes[lanes.length - 1]);
      laneDepth.set(laneId, laneIndex++);
    }
  }

  const contentPools = new Map<string, LaneGeometry[]>();
  for (const lane of lanes) {
    const list = contentPools.get(lane.poolId ?? "") ?? [];
    list.push(lane);
    contentPools.set(lane.poolId ?? "", list);
  }

  // Vertical label columns consume left edge; lane content starts after them.
  const PAD = 24;
  const POOL_GAP = 60;
  const POOL_LABEL_SPACE = BPMN_POOL_LABEL_WIDTH;
  let poolCursorX = MARGIN + POOL_LABEL_SPACE;

  const positionedPools: PositionedPool[] = [];

  for (const [poolKey, poolLanes] of contentPools) {
    const pool = pools.find((p) => p.id === poolKey);
    let poolW = 0;
    for (const lane of poolLanes) {
      const raw = laneRaw.get(lane.id);
      poolW = Math.max(poolW, (raw?.width ?? 0) + PAD * 2);
    }

    let cursorY = MARGIN;
    for (const lane of poolLanes) {
      const raw = laneRaw.get(lane.id);
      const laneH = (raw?.height ?? BPMN_TASK_HEIGHT) + PAD * 2;
      lane.width = poolW;
      lane.left = poolCursorX;
      lane.top = cursorY;
      lane.height = laneH;
      cursorY += laneH;
    }

    // place lane content at its top-left + padding
    for (const lane of poolLanes) {
      const raw = laneRaw.get(lane.id);
      if (!raw) continue;
      const dx = lane.left + PAD - minXOf(raw.nodes);
      const dy = lane.top + PAD - minYOf(raw.nodes);
      for (const n of raw.nodes) {
        n.x += dx;
        n.y += dy;
      }
    }

    const poolTop = poolLanes[0]?.top ?? MARGIN;
    const lastLane = poolLanes[poolLanes.length - 1];
    const poolHeight = lastLane ? lastLane.top + lastLane.height - poolTop : 0;
    const positionedPoolLanes: PositionedLane[] = poolLanes.map((lane) => ({
      id: lane.id,
      label: lane.label,
      x: lane.left,
      y: lane.top,
      width: lane.width,
      height: lane.height,
      poolId: lane.poolId,
    }));
    positionedPools.push({
      id: poolKey,
      label: pool?.label ?? "",
      x: poolCursorX - POOL_LABEL_SPACE,
      y: poolTop,
      width: poolW + POOL_LABEL_SPACE,
      height: poolHeight,
      lanes: positionedPoolLanes,
    });

    poolCursorX += poolW + POOL_GAP;
  }

  const allNodes = lanes.flatMap((lane) => laneRaw.get(lane.id)?.nodes ?? []);

  // Route edges, snapping vertical ends into their lane bands for
  // cross-lane orthogonal routing.
  const edges: PositionedEdge[] = ast.edges.map((edge) => {
    const fromNode = allNodes.find((n) => n.id === edge.from);
    const toNode = allNodes.find((n) => n.id === edge.to);
    if (!fromNode || !toNode) {
      return { ...edge, points: [] };
    }
    const points = routeEdge(fromNode, toNode, laneById, laneDepth);
    return { ...edge, points };
  });

  const positioned: PositionedAST = {
    category: ast.category,
    title: ast.title,
    nodes: allNodes,
    edges,
    pools: positionedPools,
  };
  return positioned;
}

function minXOf(nodes: PositionedNode[]): number {
  return Math.min(...nodes.map((n) => n.x));
}
function minYOf(nodes: PositionedNode[]): number {
  return Math.min(...nodes.map((n) => n.y));
}

function routeEdge(
  from: PositionedNode,
  to: PositionedNode,
  laneById: Map<string, LaneGeometry>,
  laneDepth: Map<string, number>,
): Array<{ x: number; y: number }> {
  const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const fromLane = from.lane ? laneById.get(from.lane) : undefined;
  const toLane = to.lane ? laneById.get(to.lane) : undefined;
  const fromDepth = from.lane ? (laneDepth.get(from.lane) ?? 0) : 0;
  const toDepth = to.lane ? (laneDepth.get(to.lane) ?? 0) : 0;

  const sameLane =
    fromLane && toLane && from.lane === to.lane;

  if (sameLane || (fromLane && toLane && fromDepth === toDepth)) {
    // same lane (or same horizontal band): straight horizontal run
    return [
      { x: from.x + from.width, y: fromCenter.y },
      { x: to.x, y: toCenter.y },
    ];
  }

  if (fromLane && toLane) {
    // different lanes: orthogonal two-segment route via a mid band
    const fromEdge = {
      x: from.x + from.width / 2,
      y: fromDepth > toDepth ? from.y : from.y + from.height,
    };
    const toEdge = {
      x: to.x + to.width / 2,
      y: toDepth > fromDepth ? to.y + to.height : to.y,
    };
    const midY = (fromLane.top + toLane.top + toLane.height) / 2;
    return [
      { x: fromEdge.x, y: fromEdge.y },
      { x: fromEdge.x, y: midY },
      { x: toEdge.x, y: midY },
      { x: toEdge.x, y: toEdge.y },
    ];
  }

  // fallback: straight line between centres
  return [
    { x: fromCenter.x, y: fromCenter.y },
    { x: toCenter.x, y: toCenter.y },
  ];
}

export {
  AVG_CHAR_WIDTH as FLOW_AVG_CHAR_WIDTH_RELATIVE,
  FLOW_AVG_CHAR_WIDTH as AVG_CHAR_WIDTH,
  FLOW_LINE_HEIGHT as LINE_HEIGHT,
};

