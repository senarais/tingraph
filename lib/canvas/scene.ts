import {
  convertToExcalidrawElements,
  newElementWith,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { unitOf } from "@/lib/canvas/units";
import {
  buildLaneSkeletons,
  buildPoolSkeletons,
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
      unit = { members: [], cores: [] };
      units.set(mark.unit, unit);
    }
    unit.members.push(element);
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
  accent: string,
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
      accent,
    ),
  );
  return [...shiftBelow(elements, bottom, POOL_GAP + height), ...added];
}

/** A new lane along the bottom of `pool`, growing the pool to hold it. */
export function addLane(
  elements: Elements,
  pool: PoolBox,
  accent: string,
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
      accent,
    ),
  );
  return [...grown, ...added];
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
  const cleared = elements.map((element) =>
    gone.has(element.id) ? newElementWith(element, { isDeleted: true }) : element,
  );
  return shiftBelow(cleared, bottom, -(pool.height + POOL_GAP));
}
