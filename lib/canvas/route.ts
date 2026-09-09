/**
 * Route geometry for the connectors Tingraph draws. Kept apart from the scene
 * so it can be exercised without a browser.
 */

export type Corner = readonly [number, number];

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The parts of a bound arrow the clipping needs. */
export interface Bound {
  x: number;
  y: number;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
}

const NUDGE = 0.01;
const alignedX = (a: Corner, b: Corner) => Math.abs(a[0] - b[0]) < NUDGE;
const alignedY = (a: Corner, b: Corner) => Math.abs(a[1] - b[1]) < NUDGE;

/** "v" when a leg runs down the page, "h" when it runs across, null when it is
 *  skewed or has no length at all. */
function legAxis(a: Corner, b: Corner): "h" | "v" | null {
  const down = alignedX(a, b);
  const across = alignedY(a, b);
  if (down === across) {
    return null;
  }
  return down ? "v" : "h";
}

/** Which way a leg runs, or null when it is skewed or has no length. */
export function legRun(
  a: Corner,
  b: Corner,
): "up" | "down" | "left" | "right" | null {
  const axis = legAxis(a, b);
  if (axis === "v") {
    return b[1] > a[1] ? "down" : "up";
  }
  if (axis === "h") {
    return b[0] > a[0] ? "right" : "left";
  }
  return null;
}

/** Two ends and one step between them, taken along the longer run. */
function stepBetween(from: Corner, to: Corner): Corner[] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (Math.abs(dx) < NUDGE) {
    return [from, [from[0], to[1]]];
  }
  if (Math.abs(dy) < NUDGE) {
    return [from, [to[0], from[1]]];
  }
  return Math.abs(dy) >= Math.abs(dx)
    ? [from, [from[0], from[1] + dy / 2], [to[0], from[1] + dy / 2], to]
    : [from, [from[0] + dx / 2, from[1]], [from[0] + dx / 2, to[1]], to];
}

/** Drops corners that turn nothing: repeats, and points mid-way along a leg. */
function tidy(points: Corner[]): Corner[] {
  const out: Corner[] = [points[0]];
  for (const point of points.slice(1)) {
    const last = out[out.length - 1];
    if (alignedX(last, point) && alignedY(last, point)) {
      continue;
    }
    const before = out[out.length - 2];
    if (
      before &&
      ((alignedX(before, last) && alignedX(last, point)) ||
        (alignedY(before, last) && alignedY(last, point)))
    ) {
      out[out.length - 1] = point;
      continue;
    }
    out.push(point);
  }
  return out.length >= 2 ? out : [points[0], points[points.length - 1]];
}

/**
 * Pulls a route back to right angles without moving either end.
 *
 * A bound connector keeps up with the shapes it joins, and Excalidraw does that
 * by sliding the two ends along their outlines — which leaves the legs next to
 * them slanted. The legs in the middle are untouched, and a route always
 * alternates between running down the page and running across it, so one intact
 * leg is enough to say which way every other leg must run. The corners are then
 * re-cut against the ends, which is what makes the middle of the route shift
 * when a box moves. Returns null when the route is already square.
 */
export function squareRoute(points: readonly Corner[]): Corner[] | null {
  if (points.length < 2) {
    return null;
  }
  const legs = points.length - 1;
  let skewed = false;
  for (let i = 0; i < legs; i++) {
    if (!alignedX(points[i], points[i + 1]) && !alignedY(points[i], points[i + 1])) {
      skewed = true;
      break;
    }
  }
  if (!skewed) {
    return null;
  }

  const from = points[0];
  const to = points[legs];
  // the legs that touch neither end were left alone, so they are the ones to
  // read the alternation off; fall back to any leg that still has a direction
  let anchor = -1;
  let axis: "h" | "v" | null = null;
  for (const range of [
    [1, legs - 1],
    [0, legs],
  ]) {
    for (let i = range[0]; i < range[1] && !axis; i++) {
      const found = legAxis(points[i], points[i + 1]);
      if (found) {
        anchor = i;
        axis = found;
      }
    }
    if (axis) {
      break;
    }
  }
  if (!axis || legs < 2) {
    return tidy(stepBetween(from, to));
  }

  const out: Corner[] = points.map((point) => [point[0], point[1]] as Corner);
  for (let i = 1; i < legs; i++) {
    const previous = (i - 1 - anchor) % 2 === 0 ? axis : axis === "h" ? "v" : "h";
    out[i] =
      previous === "v" ? [out[i - 1][0], out[i][1]] : [out[i][0], out[i - 1][1]];
  }
  // the closing leg has to land on the far end, and alternation guarantees it
  // reaches for the corner's free coordinate
  const closing = (legs - 1 - anchor) % 2 === 0 ? axis : axis === "h" ? "v" : "h";
  out[legs - 1] =
    closing === "v" ? [to[0], out[legs - 1][1]] : [out[legs - 1][0], to[1]];
  return tidy(out);
}

/**
 * Pulls an end that sits inside the shape it points at back onto that shape's
 * outline, along the leg it leaves by. An arrow drawn from the middle of a box
 * otherwise starts under the box's own caption. An end already on or beyond
 * the outline is left where Excalidraw put it, so nothing here fights the
 * binding when a box is dragged.
 */
export function clipEnds(
  points: readonly Corner[],
  arrow: Bound,
  boxes: Map<string, Bounds>,
): Corner[] | null {
  const out = points.map((point) => [point[0], point[1]] as Corner);
  let moved = false;
  const clip = (at: number, toward: number, id: string | undefined) => {
    const box = id ? boxes.get(id) : undefined;
    if (!box || at === toward) {
      return;
    }
    const here = { x: arrow.x + out[at][0], y: arrow.y + out[at][1] };
    if (
      here.x <= box.left ||
      here.x >= box.right ||
      here.y <= box.top ||
      here.y >= box.bottom
    ) {
      return;
    }
    const next = { x: arrow.x + out[toward][0], y: arrow.y + out[toward][1] };
    switch (legRun(out[at], out[toward])) {
      case "down":
        if (box.bottom < next.y) {
          out[at] = [out[at][0], box.bottom - arrow.y];
          moved = true;
        }
        break;
      case "up":
        if (box.top > next.y) {
          out[at] = [out[at][0], box.top - arrow.y];
          moved = true;
        }
        break;
      case "right":
        if (box.right < next.x) {
          out[at] = [box.right - arrow.x, out[at][1]];
          moved = true;
        }
        break;
      case "left":
        if (box.left > next.x) {
          out[at] = [box.left - arrow.x, out[at][1]];
          moved = true;
        }
        break;
    }
  };
  clip(0, 1, arrow.startBinding?.elementId);
  clip(out.length - 1, out.length - 2, arrow.endBinding?.elementId);
  return moved ? out : null;
}
