import { routeBetween } from "@/lib/canvas/connect";
import { edgeHeads, edgeLine } from "@/lib/connectors";
import type {
  DiagramCategory,
  DSLEdge,
  DSLNode,
  LayoutDirection,
  PositionedEdge,
  PositionedNode,
} from "@/lib/types";

/**
 * The parts of laying out a graph that more than one notation needs: which
 * edges close a cycle, which column a node belongs in, and how a line gets
 * from one box to another down the page.
 *
 * A flowchart and a UML activity diagram are different notations with
 * different shapes and different chrome, but they rank and route the same way,
 * so the ranking and the routing are written once here and the two layouts
 * differ only in what they draw.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How close a route may pass a shape it is not joining. */
const CLEARANCE = 5;
/** Side channel a loop runs back up. */
const FLOW_SIDE_GAP = 40;
/** How far apart two branches of one box turn, when both step through a channel. */
const CHANNEL_STEP = 11;
/** Least straight run out of a box before a branch may turn. */
const MIN_LEG = 10;

export function round(p: Point): Point {
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

export function hits(points: Point[], boxes: readonly Box[]): boolean {
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

/** A box seen with its axes swapped, for laying a chart out sideways. */
export function turned<T extends Box>(box: T): T {
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
export function routeFlowEdges(
  nodes: PositionedNode[],
  edges: DSLEdge[],
  direction: LayoutDirection = "down",
  category: DiagramCategory = "flow",
): PositionedEdge[] {
  if (direction === "right") {
    return routeFlowEdges(nodes.map(turned), edges, "down", category).map((edge) => ({
      ...edge,
      points: edge.points.map((point) => ({ x: point.y, y: point.x })),
    }));
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  // two branches out of one decision would otherwise turn in the same channel
  // and print one along the top of the other; each gets a lane of its own
  const leaving = new Map<string, number>();
  const lane = edges.map((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to || to.y < from.y + from.height) {
      return 0;
    }
    const at = leaving.get(edge.from) ?? 0;
    leaving.set(edge.from, at + 1);
    return at;
  });
  const lanes = (id: string) => leaving.get(id) ?? 1;
  const laid: Array<{ from: string; to: string; line: string; points: Point[] }> = [];

  return edges.map((edge, index) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) {
      return { ...edge, points: [] };
    }
    const points = flowRoute(edge, index, from, to);
    laid.push({ from: edge.from, to: edge.to, line: edgeLine(category, edge), points });
    return { ...edge, points };
  });

  function flowRoute(
    edge: DSLEdge,
    index: number,
    from: PositionedNode,
    to: PositionedNode,
  ): Point[] {
    const blockers = nodes.filter((node) => node !== from && node !== to);
    // the straight run each end needs for its head to be drawn whole
    const [headA, headB] = edgeHeads(category, edge);
    const fromCx = from.x + from.width / 2;
    const toCx = to.x + to.width / 2;
    const fromCy = from.y + from.height / 2;
    const toCy = to.y + to.height / 2;
    const downward = to.y >= from.y + from.height;
    /** the canvas's own router, round whatever this one could not step past */
    const around = (sides?: { fromSide: "left" | "right"; toSide: "left" | "right" }) =>
      routeBetween(outline(from), outline(to), {
        category,
        direction: "down",
        heads: [headA, headB],
        avoid: blockers.map(outline),
        lines: laid
          .filter(
            (other) =>
              other.line !== edgeLine(category, edge) ||
              (other.from !== edge.from && other.to !== edge.to),
          )
          .map((other) => other.points),
        ...sides,
      }).map(round);

    if (downward) {
      // one x for both ends, so a near-miss between two centres still drops
      // straight down instead of leaning a pixel to one side
      const shared = Math.round((fromCx + toCx) / 2);
      const straight: Point[] = [
        { x: shared, y: from.y + from.height },
        { x: shared, y: to.y },
      ];
      if (Math.abs(fromCx - toCx) < 1 && !hits(straight, blockers)) {
        return straight.map(round);
      }
      // the channel this branch turns in: the middle of the gap, stepped aside
      // by enough to read when several leave the same box — and never so close
      // to either box that the head on that end comes out small
      const top = from.y + from.height;
      const room = to.y - top;
      const spread = Math.min(CHANNEL_STEP, room / 3);
      const lo = Math.max(MIN_LEG, headA);
      const hi = Math.max(MIN_LEG, headB);
      const wanted =
        (top + to.y) / 2 + (lane[index] - (lanes(edge.from) - 1) / 2) * spread;
      const midY = Math.round(
        room < lo + hi
          ? top + (room * lo) / (lo + hi)
          : Math.min(Math.max(wanted, top + lo), to.y - hi),
      );
      const stepped: Point[] = [
        { x: fromCx, y: top },
        { x: fromCx, y: midY },
        { x: toCx, y: midY },
        { x: toCx, y: to.y },
      ];
      if (!hits(stepped, blockers)) {
        return stepped.map(round);
      }
      return around();
    }

    // loops back up (or sideways): leave through the nearer side and climb,
    // far enough out that the head on the way back in is drawn whole
    const goLeft = toCx <= fromCx;
    const out = Math.max(FLOW_SIDE_GAP, headB);
    const channel = goLeft
      ? Math.min(from.x, to.x) - out
      : Math.max(from.x + from.width, to.x + to.width) + out;
    const loop = [
      { x: goLeft ? from.x : from.x + from.width, y: fromCy },
      { x: channel, y: fromCy },
      { x: channel, y: toCy },
      { x: goLeft ? to.x : to.x + to.width, y: toCy },
    ].map(round);
    if (!hits(loop, blockers)) {
      return loop;
    }
    const side = goLeft ? "left" : "right";
    return around({ fromSide: side, toSide: side });
  }
}

/** Whether one box sits wholly inside another: a zone round a component. */
function holds(outer: Box, inner: Box): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.width >= inner.x + inner.width &&
    outer.y + outer.height >= inner.y + inner.height
  );
}

