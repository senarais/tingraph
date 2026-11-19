/**
 * Connector geometry.
 *
 * Every connector on a Tingraph sheet is routed here — the ones the source
 * generates and the ones the reader drags out by hand — so a notation's rule
 * about where a line may leave a box, and where it may turn, is written once.
 * Excalidraw's own arrow routing and its endpoint binding are not used: a
 * connector is a plain polyline whose corners this file cuts.
 *
 * Nothing here touches the canvas, so all of it runs under `tsx`.
 */

import type { DiagramCategory, LayoutDirection } from "@/lib/types";

export type Side = "top" | "right" | "bottom" | "left";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * The element is drawn as an ellipse rather than a box, so a line that meets
   * it off-square meets the curve instead of the corner it would otherwise
   * stop short of. Only the notations that draw straight lines read it.
   */
  round?: boolean;
}

export interface Point {
  x: number;
  y: number;
}

/** Which way a connector runs out of a box, and how its ends were chosen. */
export interface Rules {
  category: DiagramCategory;
  /** which way the drawing grows; an org chart may be turned on its side */
  direction: LayoutDirection;
}

/** How far a connector runs straight out of a box before it may turn. */
const STUB = 16;
/** Two anchors this close read as lined up, so the connector runs straight. */
const SNAP = 6;
/** The room a turn needs beside a box it has to get around. */
const CLEAR = 18;
/** An org chart hangs every child of one box off a rail this far below it. */
const ORG_RAIL = 32;
/** Least room a turn needs between two boxes that face each other. */
const MIN_GAP = 10;

const UPRIGHT: Record<Side, boolean> = {
  top: true,
  bottom: true,
  left: false,
  right: false,
};

/** +1 when a side faces down or right, -1 when it faces up or left. */
const AWAY: Record<Side, number> = { top: -1, left: -1, bottom: 1, right: 1 };

export const SIDES: Side[] = ["top", "right", "bottom", "left"];

const near = (a: number, b: number) => Math.abs(a - b) <= SNAP;

/** The outline coordinate of a side: the y of a top edge, the x of a left one. */
function edgeOf(box: Box, side: Side): number {
  switch (side) {
    case "top":
      return box.y;
    case "bottom":
      return box.y + box.height;
    case "left":
      return box.x;
    default:
      return box.x + box.width;
  }
}

/** Where two boxes both stand on one axis, when they overlap at all. */
function shared(aStart: number, aSize: number, bStart: number, bSize: number): number | null {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aStart + aSize, bStart + bSize);
  return end - start > SNAP ? (start + end) / 2 : null;
}

/**
 * The point a connector leaves or meets a box at.
 *
 * A line that runs down the page leaves from the middle of the side it uses,
 * which is what lets every child of one box hang off the same rail. A line
 * that runs across the page meets the middle of the height the two boxes have
 * in common instead, so two boxes standing side by side — a dean and a senate,
 * a task and the one beside it — are joined by one straight rule even when one
 * of them is the taller.
 */
export function sideAnchor(box: Box, side: Side, other?: Box, at?: number): Point {
  if (UPRIGHT[side]) {
    return { x: Math.round(box.x + box.width / 2), y: edgeOf(box, side) };
  }
  // a port names the height the line meets this box at: an ERD row, so the
  // relation leaves the key it belongs to rather than the middle of the side.
  // Only a side that faces across the page can reach one
  const y =
    at ??
    (other ? shared(box.y, box.height, other.y, other.height) : null) ??
    box.y + box.height / 2;
  return { x: edgeOf(box, side), y: Math.round(y) };
}

/** How far apart two boxes stand on one axis; negative when they overlap. */
function gap(aStart: number, aSize: number, bStart: number, bSize: number): number {
  return Math.max(bStart - (aStart + aSize), aStart - (bStart + bSize));
}

/** The axis a notation reads along: a BPMN sheet runs across, a chart down. */
function readsUpright(rules: Rules): boolean {
  // an ERD relation joins a key to a key, which is a run across the page, so
  // an ERD reads across the way a BPMN sheet does rather than down
  // a block diagram's signals run left to right along its forward path
  if (
    rules.category === "bpmn" ||
    rules.category === "usecase" ||
    rules.category === "erd" ||
    rules.category === "block"
  ) {
    return false;
  }
  return rules.direction !== "right";
}

/**
 * The notations whose lines are not square.
 *
 * A use case diagram is drawn with plain straight lines from an actor to what
 * it takes part in — stepping one round a corner would say something the
 * notation does not mean. Everything else on a Tingraph sheet turns square.
 */
function readsStraight(category: DiagramCategory): boolean {
  return category === "usecase";
}

