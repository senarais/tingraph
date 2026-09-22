import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { marked, unitOf, type LinkMark, type UnitMark } from "@/lib/canvas/units";
import type { Ink } from "@/lib/ink";
import { FORMAL, type SheetStyle } from "@/lib/sheet";
import { buildShapeFor } from "@/lib/excalidraw-mapper/build-skeletons";
import { nodeSize } from "@/lib/layout/compute-layout";
import type { DiagramCategory, DSLNode } from "@/lib/types";

/**
 * An element that carries its own spec.
 *
 * A figure is one object drawn from one spec, and everything it offers — a
 * settings panel, handles on the sheet, a source that says the same thing —
 * falls out of that one property. Three of the graph notations want the same
 * thing one level down: a use case stands inside a boundary, an action stands
 * in a partition, an ERD table has columns with keys, and none of that is
 * something the reader can place by hand.
 *
 * So each of their elements carries a `DSLNode` on its own unit mark and is
 * drawn from it, exactly the way `redrawFigure` draws a figure from its spec.
 * The panel reads the sheet rather than a copy of it, which is what makes an
 * edit made on the canvas and an edit made in the panel the same edit.
 *
 * What the spec does *not* hold is the captions: those are read back off the
 * marks the drawing carries (`UnitMark.part`), so a name the reader types
 * straight onto the sheet is still the name the panel shows.
 */

type Elements = readonly ExcalidrawElement[];

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementOnSheet {
  unit: string;
  /** what this element is, with the captions as they stand on the sheet */
  spec: DSLNode;
  /** where it sits, taken from its own outline rather than from the spec */
  box: Rect;
  /** every piece of it, in the order the sheet stacks them */
  pieces: ExcalidrawElement[];
}

/**
 * The words in a caption, as one line.
 *
 * A notation wraps its own captions before handing them over — a use case oval
 * is given `Withdraw\nCash` — so the line breaks in a drawn caption are a
 * rendering of the label rather than part of it, and reading them back in
 * would wrap the label again on every redraw.
 */
function wordsOf(element: ExcalidrawElement): string {
  const text = element as unknown as { text?: string; originalText?: string };
  return (text.originalText ?? text.text ?? "").replace(/\s*\n\s*/g, " ").trim();
}

/** Every caption Excalidraw has bound inside a shape, by the shape it sits in. */
function boundCaptions(elements: Elements): Map<string, ExcalidrawElement> {
  const out = new Map<string, ExcalidrawElement>();
  for (const element of elements) {
    const container = (element as { containerId?: string | null }).containerId;
    if (!element.isDeleted && element.type === "text" && container) {
      out.set(container, element);
    }
  }
  return out;
}

/** The caption one piece carries: its own words, or the ones bound inside it. */
function captionOf(
  piece: ExcalidrawElement,
  bound: Map<string, ExcalidrawElement>,
): string | null {
  if (piece.type === "text") {
    return wordsOf(piece);
  }
  const held = bound.get(piece.id);
  return held ? wordsOf(held) : null;
}

/**
 * The spec with every caption taken from the drawing rather than from the
 * mark. `UnitMark.part` says which piece of the spec each caption carries, so
 * a table renamed with Excalidraw's own caption editor still reads back as
 * that table's name — the panel and the sheet cannot drift apart.
 */
function readSpec(
  spec: DSLNode,
  pieces: Elements,
  bound: Map<string, ExcalidrawElement>,
): DSLNode {
  let out = spec;
  const fields = spec.fields ? [...spec.fields] : null;
  let changed = false;
  for (const piece of pieces) {
    const part = unitOf(piece)?.part;
    if (!part) {
      continue;
    }
    const words = captionOf(piece, bound);
    if (words === null) {
      continue;
    }
    if (part === "name") {
      if (words !== spec.label) {
        out = { ...out, label: words };
      }
      continue;
    }
    const row = /^field:(\d+):(name|type)$/.exec(part);
    if (!row || !fields) {
      continue;
    }
    const at = Number(row[1]);
    const field = fields[at];
    if (!field) {
      continue;
    }
    if (row[2] === "name") {
      if (words !== field.name) {
        fields[at] = { ...field, name: words };
        changed = true;
      }
      continue;
    }
    // a nullable column is written with a trailing ?, so it reads back as one
    const optional = words.endsWith("?");
    const type = optional ? words.slice(0, -1) : words;
    if (type !== (field.type ?? "") || optional !== Boolean(field.optional)) {
      const next = { ...fields[at], type, optional: true };
      if (!type) {
        delete (next as { type?: string }).type;
      }
      if (!optional) {
        delete (next as { optional?: boolean }).optional;
      }
      fields[at] = next;
      changed = true;
    }
  }
  return changed && fields ? { ...out, fields } : out;
}

