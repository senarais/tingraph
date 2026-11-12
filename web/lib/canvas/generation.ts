import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { unitOf } from "@/lib/canvas/units";
import { headRoom, type Box } from "@/lib/canvas/connect";

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width &&
  a.y < b.y + b.height && b.y < a.y + a.height;

/** Actual rendered bounds, including bound text which has no unit of its own. */
function nodeBounds(elements: readonly ExcalidrawElement[]): Map<string, Box> {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const zones = new Set(elements.filter((element) => unitOf(element)?.spec?.type === "zone")
    .map((element) => unitOf(element)!.unit));
  const boxes = new Map<string, Box>();
  for (const element of elements) {
    if (element.isDeleted) continue;
    const container = element.type === "text" && element.containerId
      ? byId.get(element.containerId) : undefined;
    const mark = unitOf(element) ?? (container ? unitOf(container) : null);
    if (mark?.kind !== "node" || zones.has(mark.unit)) continue;
    const prev = boxes.get(mark.unit);
    const x = Math.min(prev?.x ?? element.x, element.x);
    const y = Math.min(prev?.y ?? element.y, element.y);
    boxes.set(mark.unit, {
      x, y,
      width: Math.max(prev ? prev.x + prev.width : -Infinity, element.x + element.width) - x,
      height: Math.max(prev ? prev.y + prev.height : -Infinity, element.y + element.height) - y,
    });
  }
  return boxes;
}

/**
 * Past any of these, Generate asks before drawing: a diagram this big is slow
 * to lay out and hard to read once it is fitted to the screen.
 */
export const GENERATION_LIMITS = { characters: 12_000, nodes: 60, connectors: 100 } as const;

/** Why a source counts as large, one reason a line; empty when it does not. */
export function oversize(source: string, nodes: number, connectors: number): string[] {
  const reasons: string[] = [];
  const count = (n: number) => n.toLocaleString("en-US");
  if (nodes > GENERATION_LIMITS.nodes) {
    reasons.push(`${count(nodes)} nodes (more than ${GENERATION_LIMITS.nodes})`);
  }
  if (connectors > GENERATION_LIMITS.connectors) {
    reasons.push(`${count(connectors)} connectors (more than ${GENERATION_LIMITS.connectors})`);
  }
  if (source.length > GENERATION_LIMITS.characters) {
    reasons.push(
      `${count(source.length)} characters of source (more than ${count(GENERATION_LIMITS.characters)})`,
    );
  }
  return reasons;
}

/** What a reader calls an element: the words written on it, else its id. */
function nameOf(elements: readonly ExcalidrawElement[], unit: string): string {
  const byId = new Map(elements.map((element) => [element.id, element]));
  for (const element of elements) {
    if (element.isDeleted || element.type !== "text") continue;
    const owner = element.containerId ? byId.get(element.containerId) : element;
    if (owner && unitOf(owner)?.unit === unit) {
      const words = (element.text ?? "").replace(/\s+/g, " ").trim();
      if (words) return `“${words}”`;
    }
  }
  return unit.replace(/^[a-z]+(?:-node)?-/, "");
}

/** Fail before replacing the sheet or charging quota when rendered nodes collide. */
export function generationConflict(elements: readonly ExcalidrawElement[]): string | null {
  const boxes = [...nodeBounds(elements)];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (overlaps(boxes[i][1], boxes[j][1])) {
        return `Elements ${nameOf(elements, boxes[i][0])} and ${nameOf(elements, boxes[j][0])} overlap. Shorten their labels or split the diagram, then generate again. Your current sheet has been kept; no generation was used.`;
      }
    }
  }
  return null;
}

type Leg = { a: { x: number; y: number }; b: { x: number; y: number } };

/** The legs of a connector on the sheet, in sheet coordinates. */
function legsOf(arrow: ExcalidrawElement): Leg[] {
  const points = (arrow as unknown as { points?: ReadonlyArray<readonly [number, number]> })
    .points ?? [];
  const legs: Leg[] = [];
  for (let i = 1; i < points.length; i++) {
    legs.push({
      a: { x: arrow.x + points[i - 1][0], y: arrow.y + points[i - 1][1] },
      b: { x: arrow.x + points[i][0], y: arrow.y + points[i][1] },
    });
  }
  return legs;
}

/** A leg as a box with no thickness, so a caption laid across it overlaps it. */
const legBox = ({ a, b }: Leg): Box => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
});

/** The room a head takes at the end of a leg: back along it, and to each side. */
function headBox(tip: { x: number; y: number }, from: { x: number; y: number }, head: string | null): Box | null {
  if (!head) return null;
  const length = Math.hypot(tip.x - from.x, tip.y - from.y);
  const size = Math.min(headRoom(head) / 2, length / 2);
  if (size <= 0) return null;
  const back = { x: tip.x + ((from.x - tip.x) / length) * size, y: tip.y + ((from.y - tip.y) / length) * size };
  const side = size * 0.55;
  return {
    x: Math.min(tip.x, back.x) - side,
    y: Math.min(tip.y, back.y) - side,
    width: Math.abs(tip.x - back.x) + 2 * side,
    height: Math.abs(tip.y - back.y) + 2 * side,
  };
}