/**
 * Where a straight line meets a shape: the point on its outline in the
 * direction of the other shape, round the curve when the shape is an ellipse.
 * A side the reader pinned wins, the way it does on a square route.
 */
function directAnchor(box: Box, towards: Point, side?: Side): Point {
  if (side) {
    return sideAnchor(box, side);
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = towards.x - cx;
  const dy = towards.y - cy;
  const span = Math.hypot(dx, dy);
  if (span < 1) {
    return { x: Math.round(cx), y: Math.round(cy) };
  }
  const ux = dx / span;
  const uy = dy / span;
  const rx = Math.max(1, box.width / 2);
  const ry = Math.max(1, box.height / 2);
  const reach = box.round
    ? 1 / Math.hypot(ux / rx, uy / ry)
    : Math.min(
        Math.abs(ux) < 1e-6 ? Infinity : rx / Math.abs(ux),
        Math.abs(uy) < 1e-6 ? Infinity : ry / Math.abs(uy),
      );
  return { x: Math.round(cx + ux * reach), y: Math.round(cy + uy * reach) };
}

/**
 * The two sides a connector uses when the reader has not named them.
 *
 * The notation's own axis wins whenever the boxes are clear of each other both
 * ways; when they are stacked, or standing side by side, the axis that
 * separates them wins instead. An org chart therefore always leaves the bottom
 * of a box and meets the top of the one below, which is the rule a reporting
 * line is drawn by.
 */
export function sidesFor(from: Box, to: Box, rules: Rules): [Side, Side] {
  const apart = gap(from.y, from.height, to.y, to.height);
  const beside = gap(from.x, from.width, to.x, to.width);
  const upright =
    apart > 0 === beside > 0 ? readsUpright(rules) : apart > 0;
  if (upright) {
    return to.y + to.height / 2 >= from.y + from.height / 2
      ? ["bottom", "top"]
      : ["top", "bottom"];
  }
  return to.x + to.width / 2 >= from.x + from.width / 2
    ? ["right", "left"]
    : ["left", "right"];
}

/** Drops corners that turn nothing: repeats, and points mid-way along a leg. */
function tidy(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && near(last.x, point.x) && near(last.y, point.y)) {
      continue;
    }
    const before = out[out.length - 2];
    if (
      before &&
      last &&
      ((near(before.x, last.x) && near(last.x, point.x)) ||
        (near(before.y, last.y) && near(last.y, point.y)))
    ) {
      out[out.length - 1] = point;
      continue;
    }
    out.push(point);
  }
  return out.length >= 2 ? out : [points[0], points[points.length - 1]];
}

/**
 * Where the middle leg of a facing route sits.
 *
 * An org chart puts it a fixed distance under the box the line leaves, so
 * every child of that box turns on the same rail and the chart reads as one
 * bracket rather than as a fan. A tree hangs its children the same way. Every
 * other notation splits the gap.
 */
function railBetween(leave: number, meet: number, category: DiagramCategory): number {
  const span = meet - leave;
  const middle = leave + span / 2;
  const hangs = category === "org" || category === "tree";
  if (!hangs || Math.abs(span) < 2 * MIN_GAP + ORG_RAIL) {
    return middle;
  }
  return leave + Math.sign(span) * ORG_RAIL;
}

export interface RouteOptions extends Rules {
  fromSide?: Side;
  toSide?: Side;
  /**
   * The height each end meets its box at, when that end is tied to a port
   * rather than to the box as a whole. A port is only reachable from a side
   * that faces across the page, so an end that names one leaves left or right
   * whatever the notation's own axis would have chosen.
   */
  fromAt?: number;
  toAt?: number;
  /** where the reader dragged the middle leg to, on its own axis */
  bend?: number | null;
  /**
   * How long the first and the last leg must run straight, so the head drawn
   * on that end comes out full size — see `headRoom`. Missing means a plain
   * end, which only needs the usual stub.
   */
  heads?: readonly [number, number];
  /**
   * The other elements on the sheet. A route that would cross one is cut
   * again around it; one that crosses nothing is left exactly as the
   * notation's own rule draws it.
   */
  avoid?: readonly Box[];
  /**
   * The routes of the other connectors a line must not run along. Two lines
   * drawn one on top of the other read as one, so a route that would share a
   * stretch with any of these is cut again beside it.
   */
  lines?: readonly (readonly Point[])[];
}

/**
 * How long the end leg under a head has to be for the head to come out at
 * its full size.
 *
 * Excalidraw shrinks an arrowhead to half the length of the leg it sits on
 * (a quarter for a diamond), so a head on a short leg is drawn small — the
 * same connector would otherwise be one size on one line and another size on
 * the next. These are its own sizes, doubled.
 */
