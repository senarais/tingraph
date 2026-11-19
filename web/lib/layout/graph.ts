import { routeBetween, runsAlong, selfLoop } from "@/lib/canvas/connect";
import { edgeHeads, edgeLine, keepsApart, mayShare } from "@/lib/connectors";
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
  const groups = twinGroups(edges, category);
  const twins = new Map<number, Point[]>();

  return edges.map((edge, index) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) {
      return { ...edge, points: [] };
    }
    const done = twins.get(index);
    if (done) {
      return { ...edge, points: done };
    }
    const members = groups.get(index);
    const blockers = nodes.filter((node) => node !== from && node !== to).map(outline);
    const pair =
      members &&
      twinRoutes(members, edges, byId, blockers, (twin) => edgeHeads(category, twin), (extra) => {
        const head = Math.max(...members.flatMap((at) => edgeHeads(category, edges[at]))) + extra;
        const line = edgeLine(category, edge);
        return routeBetween(outline(from), outline(to), {
          category,
          direction: "down",
          heads: [head, head],
          avoid: blockers,
          lines: linesToKeepOff(laid, { line, from: edge.from, to: edge.to }),
        }).map(round);
      });
    if (pair) {
      for (const [at, points] of pair) {
        twins.set(at, points);
        laid.push({ from: edges[at].from, to: edges[at].to, line: edgeLine(category, edges[at]), points });
      }
      return { ...edge, points: pair.get(index)! };
    }
    const points =
      from === to
        ? selfLoop(from, edgeHeads(category, edge)[1])
        : flowRoute(edge, index, from, to);
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
    // the routes already laid that this one may not run along
    const others = linesToKeepOff(laid, { line: edgeLine(category, edge), from: edge.from, to: edge.to });
    /** a route that crosses no box and lies along no line it must keep off */
    const clear = (points: Point[]) => !hits(points, blockers) && runsAlong(points, others) <= 6;
    /** the canvas's own router, round whatever this one could not step past */
    const around = (sides?: { fromSide: "left" | "right"; toSide: "left" | "right" }) =>
      routeBetween(outline(from), outline(to), {
        category,
        direction: "down",
        heads: [headA, headB],
        avoid: blockers.map(outline),
        lines: others,
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
      if (Math.abs(fromCx - toCx) < 1 && clear(straight)) {
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
      if (clear(stepped)) {
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
    if (clear(loop)) {
      return loop;
    }
    const side = goLeft ? "left" : "right";
    const pinned = around({ fromSide: side, toSide: side });
    // the side a loop climbs is a preference, not a rule: when a line already
    // leaves or meets that side, the router picks the side that is free
    return clear(pinned) ? pinned : around();
  }
}

/** Whether two legs cross at a point inside both, rather than touch at an end. */
function legsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const turn = (p: Point, q: Point, r: Point) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return turn(c, d, a) * turn(c, d, b) < 0 && turn(a, b, c) * turn(a, b, d) < 0;
}

/**
 * What a set of routes costs to read: every crossing far more than every
 * corner, and every corner more than length. A layout that tries several
 * arrangements keeps the cheapest.
 */
export function routeCost(routes: readonly (readonly Point[])[]): number {
  let crossings = 0;
  let corners = 0;
  let length = 0;
  routes.forEach((route, i) => {
    corners += Math.max(0, route.length - 2);
    for (let k = 1; k < route.length; k++) {
      length += Math.abs(route[k].x - route[k - 1].x) + Math.abs(route[k].y - route[k - 1].y);
    }
    for (const other of routes.slice(i + 1)) {
      for (let k = 1; k < route.length; k++) {
        for (let m = 1; m < other.length; m++) {
          if (legsCross(route[k - 1], route[k], other[m - 1], other[m])) crossings += 1;
        }
      }
    }
  });
  return crossings * 1000 + corners * 60 + length;
}

/** Room between two line ends spread along one side of a box. */
const END_SPACING = 14;

/**
 * Lines that join the same two boxes and may not share a stretch — a request
 * and its answer between a process and an entity, a transition there and the
 * one back. Routed one at a time, the second finds the first in its way and
 * goes the long way round the drawing; drawn side by side, they read as the
 * pair they are, which is how both notations draw them by hand.
 *
 * Each group is keyed by its first edge, and lists every edge in it in the
 * order written.
 */
function twinGroups(edges: readonly DSLEdge[], category: DiagramCategory): Map<number, number[]> {
  const byPair = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    if (edge.from === edge.to || !keepsApart(edgeLine(category, edge))) return;
    const key = edge.from < edge.to ? `${edge.from}\0${edge.to}` : `${edge.to}\0${edge.from}`;
    byPair.set(key, [...(byPair.get(key) ?? []), index]);
  });
  const groups = new Map<number, number[]>();
  for (const members of byPair.values()) {
    if (members.length > 1) groups.set(members[0], members);
  }
  return groups;
}

