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
export function sideAnchor(box: Box, side: Side, other?: Box): Point {
  if (UPRIGHT[side]) {
    return { x: Math.round(box.x + box.width / 2), y: edgeOf(box, side) };
  }
  const y =
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
  if (rules.category === "bpmn") {
    return false;
  }
  return rules.direction !== "right";
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
 * bracket rather than as a fan. Every other notation splits the gap.
 */
function railBetween(leave: number, meet: number, category: DiagramCategory): number {
  const span = meet - leave;
  const middle = leave + span / 2;
  if (category !== "org" || Math.abs(span) < 2 * MIN_GAP + ORG_RAIL) {
    return middle;
  }
  return leave + Math.sign(span) * ORG_RAIL;
}

interface RouteOptions extends Rules {
  fromSide?: Side;
  toSide?: Side;
  /** where the reader dragged the middle leg to, on its own axis */
  bend?: number | null;
}

/**
 * The corners of one connector, from the outline of one box to the outline of
 * the other. The first and last points always sit on a box, and every leg runs
 * either straight down the page or straight across it.
 */
export function routeBetween(from: Box, to: Box, options: RouteOptions): Point[] {
  const auto = sidesFor(from, to, options);
  const fromSide = options.fromSide ?? auto[0];
  const toSide = options.toSide ?? auto[1];
  const a = sideAnchor(from, fromSide, to);
  const b = sideAnchor(to, toSide, from);
  const upright = UPRIGHT[fromSide];

  // the route is cut in "along the leg" and "across it" coordinates, so one
  // piece of arithmetic serves a line running down the page and one running
  // across it
  const along = (p: Point) => (upright ? p.y : p.x);
  const across = (p: Point) => (upright ? p.x : p.y);
  const at = (a1: number, a2: number): Point =>
    upright ? { x: Math.round(a2), y: Math.round(a1) } : { x: Math.round(a1), y: Math.round(a2) };

  const out = AWAY[fromSide];
  const stubA = at(along(a) + out * STUB, across(a));

  if (UPRIGHT[toSide] !== upright) {
    // the two ends leave on different axes: one turn is enough when both legs
    // run the way their own side faces
    const corner = at(along(a), across(b));
    const legOk = Math.sign(along(b) - along(a)) === out || near(along(a), along(b));
    const meetOk =
      Math.sign(across(a) - across(b)) === AWAY[toSide] || near(across(a), across(b));
    if (legOk && meetOk) {
      return tidy([a, corner, b]);
    }
    const stubB = UPRIGHT[toSide]
      ? { x: b.x, y: b.y + AWAY[toSide] * STUB }
      : { x: b.x + AWAY[toSide] * STUB, y: b.y };
    return tidy([a, stubA, at(along(stubA), across(stubB)), stubB, b]);
  }

  const back = AWAY[toSide];
  const stubB = at(along(b) + back * STUB, across(b));

  if (out === -back) {
    // the ends face each other
    const room = (along(b) - along(a)) * out;
    if (room > 2 * MIN_GAP) {
      if (near(across(a), across(b))) {
        return [a, at(along(b), across(a))];
      }
      const rail = railBetween(along(a), along(b), options.category);
      const limit = (value: number) =>
        out > 0
          ? Math.min(Math.max(value, along(a) + MIN_GAP), along(b) - MIN_GAP)
          : Math.max(Math.min(value, along(a) - MIN_GAP), along(b) + MIN_GAP);
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

  // both ends leave the same way: the connector turns past the further of them
  const beyond =
    out > 0
      ? Math.max(along(stubA), along(stubB))
      : Math.min(along(stubA), along(stubB));
  const line = options.bend ?? beyond;
  return tidy([a, at(line, across(a)), at(line, across(b)), b]);
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
  },
  origin: { x: number; y: number },
): string {
  return [
    box(from),
    box(to),
    link.from.side ?? "",
    link.to.side ?? "",
    link.bend ?? "",
    `${Math.round(origin.x)},${Math.round(origin.y)}`,
  ].join("|");
}