export function headRoom(head: string | null | undefined): number {
  switch (head) {
    case null:
    case undefined:
    case "":
      return 0;
    case "arrow":
      return 50;
    case "diamond":
    case "diamond_outline":
      return 48;
    case "crowfoot_many":
    case "crowfoot_one":
    case "crowfoot_one_or_many":
      return 40;
    default:
      return 30;
  }
}

/** The straight run each end of a connector drawn with these heads needs. */
export function headsOf(element: {
  startArrowhead?: string | null;
  endArrowhead?: string | null;
}): [number, number] {
  return [headRoom(element.startArrowhead), headRoom(element.endArrowhead)];
}

/** The side of `box` that faces `other`: the only pair a port can be met on. */
function acrossSide(box: Box, other: Box): Side {
  return other.x + other.width / 2 >= box.x + box.width / 2 ? "right" : "left";
}

/**
 * The one side two boxes standing above each other both leave by.
 *
 * A relation tied to a row can only be met from the left or the right, so two
 * tables in the same column have no room to face each other: the line leaves
 * both on whichever side has the shorter way out, and runs down past them.
 * That is the three-legged route an entity relationship diagram is normally
 * drawn with, rather than the wrap-around a facing pair would be given.
 */
function sameSide(from: Box, to: Box): Side {
  const left = Math.min(from.x, to.x);
  const right = Math.max(from.x + from.width, to.x + to.width);
  const out = right - (from.x + from.width) + (right - (to.x + to.width));
  const back = from.x - left + (to.x - left);
  return out <= back ? "right" : "left";
}

/**
 * A line from a box back to itself: out of the right side above the middle,
 * round, and back in below it. The last leg is as long as the head on it
 * needs, so a self-transition's arrow is drawn whole like any other.
 */
export function selfLoop(box: Box, head: number): Point[] {
  const right = box.x + box.width;
  const cy = box.y + box.height / 2;
  const rise = Math.min(14, box.height / 3);
  const reach = right + Math.max(36, head + 6);
  return [
    { x: right, y: cy - rise },
    { x: reach, y: cy - rise },
    { x: reach, y: cy + rise },
    { x: right, y: cy + rise },
  ].map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) }));
}

/**
 * The corners of one connector, from the outline of one box to the outline of
 * the other. The first and last points always sit on a box, and every leg runs
 * either straight down the page or straight across it.
 */
export function routeBetween(from: Box, to: Box, options: RouteOptions): Point[] {
  // one box joined to itself: a state's self-transition
  if (
    from.x === to.x &&
    from.y === to.y &&
    from.width === to.width &&
    from.height === to.height
  ) {
    return selfLoop(from, options.heads?.[1] ?? 0);
  }
  if (readsStraight(options.category)) {
    const here = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const there = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
    return [
      directAnchor(from, there, options.fromSide),
      directAnchor(to, here, options.toSide),
    ];
  }
  const sides = autoSides(from, to, options);
  const ruled = ruleRoute(from, to, options, sides);
  const avoid = options.avoid ?? [];
  const lines = options.lines ?? [];
  if (
    (avoid.length === 0 && lines.length === 0) ||
    (!crosses(ruled, avoid) && runsAlong(ruled, lines) <= SNAP)
  ) {
    return ruled;
  }
  // the notation's own route runs into something: the line is cut again
  // round it, keeping the same ends whenever they can be kept
  return aroundRoute(from, to, options, sides) ?? ruled;
}

/** The two sides a connector uses unless the reader pinned one. */
function autoSides(from: Box, to: Box, options: RouteOptions): [Side, Side] {
  // an end tied to a port leaves across the page whatever the notation's own
  // axis says, because a row can only be reached from the side of its box
  const ported = options.fromAt !== undefined || options.toAt !== undefined;
  return ported
    ? gap(from.x, from.width, to.x, to.width) > 2 * MIN_GAP
      ? [acrossSide(from, to), acrossSide(to, from)]
      : [sameSide(from, to), sameSide(from, to)]
    : sidesFor(from, to, options);
}