/**
 * An orthogonal route moved sideways by `by`, every leg kept square: each leg
 * moves along its own normal, so a corner moves along both of the legs it
 * joins, and the ends slide along the sides they sit on.
 */
export function offsetRoute(points: readonly Point[], by: number): Point[] {
  const normals = points.slice(1).map((point, i) => {
    const sx = Math.sign(point.x - points[i].x);
    const sy = Math.sign(point.y - points[i].y);
    return { x: -sy * by, y: sx * by };
  });
  return points.map((point, i) => {
    const before = normals[i - 1] ?? { x: 0, y: 0 };
    const after = normals[i] ?? { x: 0, y: 0 };
    return round({ x: point.x + before.x + after.x, y: point.y + before.y + after.y });
  });
}

/**
 * A straight line between two boxes standing apart on one axis and sharing at
 * least `room` of the other, through the middle of what they share; null when
 * they do not.
 */
function straightBetween(from: Box | undefined, to: Box | undefined, room: number): Point[] | null {
  if (!from || !to) return null;
  const share = (a: number, as: number, b: number, bs: number) => {
    const lo = Math.max(a, b);
    const hi = Math.min(a + as, b + bs);
    return hi - lo >= room ? Math.round((lo + hi) / 2) : null;
  };
  if (to.y >= from.y + from.height + 2 * MIN_LEG || from.y >= to.y + to.height + 2 * MIN_LEG) {
    const x = share(from.x, from.width, to.x, to.width);
    if (x === null) return null;
    const down = to.y > from.y;
    return [{ x, y: down ? from.y + from.height : from.y }, { x, y: down ? to.y : to.y + to.height }];
  }
  if (to.x >= from.x + from.width + 2 * MIN_LEG || from.x >= to.x + to.width + 2 * MIN_LEG) {
    const y = share(from.y, from.height, to.y, to.height);
    if (y === null) return null;
    const right = to.x > from.x;
    return [{ x: right ? from.x + from.width : from.x, y }, { x: right ? to.x : to.x + to.width, y }];
  }
  return null;
}

/**
 * The routes already laid that a new one must keep off: all but the ones it
 * may share a stretch with. Every line leaves the middle of a side, so two
 * from one side start on one stub; where both are lines whose ends
 * `spreadEnds` sets apart afterwards, the end legs at the box they share are
 * left out, or the router would send the second the long way round.
 */
function linesToKeepOff(
  laid: ReadonlyArray<{ from: string; to: string; line: string; points: Point[] }>,
  edge: { line: string; from: string; to: string },
): Point[][] {
  // only lines whose ends are spread are set apart afterwards
  const spread = (line: string) => keepsApart(line);
  const ends = new Set([edge.from, edge.to]);
  return laid
    .filter((other) => !mayShare(other, edge))
    .map((other) =>
      spread(edge.line) && spread(other.line)
        ? other.points.slice(ends.has(other.from) ? 1 : 0, ends.has(other.to) ? -1 : undefined)
        : other.points,
    )
    .filter((points) => points.length >= 2);
}

/** Whether an end lies on its box's outline, far enough in from the corners. */
function onSide(point: Point, box: Box): boolean {
  const inX = point.x >= box.x + 4 && point.x <= box.x + box.width - 4;
  const inY = point.y >= box.y + 4 && point.y <= box.y + box.height - 4;
  const onX = Math.abs(point.x - box.x) <= 1 || Math.abs(point.x - (box.x + box.width)) <= 1;
  const onY = Math.abs(point.y - box.y) <= 1 || Math.abs(point.y - (box.y + box.height)) <= 1;
  return (onY && inX) || (onX && inY);
}

