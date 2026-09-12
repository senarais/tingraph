import {
  convertToExcalidrawElements,
  newElementWith,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { marked, unitOf, type LinkMark, type UnitMark } from "@/lib/canvas/units";
import { renameCopies } from "@/lib/canvas/copies";
import type { Ink } from "@/lib/ink";
import { FORMAL, type SheetStyle } from "@/lib/sheet";
import {
  asElement,
  linkSignature,
  routeBetween,
  type Box,
  type Rules,
} from "@/lib/canvas/connect";
import { buildFigure } from "@/lib/figures/registry";
import type { FigureSpec } from "@/lib/figures/spec";
import type { Rect } from "@/lib/chart/layout-chart";
import {
  buildLaneSkeletons,
  buildPoolSkeletons,
  type ConnectorStyle,
} from "@/lib/excalidraw-mapper/build-skeletons";
import {
  BPMN_HEADER_WIDTH,
  MIN_LANE_HEIGHT,
  POOL_GAP,
} from "@/lib/layout/compute-layout";

type Elements = readonly ExcalidrawElement[];

export interface UnitSelection {
  selectedElementIds: Readonly<{ [id: string]: true }>;
  selectedGroupIds: { [groupId: string]: boolean };
  editingGroupId: string | null;
}

type IdSet = Readonly<{ [id: string]: boolean }>;

export interface SceneFix {
  elements?: ExcalidrawElement[];
  appState?: UnitSelection;
}

interface Unit {
  members: ExcalidrawElement[];
  cores: ExcalidrawElement[];
  /** drawn from a spec, so it is one object and has no inside */
  figure: boolean;
}

function picked(ids: IdSet): string[] {
  return Object.keys(ids).filter((id) => ids[id]);
}

function unitIndex(elements: Elements): {
  units: Map<string, Unit>;
  unitOfId: Map<string, string>;
} {
  const units = new Map<string, Unit>();
  const unitOfId = new Map<string, string>();
  for (const element of elements) {
    const mark = element.isDeleted ? null : unitOf(element);
    if (!mark) {
      continue;
    }
    unitOfId.set(element.id, mark.unit);
    let unit = units.get(mark.unit);
    if (!unit) {
      unit = { members: [], cores: [], figure: false };
      units.set(mark.unit, unit);
    }
    unit.members.push(element);
    if (mark.kind === "figure") {
      unit.figure = true;
    }
    if (mark.core) {
      unit.cores.push(element);
    }
  }
  return { units, unitOfId };
}

function sameIds(state: IdSet, next: Set<string>): boolean {
  const current = picked(state);
  return current.length === next.size && current.every((id) => next.has(id));
}

/**
 * Keeps every Tingraph element behaving as one shape.
 *
 * Excalidraw draws a task, a pool or a labelled flow as several shapes held in
 * a group, which a reader can break apart (Ungroup) or step into (double
 * click) to grab a single marker stroke. Both are undone here: a broken group
 * is re-formed, a half-covered element is completed, and stepping inside an
 * element lands on the piece that carries its caption rather than on a stroke.
 *
 * Returns null when the scene already reads as whole, so the caller can leave
 * it alone instead of writing back an identical scene.
 */
export function normalizeUnits(
  elements: Elements,
  state: UnitSelection,
): SceneFix | null {
  const { units, unitOfId } = unitIndex(elements);
  if (units.size === 0) {
    return null;
  }
  const fix: SceneFix = {};

  // --- re-form any group that was taken apart
  let repaired: ExcalidrawElement[] | null = null;
  elements.forEach((element, index) => {
    const name = element.isDeleted ? undefined : unitOfId.get(element.id);
    const unit = name ? units.get(name) : undefined;
    // a one-piece element is already whole; grouping it would only add chrome
    if (!name || !unit || unit.members.length < 2 || element.groupIds[0] === name) {
      return;
    }
    repaired ??= elements.slice();
    repaired[index] = newElementWith(element, {
      groupIds: [name, ...element.groupIds.filter((id) => id !== name)],
    });
  });
  if (repaired) {
    fix.elements = repaired;
  }

  const inside = state.editingGroupId ? units.get(state.editingGroupId) : undefined;
  if (inside && inside.figure) {
    // a figure has no inside: its shapes are cut from a spec rather than drawn,
    // so a reader who steps in would be holding a mark that the next redraw
    // replaces — most confusingly the invisible frame, which carries the spec
    // and would then be dragged away from the drawing it belongs to
    return {
      ...fix,
      appState: {
        selectedElementIds: Object.fromEntries(
          inside.members.map((member) => [member.id, true as const]),
        ),
        selectedGroupIds: { [state.editingGroupId as string]: true },
        editingGroupId: null,
      },
    };
  }
  if (inside) {
    // stepped into an element: only the caption carriers may be picked alone
    const held = picked(state.selectedElementIds).filter(
      (id) => unitOfId.get(id) === state.editingGroupId,
    );
    const cores = new Set(inside.cores.map((core) => core.id));
    if (held.length > 0 && held.some((id) => !cores.has(id))) {
      const keep = held.filter((id) => cores.has(id));
      const next = new Set(keep.length > 0 ? keep : inside.cores.slice(0, 1).map((c) => c.id));
      if (next.size === 0) {
        // nothing to edit in there — step back out onto the whole element
        fix.appState = {
          selectedElementIds: Object.fromEntries(
            inside.members.map((member) => [member.id, true as const]),
          ),
          selectedGroupIds: { [state.editingGroupId as string]: true },
          editingGroupId: null,
        };
      } else if (!sameIds(state.selectedElementIds, next)) {
        fix.appState = {
          selectedElementIds: Object.fromEntries(
            [...next].map((id) => [id, true as const]),
          ),
          selectedGroupIds: state.selectedGroupIds,
          editingGroupId: state.editingGroupId,
        };
      }
    }
    return fix.elements || fix.appState ? fix : null;
  }

  // --- a half-covered element is picked whole
  const ids = new Set(picked(state.selectedElementIds));
  const groups = new Set(picked(state.selectedGroupIds));
  let grew = false;
  for (const [name, unit] of units) {
    if (unit.members.length < 2) {
      continue;
    }
    const held = unit.members.filter((member) => ids.has(member.id)).length;
    if (held === 0 || held === unit.members.length) {
      continue;
    }
    for (const member of unit.members) {
      ids.add(member.id);
    }
    // a unit nested in a reader's own group is already covered by that group
    const outer = unit.members.some((member) =>
      member.groupIds.some((id) => id !== name && groups.has(id)),
    );
    if (!outer) {
      groups.add(name);
    }
    grew = true;
  }
  if (grew) {
    fix.appState = {
      selectedElementIds: Object.fromEntries([...ids].map((id) => [id, true as const])),
      selectedGroupIds: Object.fromEntries([...groups].map((id) => [id, true])),
      editingGroupId: null,
    };
  }
  return fix.elements || fix.appState ? fix : null;
}

// ------------------------------------------------------------------- copies

/**
 * Makes a copy its own element, the moment it is made. The renaming itself is
 * in `lib/canvas/copies.ts`; this only writes it back.
 */
export function reunit(next: Elements, prev: Elements): ExcalidrawElement[] | void {
  const patches = renameCopies(next, prev, freshId);
  if (patches.size === 0) {
    return;
  }
  return next.map((element) => {
    const patch = patches.get(element.id);
    const mark = patch ? unitOf(element) : null;
    if (!patch || !mark) {
      return element;
    }
    const tingraph: UnitMark = { ...mark, unit: patch.unit };
    if (patch.link === null) {
      delete tingraph.link;
    } else if (patch.link) {
      tingraph.link = patch.link;
    }
    return newElementWith(element, {
      groupIds: patch.groupIds,
      customData: { ...element.customData, tingraph },
    });
  });
}

// --------------------------------------------------------------------- charts

export interface FigureOnSheet {
  unit: string;
  spec: FigureSpec;
  /** where the figure sits, taken from its frame rather than from the spec */
  box: Rect;
}

/** The frame of one figure: the piece that carries the whole of it. */
function figureFrames(elements: Elements): Array<{ element: ExcalidrawElement; mark: UnitMark }> {
  const out: Array<{ element: ExcalidrawElement; mark: UnitMark }> = [];
  for (const element of elements) {
    const mark = element.isDeleted ? null : unitOf(element);
    if (mark?.kind === "figure" && mark.figure && element.type === "rectangle") {
      out.push({ element, mark });
    }
  }
  return out;
}

/** Every figure on the sheet, in the order the sheet stacks them. */
export function figuresOn(elements: Elements): FigureOnSheet[] {
  return figureFrames(elements).map(({ element, mark }) => ({
    unit: mark.unit,
    spec: mark.figure as FigureSpec,
    box: {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    },
  }));
}

/**
 * Draws one figure again.
 *
 * A figure is not edited piece by piece: a reading changes, or a setting does,
 * and every mark is cut again from the spec. That is what lets the settings
 * panel, the handles on the sheet and the source all be the same edit — none
 * of them has to know which rectangle moved.
 */
export function redrawFigure(
  elements: Elements,
  unit: string,
  spec: FigureSpec,
  box: Rect,
  ink: Ink,
  style: SheetStyle = FORMAL,
): ExcalidrawElement[] {
  const at = Math.max(
    0,
    elements.findIndex((element) => unitOf(element)?.unit === unit),
  );
  const kept = elements.filter((element) => unitOf(element)?.unit !== unit);
  const drawn = convertToExcalidrawElements(
    buildFigure(
      {
        ...spec,
        options: { ...spec.options, width: box.width, height: box.height },
      } as FigureSpec,
      box,
      ink,
      style,
      unit,
    ),
    { regenerateIds: true },
  );
  return [...kept.slice(0, at), ...drawn, ...kept.slice(at)];
}

/**
 * Keeps a figure the size the reader dragged it to. Excalidraw scales a group
 * by stretching every shape in it, captions included, so a figure that has
 * been resized is drawn again at its new size the moment the pointer is up.
 */
export function syncFigures(
  elements: Elements,
  ink: Ink,
  style: SheetStyle = FORMAL,
  busy: ReadonlySet<string> = new Set(),
): ExcalidrawElement[] | null {
  for (const { element, mark } of figureFrames(elements)) {
    const spec = mark.figure as FigureSpec;
    if (busy.has(element.id)) {
      continue;
    }
    const width = Math.round(element.width);
    const height = Math.round(element.height);
    if (width === Math.round(spec.options.width) && height === Math.round(spec.options.height)) {
      continue;
    }
    return redrawFigure(
      elements,
      mark.unit,
      spec,
      { x: element.x, y: element.y, width, height },
      ink,
      style,
    );
  }
  return null;
}

/** One fresh figure, dropped on the sheet. */
export function newFigure(
  elements: Elements,
  spec: FigureSpec,
  at: { x: number; y: number },
  ink: Ink,
  style: SheetStyle = FORMAL,
): ExcalidrawElement[] {
  const unit = `${spec.kind}-${freshId()}`;
  const box = {
    x: Math.round(at.x - spec.options.width / 2),
    y: Math.round(at.y - spec.options.height / 2),
    width: spec.options.width,
    height: spec.options.height,
  };
  return [
    ...elements,
    ...convertToExcalidrawElements(buildFigure(spec, box, ink, style, unit), {
      regenerateIds: true,
    }),
  ];
}

// ---------------------------------------------------------------- connectors

const SHAPES = new Set(["rectangle", "ellipse", "diamond", "image"]);

/**
 * What a connector may tie itself to.
 *
 * A Tingraph element is drawn as several Excalidraw shapes but reads as one,
 * so a connector points at the whole thing: the key is the element's unit, and
 * the box is the outline around every piece of it that carries an outline. A
 * shape the reader drew or dropped on its own stands for itself, under its own
 * id. Anything drawn as bare strokes — a BPMN data object — falls back to the
 * outline around all of its pieces.
 */
export function linkTargets(elements: Elements): Map<string, Box> {
  const shapes = new Map<string, Box>();
  const all = new Map<string, Box>();
  const grow = (into: Map<string, Box>, key: string, element: ExcalidrawElement) => {
    const held = into.get(key);
    const left = held ? Math.min(held.x, element.x) : element.x;
    const top = held ? Math.min(held.y, element.y) : element.y;
    const right = Math.max(held ? held.x + held.width : -Infinity, element.x + element.width);
    const bottom = Math.max(
      held ? held.y + held.height : -Infinity,
      element.y + element.height,
    );
    into.set(key, { x: left, y: top, width: right - left, height: bottom - top });
  };
  for (const element of elements) {
    const mark = element.isDeleted ? null : unitOf(element);
    // a connector joins elements, and a loose caption is not one of them
    if (element.isDeleted || element.type === "arrow" || (element.type === "text" && !mark)) {
      continue;
    }
    const key = mark?.unit ?? element.id;
    grow(all, key, element);
    if (SHAPES.has(element.type)) {
      grow(shapes, key, element);
    }
  }
  // kept in the order the sheet stacks them, so the shape on top wins a hit
  const out = new Map<string, Box>();
  for (const [key, box] of all) {
    out.set(key, shapes.get(key) ?? box);
  }
  return out;
}

/**
 * One connector the reader has just drawn, cut to the notation's rule and
 * added to the sheet. Returns null when either end is no longer there.
 */
export function newConnector(
  elements: Elements,
  link: LinkMark,
  rules: Rules,
  style: ConnectorStyle,
): ExcalidrawElement[] | null {
  const boxes = linkTargets(elements);
  const from = boxes.get(link.from.unit);
  const to = boxes.get(link.to.unit);
  if (!from || !to) {
    return null;
  }
  const cut = asElement(
    routeBetween(from, to, {
      ...rules,
      fromSide: link.from.side,
      toSide: link.to.side,
      bend: link.bend,
    }),
  );
  const unit = `line-${freshId()}`;
  const [made] = convertToExcalidrawElements(
    [
      {
        type: "arrow",
        x: cut.x,
        y: cut.y,
        width: cut.width,
        height: cut.height,
        points: cut.points,
        ...style,
        ...marked({
          unit,
          kind: "edge",
          core: true,
          link: { ...link, at: linkSignature(from, to, link, cut) },
        }),
      } as never,
    ],
    { regenerateIds: true },
  );
  // Excalidraw nudges the first point of a line it is handed; the route is the
  // one this file cut, so it is written back over the top
  const arrow = newElementWith(made, {
    x: cut.x,
    y: cut.y,
    width: cut.width,
    height: cut.height,
    points: cut.points,
  } as never);
  return [...elements, arrow];
}

/**
 * Cuts every connector's route again whenever what it is tied to has moved.
 *
 * The route on the sheet carries the boxes it was cut against, so a drawing
 * nobody has touched is left exactly as the source laid it out — routes that
 * step around the shapes in their way are not thrown away and re-guessed. The
 * moment a box moves, or the reader drags the connector's middle leg, or drags
 * the connector itself out of place, the route is cut again from the notation's
 * own rule.
 *
 * `busy` names the connectors under the reader's hand this frame, which are
 * left alone until the pointer is up.
 */
export function syncConnectors(
  elements: Elements,
  rules: Rules,
  busy: ReadonlySet<string> = new Set(),
): ExcalidrawElement[] | null {
  let next: ExcalidrawElement[] | null = null;
  let boxes: Map<string, Box> | null = null;
  elements.forEach((element, index) => {
    if (element.isDeleted || element.type !== "arrow" || busy.has(element.id)) {
      return;
    }
    const mark = unitOf(element);
    const link = mark?.link;
    if (!mark || !link) {
      return;
    }
    boxes ??= linkTargets(elements);
    const from = boxes.get(link.from.unit);
    const to = boxes.get(link.to.unit);
    if (!from || !to) {
      return;
    }
    const signature = linkSignature(from, to, link, element);
    if (signature === link.at) {
      return;
    }
    if (!link.at) {
      // a route that has never been cut here came from the source, which laid
      // it out around whatever stood in the way; it is adopted as it is
      next ??= elements.slice();
      next[index] = newElementWith(element, {
        customData: {
          ...element.customData,
          tingraph: { ...mark, link: { ...link, at: signature } },
        },
      });
      return;
    }
    const route = routeBetween(from, to, {
      ...rules,
      fromSide: link.from.side,
      toSide: link.to.side,
      bend: link.bend,
    });
    const cut = asElement(route);
    next ??= elements.slice();
    next[index] = newElementWith(element, {
      x: cut.x,
      y: cut.y,
      points: cut.points as never,
      width: cut.width,
      height: cut.height,
      customData: {
        ...element.customData,
        tingraph: {
          ...mark,
          link: { ...link, at: linkSignature(from, to, link, cut) },
        },
      },
    });
  });
  return next;
}

// ----------------------------------------------------------------- pool edits

export interface PoolBox {
  unit: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** width of the pool's own header band */
  band: number;
  /** width of the header band its lanes use */
  laneBand: number;
}

/** Every pool currently on the sheet, top to bottom. */
export function poolBoxes(elements: Elements): PoolBox[] {
  const boxes: PoolBox[] = [];
  for (const element of elements) {
    const mark = element.isDeleted ? null : unitOf(element);
    if (!mark || mark.kind !== "pool" || !mark.core || element.type !== "rectangle") {
      continue;
    }
    boxes.push({
      unit: mark.unit,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      band: mark.band ?? 0,
      laneBand: mark.laneBand ?? 0,
    });
  }
  return boxes.sort((a, b) => a.y - b.y);
}

/** Lanes already ruled inside `pool`. */
function laneCount(elements: Elements, pool: PoolBox): number {
  const lanes = new Set<string>();
  for (const element of elements) {
    const mark = element.isDeleted ? null : unitOf(element);
    if (!mark || mark.kind !== "lane") {
      continue;
    }
    if (
      element.x >= pool.x &&
      element.x <= pool.x + pool.width &&
      element.y >= pool.y &&
      element.y <= pool.y + pool.height
    ) {
      lanes.add(mark.unit);
    }
  }
  // a pool always holds at least one lane, even when nothing rules it
  return Math.max(1, lanes.size);
}

/** Opens or closes a horizontal band across the sheet at `cut`. */
function shiftBelow(elements: Elements, cut: number, by: number): ExcalidrawElement[] {
  return elements.map((element) =>
    element.isDeleted || element.y < cut
      ? element
      : newElementWith(element, { y: element.y + by }),
  );
}

function freshId(): string {
  return Math.random().toString(36).slice(2, 8);
}

function place(skeletons: ReturnType<typeof buildPoolSkeletons>): ExcalidrawElement[] {
  return convertToExcalidrawElements(skeletons, { regenerateIds: true });
}

/** A new empty participant directly under `pool`. */
export function addPoolBelow(
  elements: Elements,
  pool: PoolBox,
  ink: Ink,
  style: SheetStyle = FORMAL,
): ExcalidrawElement[] {
  const bottom = pool.y + pool.height;
  const height = MIN_LANE_HEIGHT;
  const added = place(
    buildPoolSkeletons(
      {
        id: freshId(),
        label: `Pool ${poolBoxes(elements).length + 1}`,
        x: pool.x,
        y: bottom + POOL_GAP,
        width: pool.width,
        height,
        headerWidth: pool.band || BPMN_HEADER_WIDTH,
        lanes: [],
      },
      ink,
      style,
    ),
  );
  return [...shiftBelow(elements, bottom, POOL_GAP + height), ...added];
}

/** A new lane along the bottom of `pool`, growing the pool to hold it. */
export function addLane(
  elements: Elements,
  pool: PoolBox,
  ink: Ink,
  style: SheetStyle = FORMAL,
): ExcalidrawElement[] {
  const bottom = pool.y + pool.height;
  const height = MIN_LANE_HEIGHT;
  const band = pool.laneBand || BPMN_HEADER_WIDTH;
  const ordinal = laneCount(elements, pool) + 1;
  const grown = shiftBelow(elements, bottom, height).map((element) => {
    const mark = element.isDeleted ? null : unitOf(element);
    if (!mark || mark.unit !== pool.unit) {
      return element;
    }
    if (element.type === "rectangle") {
      return newElementWith(element, {
        height: element.height + height,
        customData: { tingraph: { ...mark, laneBand: band } },
      });
    }
    if (element.type === "line") {
      // the pool's header rule runs the full height of the box
      return newElementWith(element, {
        height: element.height + height,
        points: [
          [0, 0],
          [0, element.height + height],
        ] as never,
      });
    }
    // the rotated band caption is centred on the box
    return newElementWith(element, { y: element.y + height / 2 });
  });
  const added = place(
    buildLaneSkeletons(
      {
        id: freshId(),
        label: `Lane ${ordinal}`,
        x: pool.x + pool.band,
        y: bottom,
        width: pool.width - pool.band,
        height,
        headerWidth: band,
        poolId: pool.unit,
      },
      ink,
      style,
    ),
  );
  return [...grown, ...added];
}

/**
 * The connectors left hanging when a band of the sheet is taken away.
 *
 * A connector names the two elements it joins, so once one of them is gone it
 * has nothing to be cut against and would be left pointing at where the shape
 * used to be. Removing a lane or a pool therefore takes its lines with it.
 */
function withDanglingLinks(elements: Elements, gone: Set<string>): Set<string> {
  const alive = new Set<string>();
  for (const element of elements) {
    if (element.isDeleted || gone.has(element.id)) {
      continue;
    }
    const mark = unitOf(element);
    alive.add(element.id);
    if (mark) {
      alive.add(mark.unit);
    }
  }
  const out = new Set(gone);
  for (const element of elements) {
    const link = element.isDeleted ? null : unitOf(element)?.link;
    if (link && (!alive.has(link.from.unit) || !alive.has(link.to.unit))) {
      out.add(element.id);
    }
  }
  return out;
}

/**
 * Takes the bottom lane off a pool, and everything drawn in it.
 *
 * A pool with one lane is left alone: a lane is the pool's own body then, and
 * removing it would leave a header with nothing under it. The pool shrinks by
 * exactly the lane's height, so whatever is below on the sheet comes up by the
 * same amount and the spacing the layout worked out is kept.
 */
export function removeLane(elements: Elements, pool: PoolBox): ExcalidrawElement[] {
  const lanes = new Map<string, { top: number; bottom: number }>();
  for (const element of elements) {
    const mark = element.isDeleted ? null : unitOf(element);
    if (
      !mark ||
      mark.kind !== "lane" ||
      element.x < pool.x ||
      element.x > pool.x + pool.width ||
      element.y < pool.y ||
      element.y > pool.y + pool.height
    ) {
      continue;
    }
    const box = lanes.get(mark.unit) ?? { top: element.y, bottom: element.y };
    lanes.set(mark.unit, {
      top: Math.min(box.top, element.y),
      bottom: Math.max(box.bottom, element.y + element.height),
    });
  }
  if (lanes.size < 2) {
    return elements.slice();
  }
  const [name, band] = [...lanes].sort((a, b) => b[1].top - a[1].top)[0];
  const height = band.bottom - band.top;

  // the lane's own pieces, and everything standing in the band it ruled. The
  // pool's own pieces are never in that reckoning: they are shrunk, not dropped
  const gone = new Set<string>();
  for (const element of elements) {
    const mark = element.isDeleted ? null : unitOf(element);
    if (element.isDeleted || mark?.unit === pool.unit) {
      continue;
    }
    const midY = element.y + element.height / 2;
    const midX = element.x + element.width / 2;
    if (
      mark?.unit === name ||
      (midY >= band.top &&
        midY <= band.bottom &&
        midX >= pool.x &&
        midX <= pool.x + pool.width)
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
  const cut = withDanglingLinks(elements, gone);

  const shrunk = elements.map((element) => {
    if (cut.has(element.id)) {
      return newElementWith(element, { isDeleted: true });
    }
    const mark = element.isDeleted ? null : unitOf(element);
    if (!mark || mark.unit !== pool.unit) {
      return element;
    }
    if (element.type === "rectangle") {
      return newElementWith(element, { height: element.height - height });
    }
    if (element.type === "line") {
      return newElementWith(element, {
        height: element.height - height,
        points: [
          [0, 0],
          [0, element.height - height],
        ] as never,
      });
    }
    // the rotated band caption is centred on the box
    return newElementWith(element, { y: element.y - height / 2 });
  });
  return shiftBelow(shrunk, pool.y + pool.height, -height);
}

/** Drops a participant and everything drawn inside it, closing the gap. */
export function removePool(elements: Elements, pool: PoolBox): ExcalidrawElement[] {
  const bottom = pool.y + pool.height;
  const gone = new Set<string>();
  for (const element of elements) {
    if (element.isDeleted) {
      continue;
    }
    const midX = element.x + element.width / 2;
    const midY = element.y + element.height / 2;
    if (
      midX >= pool.x &&
      midX <= pool.x + pool.width &&
      midY >= pool.y &&
      midY <= bottom
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
  const cut = withDanglingLinks(elements, gone);
  const cleared = elements.map((element) =>
    cut.has(element.id) ? newElementWith(element, { isDeleted: true }) : element,
  );
  return shiftBelow(cleared, bottom, -(pool.height + POOL_GAP));
}