/** The route the notation's own rule draws, seeing nothing but its two boxes. */
function ruleRoute(
  from: Box,
  to: Box,
  options: RouteOptions,
  auto: [Side, Side],
): Point[] {
  const fromSide = options.fromSide ?? auto[0];
  const toSide = options.toSide ?? auto[1];
  const a = sideAnchor(from, fromSide, to, options.fromAt);
  const b = sideAnchor(to, toSide, from, options.toAt);
  const upright = UPRIGHT[fromSide];
  // the straight run each end needs: the usual stub, or more under a head
  const [headA, headB] = options.heads ?? [0, 0];
  const runA = Math.max(STUB, headA);
  const runB = Math.max(STUB, headB);

  // the route is cut in "along the leg" and "across it" coordinates, so one
  // piece of arithmetic serves a line running down the page and one running
  // across it
  const along = (p: Point) => (upright ? p.y : p.x);
  const across = (p: Point) => (upright ? p.x : p.y);
  const at = (a1: number, a2: number): Point =>
    upright ? { x: Math.round(a2), y: Math.round(a1) } : { x: Math.round(a1), y: Math.round(a2) };

  const out = AWAY[fromSide];
  const stubA = at(along(a) + out * runA, across(a));

  if (UPRIGHT[toSide] !== upright) {
    // the two ends leave on different axes: one turn is enough when both legs
    // run the way their own side faces
    // Keep both ends normal to their sides. Swapping these coordinates makes
    // the last leg run along the target edge, so its arrowhead points sideways.
    const corner = at(along(b), across(a));
    const legOk = Math.sign(along(b) - along(a)) === out || near(along(a), along(b));
    const meetOk =
      Math.sign(across(a) - across(b)) === AWAY[toSide] || near(across(a), across(b));
    // a turn that comes too close to either end would leave a head there
    // drawn small, so the route steps out on stubs instead
    const roomy =
      Math.abs(along(b) - along(a)) >= headA && Math.abs(across(a) - across(b)) >= headB;
    if (legOk && meetOk && roomy) {
      return tidy([a, corner, b]);
    }
    const stubB = UPRIGHT[toSide]
      ? { x: b.x, y: b.y + AWAY[toSide] * runB }
      : { x: b.x + AWAY[toSide] * runB, y: b.y };
    return tidy([a, stubA, at(along(stubA), across(stubB)), stubB, b]);
  }

  const back = AWAY[toSide];
  const stubB = at(along(b) + back * runB, across(b));

  if (out === -back) {
    // the ends face each other
    const room = (along(b) - along(a)) * out;
    if (room > 2 * MIN_GAP) {
      if (near(across(a), across(b))) {
        return [a, at(along(b), across(a))];
      }
      const rail = railBetween(along(a), along(b), options.category);
      // the middle leg keeps clear of both ends, and far enough from an end
      // with a head on it that the head is drawn whole; when the gap is too
      // narrow for both it is shared out in proportion
      const lo = Math.max(MIN_GAP, headA);
      const hi = Math.max(MIN_GAP, headB);
      const limit = (value: number) => {
        if (room < lo + hi) {
          return along(a) + (out * room * lo) / (lo + hi);
        }
        return out > 0
          ? Math.min(Math.max(value, along(a) + lo), along(b) - hi)
          : Math.max(Math.min(value, along(a) - lo), along(b) + hi);
      };
      const line = limit(options.bend ?? rail);
      return tidy([a, at(line, across(a)), at(line, across(b)), b]);
    }
    // no room between them: the connector goes round the outside
    const low = Math.min(
      upright ? from.x : from.y,
      upright ? to.x : to.y,
    ) - CLEAR;
    const high =
      Math.max(
        upright ? from.x + from.width : from.y + from.height,
        upright ? to.x + to.width : to.y + to.height,
      ) + CLEAR;
    // the reader's own rail is a coordinate along the route, which means
    // nothing to a route that has to go round the outside; it is left out
    const detour = Math.abs(across(a) - low) <= Math.abs(high - across(a)) ? low : high;
    return tidy([
      a,
      stubA,
      at(along(stubA), detour),
      at(along(stubB), detour),
      stubB,
      b,
    ]);
  }

  // both ends leave the same way: the connector turns past the further of
  // them, and a rail the reader dragged may move further out but never back
  // through either box
  const beyond =
    out > 0
      ? Math.max(along(stubA), along(stubB))
      : Math.min(along(stubA), along(stubB));
  const line =
    options.bend == null
      ? beyond
      : out > 0
        ? Math.max(options.bend, beyond)
        : Math.min(options.bend, beyond);
  return tidy([a, at(line, across(a)), at(line, across(b)), b]);
}

// ------------------------------------------------------------ going round

/** How close a detour may pass an element it does not join. */
const KEEP = 12;
/** How far beside an element a detour runs: a channel, not a scrape. */
const LANE = 24;
/** What one more turn costs, in sheet units: a short way round beats a busy one. */
const TURN = 40;
/** What leaving or meeting a box by a side the notation would not use costs. */
const OFF_SIDE = 60;
/** What running along another connector costs, for each unit of the stretch. */
const SHARED = 20;
/** What meeting another connector at a point costs: a crossing, or a touch. */
const CROSS = 30;
/** How far round the two boxes a detour may look for room. */
const SEARCH = 360;

