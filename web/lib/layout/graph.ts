import type {
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
): PositionedEdge[] {
  if (direction === "right") {
    return routeFlowEdges(nodes.map(turned), edges).map((edge) => ({
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

  return edges.map((edge, index) => {
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
      // the channel this branch turns in: the middle of the gap, stepped aside
      // by enough to read when several leave the same box
      const spread = Math.min(CHANNEL_STEP, (to.y - from.y - from.height) / 3);
      const midY = Math.round(
        (from.y + from.height + to.y) / 2 +
          (lane[index] - (lanes(edge.from) - 1) / 2) * spread,
      );
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

