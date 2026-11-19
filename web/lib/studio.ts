import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { renameCopies } from "@/lib/canvas/copies";
import type { Rules } from "@/lib/canvas/connect";
import { clearConnectorLabels } from "@/lib/canvas/generation";
import { freshId } from "@/lib/canvas/scene";
import { unitOf, type LinkMark, type UnitMark } from "@/lib/canvas/units";
import { CONNECTORS } from "@/lib/connectors";
import { buildSkeletons } from "@/lib/excalidraw-mapper/build-skeletons";
import type { Ink } from "@/lib/ink";
import { computeLayout } from "@/lib/layout/compute-layout";
import { parseDSL } from "@/lib/parser/parse-dsl";
import type { SheetStyle } from "@/lib/sheet";
import { isFigure, type DiagramCategory } from "@/lib/types";

/**
 * Studio: one free sheet that holds any number of drawings, in any of the
 * notations, side by side.
 *
 * The editor's sheet is one notation, so everything on it — which lines a
 * connector may be, which rules route it, which panel an element opens — is
 * read off that one notation. A Studio sheet has to read it off each thing
 * instead. Every piece a notation draws already says where it came from in
 * its unit name (`bpmn-…`, `org-…`, a figure's kind), and a connector made on
 * a Studio sheet carries its notation outright (`LinkMark.notation`). This
 * file turns those into answers, and puts a notation's example on the sheet
 * as a drawing of its own.
 *
 * Nothing here touches the DOM, so it runs under `tsx`. What a saved sheet
 * is lives in `lib/studio-document.ts`, apart from Excalidraw, so the pages
 * that only list sheets do not load the canvas.
 */

export { STUDIO_CATEGORY, UNTITLED_STUDIO, readStudioDocument, type StudioDocument } from "@/lib/studio-document";

/** The notation a Studio sheet opens on. */
export const STUDIO_START: DiagramCategory = "flow";

/** How far an inserted drawing stands from what is already on the sheet. */
const BESIDE = 200;

/** Unit-name prefixes, longest first where one begins another. */
const PREFIXES: ReadonlyArray<readonly [string, DiagramCategory]> = [
  ["flow-node-", "flow"],
  ["bpmn-", "bpmn"],
  ["pool-", "bpmn"],
  ["org-", "org"],
  ["uc-", "usecase"],
  ["act-", "activity"],
  ["erd-", "erd"],
  ["arch-", "architecture"],
  ["class-", "class"],
  ["dfd-", "dfd"],
  ["state-", "state"],
  ["tree-", "tree"],
];

/** The notation a node unit was drawn in, from its name alone. */
export function notationOfUnit(unit: string): DiagramCategory | null {
  return PREFIXES.find(([prefix]) => unit.startsWith(prefix))?.[1] ?? null;
}

/** Every notation that draws a line by this name; most draw it alone. */
function ownersOf(line: string): DiagramCategory[] {
  return (Object.keys(CONNECTORS) as DiagramCategory[]).filter((category) =>
    CONNECTORS[category].some((kind) => kind.id === line),
  );
}

/**
 * The notation a connector belongs to: the one it was made in, when it says;
 * else the one that draws a line by its name, and when two do — BPMN and a
 * use case diagram both draw an `association` — the one its first end was
 * drawn in.
 */
export function linkNotation(link: LinkMark): DiagramCategory | null {
  if (link.notation) {
    return link.notation;
  }
  const owners = ownersOf(link.line);
  if (owners.length === 1) {
    return owners[0];
  }
  const end = notationOfUnit(link.from.unit) ?? notationOfUnit(link.to.unit);
  return end && (owners.length === 0 || owners.includes(end)) ? end : (owners[0] ?? null);
}

/** The rules one connector is routed by on a sheet holding several notations. */
export function rulesForLink(link: LinkMark, fallback: Rules): Rules {
  return { ...fallback, category: linkNotation(link) ?? fallback.category };
}

/**
 * The notation a piece belongs to, or null for anything no notation drew — a
 * freehand stroke, a loose caption, a picture.
 *
 * A frame is a use case boundary unless partitions hang from it, and a lane
 * belongs to whatever it hangs from: a pool is BPMN, a frame is an activity.
 */
export function notationOfMark(
  mark: UnitMark,
  scene: readonly { customData?: Record<string, unknown>; isDeleted?: boolean }[] = [],
): DiagramCategory | null {
  if (mark.kind === "edge") {
    return mark.link ? linkNotation(mark.link) : null;
  }
  if (mark.kind === "figure") {
    const kind = mark.unit.slice(0, mark.unit.indexOf("-")) as DiagramCategory;
    return isFigure(kind) ? kind : null;
  }
  if (mark.kind === "lane") {
    if (mark.parent?.startsWith("pool-")) return "bpmn";
    if (mark.parent?.startsWith("frame-")) return "activity";
    return null;
  }
  if (mark.kind === "frame") {
    const partitioned = scene.some((element) => {
      const other = element.isDeleted ? null : unitOf(element);
      return other?.kind === "lane" && other.parent === mark.unit;
    });
    return partitioned ? "activity" : "usecase";
  }
  return notationOfUnit(mark.unit);
}

/**
 * The notation of what the reader has hold of, when everything held that
 * belongs to a notation belongs to the same one; null otherwise. A caption
 * riding a connector has no link of its own, so it speaks for nothing.
 */