/** Whether one leg passes through a box grown by `keep` on every side. */
function legHits(p: Point, q: Point, box: Box, keep: number): boolean {
  return (
    Math.min(p.x, q.x) < box.x + box.width + keep &&
    box.x - keep < Math.max(p.x, q.x) &&
    Math.min(p.y, q.y) < box.y + box.height + keep &&
    box.y - keep < Math.max(p.y, q.y)
  );
}

/** Whether a route runs through any of these boxes. */
function crosses(points: readonly Point[], boxes: readonly Box[]): boolean {
  for (let i = 1; i < points.length; i++) {
    for (const box of boxes) {
      if (legHits(points[i - 1], points[i], box, 2)) {
        return true;
      }
    }
  }
  return false;
}

/** How long a stretch two lines lying on one rule share. */
function sharedRun(p: Point, q: Point, r: Point, s: Point): number {
  const flat = (a: Point, b: Point) => Math.abs(a.y - b.y) < 1;
  const tall = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1;
  if (flat(p, q) && flat(r, s) && Math.abs(p.y - r.y) < 3) {
    return Math.max(
      0,
      Math.min(Math.max(p.x, q.x), Math.max(r.x, s.x)) -
        Math.max(Math.min(p.x, q.x), Math.min(r.x, s.x)),
    );
  }
  if (tall(p, q) && tall(r, s) && Math.abs(p.x - r.x) < 3) {
    return Math.max(
      0,
      Math.min(Math.max(p.y, q.y), Math.max(r.y, s.y)) -
        Math.max(Math.min(p.y, q.y), Math.min(r.y, s.y)),
    );
  }
  return 0;
}

/** How much of a route lies on top of the other connectors. */
export function runsAlong(
  points: readonly Point[],
  lines: readonly (readonly Point[])[],
): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    for (const line of lines) {
      for (let j = 1; j < line.length; j++) {
        total += sharedRun(points[i - 1], points[i], line[j - 1], line[j]);
      }
    }
  }
  return total;
}

/** up, right, down, left — the way a leg runs, as a step on the grid. */
const STEP: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const HEADING: Record<Side, number> = { top: 0, right: 1, bottom: 2, left: 3 };

/** A small binary heap of grid states, cheapest first. */
class Queue {
  private costs: number[] = [];
  private states: number[] = [];
  get size(): number {
    return this.states.length;
  }
  get least(): number {
    return this.costs[0];
  }
  push(cost: number, state: number): void {
    const { costs, states } = this;
    let i = states.length;
    costs.push(cost);
    states.push(state);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (costs[up] <= cost) break;
      costs[i] = costs[up];
      states[i] = states[up];
      i = up;
    }
    costs[i] = cost;
    states[i] = state;
  }
  pop(): number {
    const { costs, states } = this;
    const top = states[0];
    const cost = costs.pop() as number;
    const state = states.pop() as number;
    const n = states.length;
    if (n > 0) {
      let i = 0;
      while (true) {
        let child = 2 * i + 1;
        if (child >= n) break;
        if (child + 1 < n && costs[child + 1] < costs[child]) child += 1;
        if (costs[child] >= cost) break;
        costs[i] = costs[child];
        states[i] = states[child];
        i = child;
      }
      costs[i] = cost;
      states[i] = state;
    }
    return top;
  }
}

/**
 * A square route round whatever stands between two boxes.
 *
 * The sheet is cut into a sparse grid — a rule a channel's width outside every
 * element nearby, the middle of the room between them, and the stubs each end
 * leaves by — and the cheapest walk along it is taken, where every turn and
 * every stretch laid along another connector costs extra. Each end still
 * leaves its box square, from the middle of a side and on a stub long enough
 * for its head, so a detour reads as the same kind of line as the rest.
 */