/** The strokes a chrome piece draws: a frame's four sides, a rule's one line. */
function strokesOf(element: ExcalidrawElement): Box[] {
  if (element.type === "rectangle") {
    const { x, y, width, height } = element;
    return [
      { x, y, width, height: 0 },
      { x, y: y + height, width, height: 0 },
      { x, y, width: 0, height },
      { x: x + width, y, width: 0, height },
    ];
  }
  if (element.type === "line" || element.type === "arrow") {
    return legsOf(element).map(legBox);
  }
  return [element];
}

/**
 * Places every connector caption where it reads: beside its own line, clear of
 * the elements, the other captions, the lines of the drawing — its own other
 * legs and every other connector — the heads on the ends, and the rules of a
 * pool or a partition. Text is measured by now, so the widths are real.
 *
 * A caption whose place is already clear stays exactly where the layout put
 * it, so a gateway's "Yes" still hugs the turn next to its source. One that is
 * not is tried along each leg of its own route, the longest first, on either
 * side; a caption with no route to ride is moved straight up or down instead.
 */
export function clearConnectorLabels(elements: ExcalidrawElement[]): ExcalidrawElement[] {
  const taken: Box[] = [...nodeBounds(elements).values()];
  const strokes: Box[] = [];
  const routes = new Map<string, ExcalidrawElement>();
  for (const element of elements) {
    if (element.isDeleted) continue;
    const mark = unitOf(element);
    if (element.type === "text" && !element.containerId && mark?.kind !== "edge" && mark?.kind !== "node") {
      taken.push(element);
    }
    if (mark && (mark.kind === "pool" || mark.kind === "lane" || mark.kind === "frame")) {
      strokes.push(...(element.type === "text" ? [element] : strokesOf(element)));
    }
    if (element.type === "arrow") {
      const legs = legsOf(element);
      strokes.push(...legs.map(legBox));
      if (legs.length > 0) {
        const first = legs[0];
        const last = legs[legs.length - 1];
        for (const head of [
          headBox(first.a, first.b, element.startArrowhead),
          headBox(last.b, last.a, element.endArrowhead),
        ]) {
          if (head) strokes.push(head);
        }
      }
      if (mark?.unit) routes.set(mark.unit, element);
    }
  }
  const pad = (box: Box) => ({ x: box.x - 5, y: box.y - 3, width: box.width + 10, height: box.height + 6 });
  const clearOf = (box: Box, others: readonly Box[]) => !others.some((other) => overlaps(box, other));

  return elements.map((element) => {
    if (element.type !== "text" || element.containerId || element.isDeleted || unitOf(element)?.kind !== "edge") return element;
    const box = pad(element);
    const route = routes.get(unitOf(element)!.unit);
    if (clearOf(box, taken) && (!route || clearOf(box, strokes))) {
      taken.push(box);
      return element;
    }
    if (route) {
      const legs = legsOf(route).sort(
        (p, q) => Math.hypot(q.b.x - q.a.x, q.b.y - q.a.y) - Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y),
      );
      for (const leg of legs) {
        const upright = Math.abs(leg.b.x - leg.a.x) < Math.abs(leg.b.y - leg.a.y);
        for (const share of [0.5, 0.35, 0.65, 0.2, 0.8]) {
          const at = { x: leg.a.x + (leg.b.x - leg.a.x) * share, y: leg.a.y + (leg.b.y - leg.a.y) * share };
          const spots = upright
            ? [
                { x: at.x + 7, y: at.y - element.height / 2 },
                { x: at.x - 7 - element.width, y: at.y - element.height / 2 },
              ]
            : [
                { x: at.x - element.width / 2, y: at.y - element.height - 5 },
                { x: at.x - element.width / 2, y: at.y + 5 },
              ];
          for (const spot of spots) {
            const trial = pad({ x: spot.x, y: spot.y, width: element.width, height: element.height });
            if (clearOf(trial, taken) && clearOf(trial, strokes)) {
              taken.push(trial);
              return { ...element, x: Math.round(spot.x), y: Math.round(spot.y) };
            }
          }
        }
      }
    }
    const clear = (up: boolean) => {
      const candidate = { ...box };
      // Each move clears a blocker; monotonic movement guarantees a free slot.
      while (true) {
        const blockers = taken.filter((other) => overlaps(candidate, other));
        if (!blockers.length) return candidate.y;
        candidate.y = up
          ? Math.min(...blockers.map((other) => other.y)) - candidate.height
          : Math.max(...blockers.map((other) => other.y + other.height));
      }
    };
    const above = clear(true), below = clear(false);
    box.y = box.y - above <= below - box.y ? above : below;
    taken.push(box);
    return box.y + 3 === element.y ? element : { ...element, y: box.y + 3 };
  });
}