/**
 * The routes of one group of twins, cut from one route between the pair: the
 * route `base` makes from the first edge's start to its end, spread across
 * `TWIN_GAP` apart, and turned round for an edge that runs the other way.
 * Null when a copy would leave its box's side, cross a box, or fold a leg
 * back — the group is then routed one line at a time like any other.
 */
function twinRoutes(
  members: readonly number[],
  edges: readonly DSLEdge[],
  byId: ReadonlyMap<string, Box>,
  blockers: readonly Box[],
  heads: (edge: DSLEdge) => readonly [number, number],
  base: (extra: number) => Point[],
): Map<number, Point[]> | null {
  const spread = (members.length - 1) / 2;
  const leader = edges[members[0]];
  // two boxes that still overlap across the line between them take the pair
  // as straight lines through the overlap, which no turn can beat
  const route =
    straightBetween(byId.get(leader.from), byId.get(leader.to), 2 * spread * END_SPACING + 16) ??
    base(Math.ceil(spread * END_SPACING));
  if (route.length < 2) return null;
  const out = new Map<number, Point[]>();
  for (const [at, index] of members.entries()) {
    const edge = edges[index];
    const moved = offsetRoute(route, (at - spread) * END_SPACING);
    // every leg keeps its heading; a short one would otherwise turn round
    for (let i = 1; i < moved.length; i++) {
      const was = { x: Math.sign(route[i].x - route[i - 1].x), y: Math.sign(route[i].y - route[i - 1].y) };
      const now = { x: Math.sign(moved[i].x - moved[i - 1].x), y: Math.sign(moved[i].y - moved[i - 1].y) };
      if (was.x !== now.x || was.y !== now.y) return null;
    }
    const points = edge.from === leader.from ? moved : moved.reverse();
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to || !onSide(points[0], from) || !onSide(points[points.length - 1], to)) return null;
    if (hits(points, blockers.filter((box) => box !== from && box !== to))) return null;
    // a copy moved to the inside of a corner has a shorter end leg; it must
    // still hold the head drawn on it whole
    const [headA, headB] = heads(edge);
    const leg = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    if (leg(points[0], points[1]) < headA || leg(points[points.length - 2], points[points.length - 1]) < headB) {
      return null;
    }
    out.set(index, points);
  }
  return out;
}

/**
 * Lines that may not share a stretch, given ends of their own.
 *
 * The router meets a side of a box at its middle, so every line using that
 * side lands on one point: a transition leaving a state and another arriving
 * at it read as one line with two heads, and two named data flows read as
 * one. Where a box side carries more than one end of such lines, the ends are
 * spread along it, 14 apart and centred, in the order their far ends lie so
 * that no two cross. Each end moves with the corner after it, so the leg
 * leaving the side stays square and keeps its length — and with it the room
 * the head on it needs. An end that cannot move that way (a two-point line
 * whose other box does not reach, or a leg too short to give the room) is
 * left where it was.
 */