function aroundRoute(
  from: Box,
  to: Box,
  options: RouteOptions,
  auto: [Side, Side],
): Point[] | null {
  const [headA, headB] = options.heads ?? [0, 0];
  const runA = Math.max(STUB, headA);
  const runB = Math.max(STUB, headB);
  const choices = (pinned: Side | undefined, port: number | undefined): Side[] =>
    pinned ? [pinned] : port !== undefined ? ["left", "right"] : SIDES;
  const out = (anchor: Point, side: Side, run: number): Point => {
    const [dx, dy] = STEP[HEADING[side]];
    return { x: anchor.x + dx * run, y: anchor.y + dy * run };
  };
  const preferA = options.fromSide ?? auto[0];
  const preferB = options.toSide ?? auto[1];
  const startsA = choices(options.fromSide, options.fromAt).map((side) => {
    const anchor = sideAnchor(from, side, to, options.fromAt);
    return { side, anchor, stub: out(anchor, side, runA), cost: side === preferA ? 0 : OFF_SIDE };
  });
  const endsB = choices(options.toSide, options.toAt).map((side) => {
    const anchor = sideAnchor(to, side, from, options.toAt);
    return { side, anchor, stub: out(anchor, side, runB), cost: side === preferB ? 0 : OFF_SIDE };
  });

  // only what stands near the two boxes can be in the way
  const area = {
    x: Math.min(from.x, to.x) - SEARCH,
    y: Math.min(from.y, to.y) - SEARCH,
    width: Math.max(from.x + from.width, to.x + to.width) - Math.min(from.x, to.x) + 2 * SEARCH,
    height: Math.max(from.y + from.height, to.y + to.height) - Math.min(from.y, to.y) + 2 * SEARCH,
  };
  const blocks = [
    ...(options.avoid ?? []).filter((box) => legHits(
      { x: box.x, y: box.y },
      { x: box.x + box.width, y: box.y + box.height },
      area,
      0,
    )),
    from,
    to,
  ];

  const rules = (pick: (box: Box) => [number, number], stubs: number[]): number[] => {
    // the stubs are where the ends really are, so they are kept exactly; a
    // channel rule that lands within a snap of one is dropped, or the walk
    // could take a step of two or three units sideways between them
    const fixed = [...new Set(stubs.map(Math.round))];
    const lanes = blocks.flatMap((box) => {
      const [low, high] = pick(box);
      return [Math.round(low - LANE), Math.round(high + LANE)];
    });
    const kept = [...fixed];
    const clear = (value: number) => kept.every((other) => Math.abs(other - value) > SNAP);
    for (const value of lanes.sort((p, q) => p - q)) {
      if (clear(value)) kept.push(value);
    }
    const sorted = kept.sort((p, q) => p - q);
    // the middle of every wide gap, so a channel between two elements runs
    // down its centre rather than against one of them
    const out: number[] = [];
    sorted.forEach((value, index) => {
      const next = sorted[index + 1];
      out.push(value);
      if (next !== undefined && next - value > 2 * LANE) {
        out.push(Math.round((value + next) / 2));
      }
    });
    return out;
  };
  const xs = rules(
    (box) => [box.x, box.x + box.width],
    [...startsA, ...endsB].flatMap((end) => [end.stub.x, end.anchor.x]),
  );
  const ys = rules(
    (box) => [box.y, box.y + box.height],
    [...startsA, ...endsB].flatMap((end) => [end.stub.y, end.anchor.y]),
  );
  const n = xs.length;
  const m = ys.length;
  if (n * m > 60000) {
    return null;
  }
  const column = new Map(xs.map((x, i) => [x, i]));
  const row = new Map(ys.map((y, j) => [y, j]));

  const free = new Uint8Array(n * m);
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < n; i++) {
      const x = xs[i];
      const y = ys[j];
      free[j * n + i] = blocks.some(
        (box) =>
          x > box.x - KEEP &&
          x < box.x + box.width + KEEP &&
          y > box.y - KEEP &&
          y < box.y + box.height + KEEP,
      )
        ? 0
        : 1;
    }
  }
  const open = (p: Point, q: Point) => !blocks.some((box) => legHits(p, q, box, KEEP - 0.5));

  const others = options.lines ?? [];
  const shared = (p: Point, q: Point) => {
    let total = 0;
    for (const line of others) {
      for (let k = 1; k < line.length; k++) {
        total += sharedRun(p, q, line[k - 1], line[k]);
      }
    }
    return total;
  };

  // the stub an end leaves by is part of the line too: one laid on top of
  // another connector's costs the same as any other shared stretch
  const starts = startsA.map((entry) => ({
    ...entry,
    cost: entry.cost + SHARED * shared(entry.anchor, entry.stub),
  }));
  const ends = endsB.map((entry) => ({
    ...entry,
    cost: entry.cost + SHARED * shared(entry.stub, entry.anchor),
  }));

  const cells = n * m;
  // a corner, or a crossing, on another connector's line: two lines that meet
  // at a point read as one line turning there, so a walk avoids it if it can
  const touched = new Uint8Array(cells);
  for (const line of others) {
    for (let k = 1; k < line.length; k++) {
      const p = line[k - 1];
      const q = line[k];
      if (Math.abs(p.x - q.x) < 1) {
        const i = column.get(Math.round(p.x));
        if (i === undefined) continue;
        for (let j = 0; j < m; j++) {
          if (ys[j] >= Math.min(p.y, q.y) && ys[j] <= Math.max(p.y, q.y)) touched[j * n + i] = 1;
        }
      } else if (Math.abs(p.y - q.y) < 1) {
        const j = row.get(Math.round(p.y));
        if (j === undefined) continue;
        for (let i = 0; i < n; i++) {
          if (xs[i] >= Math.min(p.x, q.x) && xs[i] <= Math.max(p.x, q.x)) touched[j * n + i] = 1;
        }
      }
    }
  }
  const cost = new Float64Array(cells * 4).fill(Infinity);
  const prev = new Int32Array(cells * 4).fill(-1);
  const queue = new Queue();
  for (const start of starts) {
    const i = column.get(Math.round(start.stub.x));
    const j = row.get(Math.round(start.stub.y));
    if (i === undefined || j === undefined || !free[j * n + i]) continue;
    const state = (j * n + i) * 4 + HEADING[start.side];
    if (start.cost < cost[state]) {
      cost[state] = start.cost;
      queue.push(start.cost, state);
    }
  }
  const landing = new Map<number, typeof ends>();
  for (const end of ends) {
    const i = column.get(Math.round(end.stub.x));
    const j = row.get(Math.round(end.stub.y));
    if (i === undefined || j === undefined || !free[j * n + i]) continue;
    const cell = j * n + i;
    landing.set(cell, [...(landing.get(cell) ?? []), end]);
  }

  let best = Infinity;
  let bestState = -1;
  let bestEnd: (typeof ends)[number] | null = null;
  while (queue.size > 0 && queue.least < best) {
    const spent = queue.least;
    const state = queue.pop();
    if (spent > cost[state]) continue;
    const cell = state >> 2;
    const heading = state & 3;
    for (const end of landing.get(cell) ?? []) {
      // the last leg runs into the box: arriving on its line costs nothing,
      // arriving across it is one more turn, and backing in is no route
      const inward = (HEADING[end.side] + 2) % 4;
      if (heading === HEADING[end.side]) continue;
      const total = spent + end.cost + (heading === inward ? 0 : TURN);
      if (total < best) {
        best = total;
        bestState = state;
        bestEnd = end;
      }
    }
    const i = cell % n;
    const j = (cell - i) / n;
    for (let next = 0; next < 4; next++) {
      if (next === (heading + 2) % 4) continue;
      const ni = i + STEP[next][0];
      const nj = j + STEP[next][1];
      if (ni < 0 || nj < 0 || ni >= n || nj >= m || !free[nj * n + ni]) continue;
      const here = { x: xs[i], y: ys[j] };
      const there = { x: xs[ni], y: ys[nj] };
      if (!open(here, there)) continue;
      const length = Math.abs(there.x - here.x) + Math.abs(there.y - here.y);
      const step =
        spent +
        length +
        (next === heading ? 0 : TURN) +
        SHARED * shared(here, there) +
        (touched[nj * n + ni] ? CROSS : 0);
      const target = (nj * n + ni) * 4 + next;
      if (step < cost[target]) {
        cost[target] = step;
        prev[target] = state;
        queue.push(step, target);
      }
    }
  }
  if (!bestEnd || bestState < 0) {
    return null;
  }
  const walk: Point[] = [];
  for (let state = bestState; state >= 0; state = prev[state]) {
    const cell = state >> 2;
    const i = cell % n;
    walk.push({ x: xs[i], y: ys[(cell - i) / n] });
  }
  walk.reverse();
  const first = walk[0];
  const start =
    starts.find(
      (entry) => Math.round(entry.stub.x) === first.x && Math.round(entry.stub.y) === first.y,
    ) ?? starts[0];
  return square([start.anchor, ...walk, bestEnd.anchor]);
}

