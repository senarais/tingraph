import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { unitOf } from "@/lib/canvas/units";
import type { Box } from "@/lib/canvas/connect";

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

/** Fail before replacing the sheet or charging quota when rendered nodes collide. */
export function generationConflict(elements: readonly ExcalidrawElement[]): string | null {
  const boxes = [...nodeBounds(elements)];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (overlaps(boxes[i][1], boxes[j][1])) {
        return `Elements ${boxes[i][0]} and ${boxes[j][0]} overlap. Shorten their labels or split the diagram, then generate again. Your current sheet has been kept; no generation was used.`;
      }
    }
  }
  return null;
}

/** Place loose connector captions using measured text, not estimated font widths. */
export function clearConnectorLabels(elements: ExcalidrawElement[]): ExcalidrawElement[] {
  const taken = [...nodeBounds(elements).values()];
  for (const element of elements) {
    const kind = unitOf(element)?.kind;
    if (element.type === "text" && !element.containerId && kind !== "edge" && kind !== "node") {
      taken.push(element);
    }
  }
  return elements.map((element) => {
    if (element.type !== "text" || element.containerId || unitOf(element)?.kind !== "edge") return element;
    const box = { x: element.x - 5, y: element.y - 3, width: element.width + 10, height: element.height + 6 };
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
