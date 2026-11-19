import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { freshId } from "@/lib/canvas/scene";
import { buildShapeFor } from "@/lib/excalidraw-mapper/build-skeletons";
import { PALETTE_GROUPS, paletteShapeSize, sampleNode } from "@/lib/palette";
import type { Ink } from "@/lib/ink";
import type { SheetStyle } from "@/lib/sheet";
import type { DiagramCategory } from "@/lib/types";

/**
 * One shape from a notation's palette, centred on `at`, ready to add.
 *
 * The element is named afresh every time. A name made from a counter that
 * starts again with every session would, on a reopened sheet, answer to the
 * same unit as a shape placed last time — and two pieces with one unit are one
 * element. `counter` only numbers the caption ("Task 3").
 */
export function paletteShape(
  category: DiagramCategory,
  type: string,
  at: { x: number; y: number },
  counter: number,
  ink: Ink,
  style: SheetStyle,
): ExcalidrawElement[] | null {
  const item = PALETTE_GROUPS[category]
    .flatMap((group) => group.items)
    .find((entry) => entry.type === type && entry.droppable);
  if (!item) {
    return null;
  }
  const size = paletteShapeSize(item, category);
  const box = {
    id: `mnl-${item.type}-${freshId()}`,
    x: Math.round(at.x - size.width / 2),
    y: Math.round(at.y - size.height / 2),
    ...size,
    rank: 0,
  };
  return convertToExcalidrawElements(
    buildShapeFor(category, { ...sampleNode(category, item.type, counter), ...box }, ink, style),
    { regenerateIds: true },
  );
}