/**
 * Drops the corners of a walk that turn nothing. Unlike `tidy` it does not
 * snap: every leg of a walk already runs square, and snapping two rules a few
 * units apart onto each other would tilt the leg between them.
 */
function square(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - point.x) < 0.5 && Math.abs(last.y - point.y) < 0.5) {
      continue;
    }
    const before = out[out.length - 2];
    if (
      before &&
      last &&
      ((Math.abs(before.x - last.x) < 0.5 && Math.abs(last.x - point.x) < 0.5) ||
        (Math.abs(before.y - last.y) < 0.5 && Math.abs(last.y - point.y) < 0.5))
    ) {
      out[out.length - 1] = point;
      continue;
    }
    out.push(point);
  }
  return out;
}

/**
 * The leg the reader may take hold of.
 *
 * It is the middle leg of a route that turns twice — the rail a chart hangs
 * its children off, the channel a flow crosses between two boxes. That leg
 * always runs across the route rather than along it, so moving it is the one
 * number a connector carries. A straight line, a single turn, and a route that
 * has to go round the outside have no leg to offer.
 */
export function movableLeg(
  points: readonly Point[],
): { upright: boolean; value: number; at: Point } | null {
  if (points.length !== 4) {
    return null;
  }
  const [, a, b] = points;
  const upright = Math.abs(b.x - a.x) < Math.abs(b.y - a.y);
  return {
    upright,
    // the leg moves on the axis it does not run along
    value: upright ? a.x : a.y,
    at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
  };
}

