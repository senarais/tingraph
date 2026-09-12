import { convertToExcalidrawElements, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { unitOf } from "@/lib/canvas/units";
import { removeUnits } from "@/lib/canvas/scene";
import type { Ink } from "@/lib/ink";
import { FORMAL, type SheetStyle } from "@/lib/sheet";
import {
  buildBoundarySkeletons,
  buildColumnSkeletons,
} from "@/lib/excalidraw-mapper/build-skeletons";
import { BOUNDARY_HEAD } from "@/lib/layout/layout-usecase";
import { ACTIVITY_HEADER } from "@/lib/layout/layout-activity";

/**
 * The chrome a notation draws round its elements: a use case boundary, and the
 * columns a UML activity is partitioned into.
 *
 * A pool is a BPMN participant and carries its own rail of controls
 * (`poolBoxes` in `scene.ts`); a frame is deliberately not one of those. A
 * boundary has no lanes at all — offering it BPMN's add-a-lane would be
 * nonsense — and an activity's partitions are *columns*, so everything about
 * them runs across the sheet where a pool's runs down it. They are read and
 * edited here instead.
 *
 * Nothing here throws away what was drawn inside: removing a boundary takes the
 * boundary, and the use cases that stood in it stay exactly where they are.
 */

type Elements = readonly ExcalidrawElement[];

export interface LaneBox {
  unit: string;
  label: string;
  /** the column's own extent inside the frame */
  x: number;
  width: number;
}

export interface FrameBox {
  unit: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** the band along the top the frame's own name is written in */
  head: number;
  /** the columns ruled inside it, left to right */
  lanes: LaneBox[];
}

/** The least a partition may be squeezed to, and the width a fresh one takes. */
export const COLUMN_WIDTH = 190;

function textOf(element: ExcalidrawElement): string {
  const text = element as unknown as { text?: string; originalText?: string };
  return (text.originalText ?? text.text ?? "").trim();
}

/**
 * Every frame on the sheet, with the columns ruled inside it.
 *
 * A column is the band between two rules, so the rules are what is measured:
 * the leftmost column is ruled by the frame itself and has none of its own.
 * Each lane unit is paired with the column its name is written over.
 */
export function frameBoxes(elements: Elements, head = BOUNDARY_HEAD): FrameBox[] {
  const frames: FrameBox[] = [];
  const captions = new Map<string, string>();
  for (const element of elements) {
    const mark = element.isDeleted ? null : unitOf(element);
    if (mark?.part === "name" && element.type === "text") {
      captions.set(mark.unit, textOf(element));
    }
  }
  for (const element of elements) {
    const mark = element.isDeleted ? null : unitOf(element);
    if (!mark || mark.kind !== "frame" || !mark.core || element.type !== "rectangle") {
      continue;
    }
    frames.push({
      unit: mark.unit,
      label: captions.get(mark.unit) ?? "",
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      head,
      lanes: [],
    });
  }
  for (const frame of frames) {
    frame.lanes = lanesIn(elements, frame, captions);
  }
  return frames.sort((a, b) => a.y - b.y);
}

/** Every frame of an activity sheet, whose band along the top is its own size. */
export function partitionFrames(elements: Elements): FrameBox[] {
  return frameBoxes(elements, ACTIVITY_HEADER);
}

function lanesIn(
  elements: Elements,
  frame: FrameBox,
  captions: Map<string, string>,
): LaneBox[] {
  const rules: Array<{ unit: string; x: number }> = [];
  const names: Array<{ unit: string; x: number }> = [];
  for (const element of elements) {
    const mark = element.isDeleted ? null : unitOf(element);
    if (!mark || mark.kind !== "lane") {
      continue;
    }
    const midX = element.x + element.width / 2;
    const midY = element.y + element.height / 2;
    if (
      midX < frame.x - 1 ||
      midX > frame.x + frame.width + 1 ||
      midY < frame.y - 1 ||
      midY > frame.y + frame.height + 1
    ) {
      continue;
    }
    if (element.type === "line") {
      rules.push({ unit: mark.unit, x: element.x });
    } else if (element.type === "text") {
      names.push({ unit: mark.unit, x: midX });
    }
  }
  if (rules.length === 0 && names.length === 0) {
    return [];
  }
  rules.sort((a, b) => a.x - b.x);
  const edges = [frame.x, ...rules.map((rule) => rule.x), frame.x + frame.width];
  const lanes: LaneBox[] = [];
  for (let at = 0; at < edges.length - 1; at += 1) {
    const x = edges[at];
    const width = edges[at + 1] - x;
    // the column's own rule names it; the leftmost one is named by whatever
    // caption stands over it, because the frame rules its left side
    const owner =
      (at > 0 ? rules[at - 1].unit : undefined) ??
      names.find((name) => name.x >= x && name.x <= x + width)?.unit;
    lanes.push({
      unit: owner ?? `lane-${at}`,
      label: owner ? (captions.get(owner) ?? "") : "",
      x,
      width,
    });
  }
  return lanes;
}

/** Every piece of one lane, so a column can be taken off in one go. */
function piecesOf(elements: Elements, unit: string): Set<string> {
  const ids = new Set<string>();
  for (const element of elements) {
    if (!element.isDeleted && unitOf(element)?.unit === unit) {
      ids.add(element.id);
    }
  }
  return ids;
}

function freshId(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** A frame's or a lane's name, written onto the piece that carries it. */
export function renameFrame(
  elements: Elements,
  unit: string,
  label: string,
): ExcalidrawElement[] {
  return elements.map((element) => {
    const mark = element.isDeleted ? null : unitOf(element);
    if (!mark || mark.unit !== unit || mark.part !== "name" || element.type !== "text") {
      return element;
    }
    return newElementWith(element, { text: label, originalText: label } as never);
  });
}

/** A fresh boundary on a use case sheet, big enough to stand something in. */
export function addBoundary(
  elements: Elements,
  at: { x: number; y: number },
  ink: Ink,
  style: SheetStyle = FORMAL,
): ExcalidrawElement[] {
  const width = 320;
  const height = 240;
  return [
    ...elements,
    ...convertToExcalidrawElements(
      buildBoundarySkeletons(
        {
          id: freshId(),
          label: "System",
          x: Math.round(at.x - width / 2),
          y: Math.round(at.y - height / 2),
          width,
          height,
          headerWidth: 0,
          headerHeight: BOUNDARY_HEAD,
          lanes: [],
        },
        ink,
        style,
      ),
      { regenerateIds: true },
    ),
  ];
}

/**
 * Takes a frame away and leaves the drawing alone. A boundary says where the
 * system ends; the use cases inside it are elements of their own and have no
 * reason to go with it.
 */
export function removeFrame(elements: Elements, frame: FrameBox): ExcalidrawElement[] {
  return removeUnits(elements, [
    frame.unit,
    ...frame.lanes.map((lane) => lane.unit),
  ]);
}

/** Opens or closes a band down the sheet at `cut`, the sideways twin of `shiftBelow`. */
function shiftRight(elements: Elements, cut: number, by: number): ExcalidrawElement[] {
  return elements.map((element) =>
    element.isDeleted || element.x < cut
      ? element
      : newElementWith(element, { x: element.x + by }),
  );
}

function place(skeletons: ExcalidrawElementSkeleton[]): ExcalidrawElement[] {
  return convertToExcalidrawElements(skeletons, { regenerateIds: true });
}

/**
 * A new partition along the right-hand edge of a frame, and the frame widened
 * to hold it. An activity reads down the page while its partitions run across
 * it, so this is `addLane` turned on its side: the sheet opens to the right
 * rather than downwards.
 */
export function addColumn(
  elements: Elements,
  frame: FrameBox,
  ink: Ink,
  style: SheetStyle = FORMAL,
): ExcalidrawElement[] {
  const right = frame.x + frame.width;
  const ordinal = Math.max(1, frame.lanes.length) + 1;
  const grown = shiftRight(elements, right, COLUMN_WIDTH).map((element) => {
    const mark = element.isDeleted ? null : unitOf(element);
    if (!mark || mark.unit !== frame.unit) {
      return element;
    }
    if (element.type === "rectangle") {
      return newElementWith(element, { width: element.width + COLUMN_WIDTH });
    }
    if (element.type === "line") {
      // the rule under the band runs the full width of the frame
      return newElementWith(element, {
        width: element.width + COLUMN_WIDTH,
        points: [
          [0, 0],
          [element.width + COLUMN_WIDTH, 0],
        ] as never,
      });
    }
    // the frame's own name is centred on the box
    return newElementWith(element, { x: element.x + COLUMN_WIDTH / 2 });
  });
  return [
    ...grown,
    ...place(
      buildColumnSkeletons(
        {
          id: freshId(),
          label: `Partition ${ordinal}`,
          x: right,
          y: frame.y,
          width: COLUMN_WIDTH,
          height: frame.height,
          headerWidth: 0,
          headerHeight: frame.head,
        },
        true,
        ink,
        style,
      ),
    ),
  ];
}

/**
 * Takes the right-hand partition off, and everything standing in it. A frame
 * keeps its last column: that column is the frame's own body, the way a pool
 * always keeps one lane.
 */
export function removeColumn(elements: Elements, frame: FrameBox): ExcalidrawElement[] {
  if (frame.lanes.length < 2) {
    return elements.slice();
  }
  const last = frame.lanes[frame.lanes.length - 1];
  const gone = piecesOf(elements, last.unit);
  for (const element of elements) {
    const mark = element.isDeleted ? null : unitOf(element);
    if (element.isDeleted || mark?.unit === frame.unit || gone.has(element.id)) {
      continue;
    }
    const midX = element.x + element.width / 2;
    const midY = element.y + element.height / 2;
    if (
      midX >= last.x &&
      midX <= last.x + last.width &&
      midY >= frame.y &&
      midY <= frame.y + frame.height
    ) {
      gone.add(element.id);
    }
  }
  for (const element of elements) {
    const container = (element as { containerId?: string | null }).containerId;
    if (container && gone.has(container)) {
      gone.add(element.id);
    }
  }
  const shrunk = elements.map((element) => {
    if (gone.has(element.id)) {
      return newElementWith(element, { isDeleted: true });
    }
    const mark = element.isDeleted ? null : unitOf(element);
    if (!mark || mark.unit !== frame.unit) {
      return element;
    }
    if (element.type === "rectangle") {
      return newElementWith(element, { width: element.width - last.width });
    }
    if (element.type === "line") {
      return newElementWith(element, {
        width: element.width - last.width,
        points: [
          [0, 0],
          [element.width - last.width, 0],
        ] as never,
      });
    }
    return newElementWith(element, { x: element.x - last.width / 2 });
  });
  return shiftRight(shrunk, frame.x + frame.width, -last.width);
}