/** Every element on the sheet that carries a spec, in the order it stacks. */
export function elementsOn(elements: Elements): ElementOnSheet[] {
  const pieces = new Map<string, ExcalidrawElement[]>();
  const carriers = new Map<string, { mark: UnitMark; shape: ExcalidrawElement }>();
  for (const element of elements) {
    const mark = element.isDeleted ? null : unitOf(element);
    if (!mark) {
      continue;
    }
    const held = pieces.get(mark.unit);
    if (held) {
      held.push(element);
    } else {
      pieces.set(mark.unit, [element]);
    }
    if (mark.spec && !carriers.has(mark.unit)) {
      carriers.set(mark.unit, { mark, shape: element });
    }
  }
  const bound = boundCaptions(elements);
  return [...carriers].map(([unit, { mark, shape }]) => {
    const mine = pieces.get(unit) ?? [];
    return {
      unit,
      spec: readSpec(mark.spec as DSLNode, mine, bound),
      box: { x: shape.x, y: shape.y, width: shape.width, height: shape.height },
      pieces: mine,
    };
  });
}

/** One element by name, when it is still on the sheet. */
export function elementOn(elements: Elements, unit: string): ElementOnSheet | null {
  return elementsOn(elements).find((entry) => entry.unit === unit) ?? null;
}

/**
 * A copy answers to its own name, so a fresh drawing has to be stamped with
 * the name of the element it replaces rather than the one its notation would
 * have given it.
 */
function renamedTo(
  skeletons: ExcalidrawElementSkeleton[],
  unit: string,
): ExcalidrawElementSkeleton[] {
  return skeletons.map((skeleton) => {
    const mark = unitOf(skeleton as { customData?: Record<string, unknown> });
    if (!mark) {
      return skeleton;
    }
    const groups = ((skeleton as { groupIds?: string[] }).groupIds ?? []).filter(
      (id) => id !== mark.unit,
    );
    return {
      ...skeleton,
      groupIds: [unit, ...groups],
      ...marked({ ...mark, unit }),
    } as ExcalidrawElementSkeleton;
  });
}

/**
 * Draws one element again from its spec.
 *
 * The counterpart of `redrawFigure`: a column is added, a type is changed, a
 * partition is chosen, and every piece is cut again rather than patched. The
 * top-left stays put, so the element does not walk across the sheet, and a
 * width wider than the notation would have chosen is kept — a table the reader
 * pulled out stays pulled out.
 *
 * Excalidraw's bound captions carry no mark of their own, so the pieces that
 * hang off a removed shape are taken away with it; left behind they would pile
 * up, one per redraw.
 */
export function redrawElement(
  elements: Elements,
  unit: string,
  spec: DSLNode,
  at: { x: number; y: number; width?: number },
  category: DiagramCategory,
  ink: Ink,
  style: SheetStyle = FORMAL,
): ExcalidrawElement[] {
  const index = Math.max(
    0,
    elements.findIndex((element) => !element.isDeleted && unitOf(element)?.unit === unit),
  );
  const gone = new Set<string>();
  for (const element of elements) {
    if (!element.isDeleted && unitOf(element)?.unit === unit) {
      gone.add(element.id);
    }
  }
  if (gone.size === 0) {
    return elements.slice();
  }
  const kept = elements.filter((element) => {
    if (gone.has(element.id)) {
      return false;
    }
    const container = (element as { containerId?: string | null }).containerId;
    return !(container && gone.has(container));
  });
  const size = nodeSize(category, spec);
  const drawn = convertToExcalidrawElements(
    renamedTo(
      buildShapeFor(
        category,
        {
          ...spec,
          x: Math.round(at.x),
          y: Math.round(at.y),
          width: Math.max(size.width, Math.round(at.width ?? 0)),
          height: size.height,
          rank: 0,
        },
        ink,
        style,
      ),
      unit,
    ),
    { regenerateIds: true },
  );
  return [...kept.slice(0, index), ...drawn, ...kept.slice(index)];
}

/** One connector on the sheet, as the panel that lists them reads it. */
export interface LinkOnSheet {
  /** the arrow element itself, which is what an edit is written to */
  id: string;
  unit: string;
  link: LinkMark;
  /** the caption riding the line, when it has one */
  label: string;
}

/**
 * Every connector on the sheet and what it joins. A panel can then offer the
 * relations a drawing holds as a list — which two elements, and which two of
 * their ports — beside the tables themselves.
 */
export function linksOn(elements: Elements): LinkOnSheet[] {
  const captions = new Map<string, string>();
  for (const element of elements) {
    const mark = element.isDeleted ? null : unitOf(element);
    if (mark?.kind === "edge" && element.type === "text") {
      captions.set(mark.unit, wordsOf(element));
    }
  }
  const out: LinkOnSheet[] = [];
  for (const element of elements) {
    const mark = element.isDeleted ? null : unitOf(element);
    if (!mark?.link || element.type !== "arrow") {
      continue;
    }
    out.push({
      id: element.id,
      unit: mark.unit,
      link: mark.link,
      label: captions.get(mark.unit) ?? "",
    });
  }
  return out;
}