export function notationOfPicked(
  picked: readonly ExcalidrawElement[],
  scene: readonly ExcalidrawElement[],
): DiagramCategory | null {
  const found = new Set<DiagramCategory>();
  for (const element of picked) {
    const mark = unitOf(element);
    if (!mark || (mark.kind === "edge" && !mark.link)) continue;
    const notation = notationOfMark(mark, scene);
    if (notation) found.add(notation);
  }
  return found.size === 1 ? [...found][0] : null;
}

type Piece = {
  x: number;
  y: number;
  width: number;
  height: number;
  isDeleted?: boolean;
  points?: readonly (readonly [number, number])[];
};

/**
 * The smallest box round some pieces; null for none. A line's own x and y are
 * its first point, and its other points may lie on any side of it, so a line
 * is measured by its points rather than by its width.
 */
export function boundsOf(pieces: readonly Piece[]): { x: number; y: number; width: number; height: number } | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const piece of pieces) {
    if (piece.isDeleted) continue;
    const corners = piece.points?.length
      ? piece.points.map(([px, py]) => [piece.x + px, piece.y + py] as const)
      : [[piece.x, piece.y] as const, [piece.x + piece.width, piece.y + piece.height] as const];
    for (const [cx, cy] of corners) {
      left = Math.min(left, cx);
      top = Math.min(top, cy);
      right = Math.max(right, cx);
      bottom = Math.max(bottom, cy);
    }
  }
  return Number.isFinite(left) ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

/**
 * Where a new drawing goes: centred on `centre` when the sheet is empty, and
 * otherwise beside everything already on it, level with its top, so nothing
 * lands on top of the reader's work.
 */
export function spotFor(
  scene: readonly ExcalidrawElement[],
  size: { width: number; height: number },
  centre: { x: number; y: number },
): { x: number; y: number } {
  const taken = boundsOf(scene as unknown as readonly Piece[]);
  if (!taken) {
    return { x: Math.round(centre.x - size.width / 2), y: Math.round(centre.y - size.height / 2) };
  }
  return { x: Math.round(taken.x + taken.width + BESIDE), y: Math.round(taken.y) };
}

/**
 * A notation's source drawn as fresh pieces: every element id new, so two
 * copies of one example never share an id. Empty when the source will not
 * draw.
 */
export function drawPieces(source: string, ink: Ink, style: SheetStyle): ExcalidrawElement[] {
  try {
    return clearConnectorLabels(
      convertToExcalidrawElements(buildSkeletons(computeLayout(parseDSL(source), "down"), ink, style), {
        regenerateIds: true,
      }),
    );
  } catch {
    return [];
  }
}

/**
 * Drawn pieces made the sheet's own: every unit renamed so it answers to
 * nothing already there (a second flowchart's `S1` is not the first one's),
 * every connector re-tied to the renamed boxes and told its notation, and the
 * whole drawing moved so its top-left corner sits on `at`.
 */
export function adoptPieces(
  pieces: readonly ExcalidrawElement[],
  notation: DiagramCategory,
  at: { x: number; y: number },
  fresh: () => string = freshId,
): ExcalidrawElement[] {
  const box = boundsOf(pieces as unknown as readonly Piece[]);
  if (!box) return [];
  const dx = Math.round(at.x - box.x);
  const dy = Math.round(at.y - box.y);
  const patches = renameCopies(pieces, [], fresh);
  return pieces.map((piece) => {
    const patch = patches.get(piece.id);
    const mark = patch ? unitOf(piece) : null;
    // a line's first point is its origin. A skeleton converted outside
    // Excalidraw's own restore can start half a unit off it, and Excalidraw
    // refuses to edit a line that does not start at [0, 0]; the corners stay
    // where they are on the sheet
    const points = (piece as { points?: readonly (readonly [number, number])[] }).points;
    const [ox, oy] = points?.[0] ?? [0, 0];
    const moved = {
      ...piece,
      x: piece.x + dx + ox,
      y: piece.y + dy + oy,
      ...(points && (ox !== 0 || oy !== 0)
        ? { points: points.map(([px, py]) => [px - ox, py - oy] as [number, number]) }
        : {}),
    };
    if (!patch || !mark) {
      return moved as ExcalidrawElement;
    }
    const tingraph: UnitMark = { ...mark, unit: patch.unit };
    if (patch.parent === null) delete tingraph.parent;
    else if (patch.parent) tingraph.parent = patch.parent;
    if (patch.link === null) delete tingraph.link;
    else if (patch.link) tingraph.link = { ...patch.link, notation };
    return {
      ...moved,
      groupIds: patch.groupIds,
      customData: { ...piece.customData, tingraph },
    } as ExcalidrawElement;
  });
}

/**
 * The structure a notation draws round its elements, as a source of its own,
 * for the palette items the editor writes into the source instead of
 * dropping: a pool with its lanes, a use case boundary, a pair of activity
 * partitions. More lanes, partitions and pools come from the controls each of
 * those already has on the sheet.
 */
export const STRUCTURES: Partial<Record<DiagramCategory, Record<string, { label: string; source: string }>>> = {
  bpmn: {
    pool: {
      label: "Pool with two lanes",
      source: 'bpmn "Pool" {\n  pool P1 "Participant" {\n    lane L1 "Lane 1" {\n    }\n    lane L2 "Lane 2" {\n    }\n  }\n}\n',
    },
  },
  usecase: {
    system: {
      label: "System boundary",
      source: 'usecase "System" {\n  system S1 "System" {\n  }\n}\n',
    },
  },
  activity: {
    lane: {
      label: "Two partitions",
      source: 'activity "Partitions" {\n  lane A "Partition 1" {\n  }\n  lane B "Partition 2" {\n  }\n}\n',
    },
  },
};