export function spreadEnds<E extends { points: Point[] } & Pick<DSLEdge, "from" | "to" | "line" | "kind">>(
  edges: E[],
  byId: ReadonlyMap<string, Box>,
  category: DiagramCategory,
): E[] {
  type End = { edge: number; first: boolean; side: string; along: number; toward: number };
  const ends = new Map<string, End[]>();
  edges.forEach((edge, index) => {
    const pts = edge.points;
    if (pts.length < 2 || edge.from === edge.to) return;
    if (!keepsApart(edgeLine(category, edge))) {
      return;
    }
    for (const first of [true, false]) {
      const id = first ? edge.from : edge.to;
      const box = byId.get(id);
      if (!box) continue;
      const tip = first ? pts[0] : pts[pts.length - 1];
      const next = first ? pts[1] : pts[pts.length - 2];
      const upright = Math.abs(next.x - tip.x) < Math.abs(next.y - tip.y);
      // which side: a vertical stub meets the top or bottom, a level one a flank
      const side = upright
        ? Math.abs(tip.y - box.y) < Math.abs(tip.y - (box.y + box.height)) ? "top" : "bottom"
        : Math.abs(tip.x - box.x) < Math.abs(tip.x - (box.x + box.width)) ? "left" : "right";
      const far = first ? pts[pts.length - 1] : pts[0];
      const key = `${id}:${side}`;
      const list = ends.get(key) ?? [];
      list.push({
        edge: index,
        first,
        side,
        along: upright ? tip.x : tip.y,
        toward: upright ? far.x : far.y,
      });
      ends.set(key, list);
    }
  });

  const out = edges.map((edge) => ({ ...edge, points: edge.points.map((p) => ({ ...p })) }));
  for (const [key, list] of ends) {
    if (list.length < 2) continue;
    const box = byId.get(key.slice(0, key.lastIndexOf(":")))!;
    const upright = list[0].side === "top" || list[0].side === "bottom";
    const span = upright ? box.width : box.height;
    const start = upright ? box.x : box.y;
    const step = Math.min(END_SPACING, (span - 12) / (list.length - 1));
    if (step < 6) continue;
    const middle = start + span / 2;
    // two lines joining the same pair were laid side by side already; their
    // far ends would sort them the wrong way round on an L-shaped pair, so
    // they keep the order they are in, at the place the pair is due
    const pairOf = (end: End) => {
      const edge = edges[end.edge];
      return edge.from < edge.to ? `${edge.from}\0${edge.to}` : `${edge.to}\0${edge.from}`;
    };
    const keys = new Map<End, number>();
    for (const end of list) {
      const pair = list.filter((other) => pairOf(other) === pairOf(end));
      const toward = pair.reduce((sum, other) => sum + other.toward, 0) / pair.length;
      keys.set(end, pair.length > 1 ? toward + end.along * 1e-6 : end.toward);
    }
    list.sort((a, b) => keys.get(a)! - keys.get(b)! || a.edge - b.edge);
    list.forEach((end, at) => {
      const target = Math.round(middle + (at - (list.length - 1) / 2) * step);
      const shift = target - end.along;
      if (shift === 0) return;
      const pts = out[end.edge].points;
      const i = end.first ? 0 : pts.length - 1;
      const j = end.first ? 1 : pts.length - 2;
      const k = end.first ? 2 : pts.length - 3;
      const axis = upright ? "x" : "y";
      if (pts.length === 2) {
        // a straight line moves whole, so its other end must still meet its box
        const other = byId.get(end.first ? out[end.edge].to : out[end.edge].from);
        if (!other) return;
        const lo = upright ? other.x : other.y;
        const hi = lo + (upright ? other.width : other.height);
        const moved = pts[j][axis] + shift;
        if (moved < lo + 4 || moved > hi - 4) return;
        pts[i][axis] += shift;
        pts[j][axis] += shift;
        return;
      }
      // the corner after the stub moves too, so the leg after it, which runs
      // along the side, grows or shrinks; it must not fold back or vanish
      const before = pts[k][axis] - pts[j][axis];
      const after = before - shift;
      if (before === 0 || Math.abs(after) < 4 || Math.sign(after) !== Math.sign(before)) {
        return;
      }
      pts[i][axis] += shift;
      pts[j][axis] += shift;
    });
  }
  return out;
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
  const groups = twinGroups(edges, category);
  const twins = new Map<number, Point[]>();
  return edges.map((edge, index) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) {
      return { ...edge, points: [] };
    }
    const done = twins.get(index);
    if (done) {
      return { ...edge, points: done };
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
    const lines = linesToKeepOff(laid, { line, from: edge.from, to: edge.to }).concat(chrome.lines);
    const members = groups.get(index);
    const pair =
      members &&
      !ports?.(edge).fromAt && !ports?.(edge).toAt &&
      twinRoutes(members, edges, byId, avoid, (twin) => edgeHeads(category, twin), (extra) => {
        const heads = members.flatMap((at) => edgeHeads(category, edges[at]));
        const head = Math.max(...heads) + extra;
        return routeBetween(outline(from), outline(to), {
          category,
          direction,
          heads: [head, head],
          avoid,
          lines,
        });
      });
    if (pair) {
      for (const [at, points] of pair) {
        twins.set(at, points);
        laid.push({ from: edges[at].from, to: edges[at].to, line: edgeLine(category, edges[at]), points });
      }
      return { ...edge, points: pair.get(index)! };
    }
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