/**
 * The side dot the pointer has hold of, if it has hold of one.
 *
 * A dot sits on the outline, and is grabbed from the outline: the pointer may
 * reach a little past the edge, but only a little way inside it. Starting a
 * connector anywhere further in leaves the side to the notation, which is what
 * most connectors want, so a press in the middle of a short box never reads as
 * a press on its top edge.
 */
export function gripSide(box: Box, point: Point, reach: number): Side | undefined {
  let held: Side | undefined;
  let closest = Infinity;
  for (const side of SIDES) {
    const dot = sideAnchor(box, side);
    const upright = UPRIGHT[side];
    // how far past the outline the pointer sits; negative when it is inside
    const past = (upright ? point.y - dot.y : point.x - dot.x) * AWAY[side];
    const along = upright ? Math.abs(point.x - dot.x) : Math.abs(point.y - dot.y);
    if (past > reach || past < -reach / 2 || along > reach) {
      continue;
    }
    const span = Math.abs(past) + along;
    if (span < closest) {
      closest = span;
      held = side;
    }
  }
  return held;
}

/** Whether a point is inside a box, with a little room around it. */
export function inside(box: Box, point: Point, slack = 0): boolean {
  return (
    point.x >= box.x - slack &&
    point.x <= box.x + box.width + slack &&
    point.y >= box.y - slack &&
    point.y <= box.y + box.height + slack
  );
}

/** A route as Excalidraw holds one: an origin, and corners measured from it. */
export function asElement(points: readonly Point[]): {
  x: number;
  y: number;
  points: Array<[number, number]>;
  width: number;
  height: number;
} {
  const [first] = points;
  const local = points.map(
    (point) => [point.x - first.x, point.y - first.y] as [number, number],
  );
  const xs = local.map((point) => point[0]);
  const ys = local.map((point) => point[1]);
  return {
    x: first.x,
    y: first.y,
    points: local,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

/**
 * An `at` that can never read true, so the route is cut again the next time
 * the sheet settles. Written when the reader moves a connector's own leg or
 * re-ties one of its ends, which is a change no box has made.
 */
export const RECUT = "recut";

const ROUTE_VERSION = "r2";

const box = (b: Box) =>
  `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.width)},${Math.round(b.height)}`;

/**
 * Everything a route was cut from, in one line: the two boxes, the sides and
 * middle leg the reader chose, and where the connector ended up on the sheet.
 * A connector whose signature still reads true is left exactly as it is, which
 * is what keeps a generated drawing's routing — the legs that step around the
 * shapes in the way — from being thrown away and guessed again.
 */
export function linkSignature(
  from: Box,
  to: Box,
  link: {
    from: { side?: Side };
    to: { side?: Side };
    bend?: number | null;
    /** the two port heights the route was cut against, when it has any */
    fromAt?: number;
    toAt?: number;
  },
  origin: {
    x: number;
    y: number;
    points?: ReadonlyArray<readonly [number, number]>;
  },
): string {
  return [
    ROUTE_VERSION,
    box(from),
    box(to),
    link.from.side ?? "",
    link.to.side ?? "",
    link.bend ?? "",
    link.fromAt ?? "",
    link.toAt ?? "",
    `${Math.round(origin.x)},${Math.round(origin.y)}`,
    origin.points?.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(";") ?? "",
  ].join("|");
}

/** A signature read back into what it was cut from, or null for one that is not. */
export function readSignature(signature: string): {
  from: Box;
  to: Box;
  sides: string;
  bend: string;
  fromAt: number | null;
  toAt: number | null;
  origin: Point;
  points: string;
} | null {
  const parts = signature.split("|");
  if (parts[0] !== ROUTE_VERSION || parts.length !== 10) {
    return null;
  }
  const numbers = (text: string) => text.split(",").map(Number);
  const boxOf = (text: string): Box | null => {
    const [x, y, width, height] = numbers(text);
    return [x, y, width, height].every(Number.isFinite) ? { x, y, width, height } : null;
  };
  const from = boxOf(parts[1]);
  const to = boxOf(parts[2]);
  const [ox, oy] = numbers(parts[8]);
  if (!from || !to || !Number.isFinite(ox) || !Number.isFinite(oy)) {
    return null;
  }
  const height = (text: string) => (text === "" ? null : Number(text));
  return {
    from,
    to,
    sides: `${parts[3]}|${parts[4]}`,
    bend: parts[5],
    fromAt: height(parts[6]),
    toAt: height(parts[7]),
    origin: { x: ox, y: oy },
    points: parts[9],
  };
}