const outline = (box: Box): Box => ({
  x: box.x,
  y: box.y,
  width: box.width,
  height: box.height,
});

/**
 * Every edge of a placed graph cut by the canvas's own router, round the
 * other nodes and clear of the routes already laid, with room under each
 * head for it to be drawn whole — so a generated sheet is routed exactly the
 * way a connector drawn by hand between the same two boxes would be.
 *
 * A zone, and anything else that holds one of the two ends, is a backdrop the
 * line starts inside of rather than a thing in its way. Two edges of the same
 * kind that leave the same node, or meet the same one, may share a stretch:
 * that is a bracket or a merge, and reads as one.
 */
export function routeAll<E extends DSLEdge>(
  edges: readonly E[],
  byId: ReadonlyMap<string, PositionedNode>,
  nodes: readonly PositionedNode[],
  category: DiagramCategory,
  direction: LayoutDirection,
  ports?: (edge: E) => { fromAt?: number; toAt?: number },
  /** chrome every route keeps clear of: words to go round, rules not to follow */
  chrome: { avoid: Box[]; lines: Point[][] } = { avoid: [], lines: [] },
): Array<E & { points: Point[] }> {
  const laid: Array<{ from: string; to: string; line: string; points: Point[] }> = [];
  return edges.map((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) {
      return { ...edge, points: [] };
    }
    const line = edgeLine(category, edge);
    const avoid = nodes
      .filter(
        (node) =>
          node.id !== edge.from &&
          node.id !== edge.to &&
          node.type !== "zone" &&
          !holds(node, from) &&
          !holds(node, to),
      )
      .map(outline)
      .concat(chrome.avoid);
    const lines = laid
      .filter(
        (other) =>
          other.line !== line || (other.from !== edge.from && other.to !== edge.to),
      )
      .map((other) => other.points)
      .concat(chrome.lines);
    const points = routeBetween(outline(from), outline(to), {
      category,
      direction,
      heads: edgeHeads(category, edge),
      avoid,
      lines,
      ...(ports?.(edge) ?? {}),
    });
    laid.push({ from: edge.from, to: edge.to, line, points });
    return { ...edge, points };
  });
}

/** Indices of edges that close a cycle — excluded from ranking. */
export function findBackEdges(
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
export function rankNodes(
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

