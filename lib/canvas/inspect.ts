import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { unitOf } from "@/lib/canvas/units";
import { DiagramCategory } from "@/lib/types";

/**
 * Reading the sheet: what is picked, what is under the reader's hand, and what
 * the properties panel is allowed to offer for it. Nothing here writes — the
 * writing half lives in `restyle.ts` — so all of it can be checked without a
 * browser.
 */

type Elements = readonly ExcalidrawElement[];

/**
 * The elements under the reader's hand this frame: one being drawn, dragged,
 * resized, turned, or edited point by point. Repairing a connector's route
 * while it is being dragged is what makes an arrow snap back, shrink or
 * vanish, so these are left exactly as Excalidraw has them until the pointer
 * comes up.
 */
export interface HandState {
  multiElement?: { id: string } | null;
  newElement?: { id: string } | null;
  editingLinearElement?: { elementId: string } | null;
  selectedLinearElement?: { elementId: string; isDragging: boolean } | null;
  selectedElementsAreBeingDragged?: boolean;
  isResizing?: boolean;
  isRotating?: boolean;
  selectedElementIds: Readonly<{ [id: string]: boolean }>;
}

export function held(state: HandState): Set<string> {
  const busy = new Set<string>();
  const add = (id: string | null | undefined) => {
    if (id) {
      busy.add(id);
    }
  };
  add(state.multiElement?.id);
  add(state.newElement?.id);
  add(state.editingLinearElement?.elementId);
  if (state.selectedLinearElement?.isDragging) {
    add(state.selectedLinearElement.elementId);
  }
  // a whole connector being moved, resized or turned by its selection box
  if (state.selectedElementsAreBeingDragged || state.isResizing || state.isRotating) {
    for (const id of Object.keys(state.selectedElementIds)) {
      if (state.selectedElementIds[id]) {
        busy.add(id);
      }
    }
  }
  return busy;
}


export interface Controls {
  /** what the panel calls what is picked */
  name: string;
  stroke: boolean;
  fill: boolean;
  weight: boolean;
  dash: boolean;
  corners: boolean;
  opacity: boolean;
  /** font, size and alignment for the captions inside the selection */
  text: boolean;
  /** one line naming what the notation is holding fixed */
  fixed: string | null;
}

/**
 * A notation owns part of every shape it draws: a BPMN end event is a thick
 * circle, a task is a rounded box, a connector is a square line with a filled
 * head. Those are not preferences, so the panel does not offer them — it says
 * so instead, and offers only what is genuinely the reader's to choose.
 */
const NOTHING: Controls = {
  name: "",
  stroke: false,
  fill: false,
  weight: false,
  dash: false,
  corners: false,
  opacity: false,
  text: false,
  fixed: null,
};

const SHAPES = new Set(["rectangle", "ellipse", "diamond"]);

/** Everything picked on the sheet, captions of picked boxes included. */
export function selection(
  elements: Elements,
  ids: Readonly<{ [id: string]: boolean }>,
): ExcalidrawElement[] {
  const picked = elements.filter(
    (element) => !element.isDeleted && ids[element.id],
  );
  const boxes = new Set(picked.map((element) => element.id));
  const captions = elements.filter((element) => {
    const container = (element as { containerId?: string | null }).containerId;
    return !element.isDeleted && !!container && boxes.has(container);
  });
  return [...picked, ...captions];
}

/** The piece that carries the element's own settings. */
function leader(picked: ExcalidrawElement[]): ExcalidrawElement | null {
  return (
    picked.find((element) => {
      const mark = unitOf(element);
      return (!mark || mark.core) && element.type !== "text";
    }) ??
    picked.find((element) => !unitOf(element) || unitOf(element)?.core) ??
    picked[0] ??
    null
  );
}

export function controlsFor(
  picked: ExcalidrawElement[],
  category: DiagramCategory,
): Controls {
  const head = leader(picked);
  if (!head) {
    return NOTHING;
  }
  const mark = unitOf(head);
  const hasText = picked.some((element) => element.type === "text");

  if (mark?.kind === "figure") {
    return {
      ...NOTHING,
      name: "Figure",
      fixed:
        "A figure is set from its own panel in the rail, and adjusted by its handles on the sheet.",
    };
  }

  if (mark?.kind === "edge") {
    return {
      ...NOTHING,
      name: category === "org" ? "Reporting line" : "Connector",
      stroke: true,
      dash: true,
      text: hasText,
      fixed: "The head and the square routing come from the notation.",
    };
  }

  if (mark?.kind === "pool" || mark?.kind === "lane") {
    return {
      ...NOTHING,
      name: mark.kind === "pool" ? "Pool" : "Lane",
      stroke: true,
      text: hasText,
      fixed: "A participant band is an unfilled hairline box in BPMN 2.0.",
    };
  }

  if (head.type === "text") {
    return {
      ...NOTHING,
      name: "Caption",
      stroke: true,
      opacity: true,
      text: true,
      fixed: null,
    };
  }

  if (head.type === "image") {
    return { ...NOTHING, name: "Image", opacity: true, fixed: null };
  }

  if (head.type === "freedraw" || head.type === "line") {
    return {
      ...NOTHING,
      name: head.type === "line" ? "Line" : "Drawing",
      stroke: true,
      weight: true,
      dash: true,
      opacity: true,
      fixed: null,
    };
  }

  if (head.type === "arrow") {
    return {
      ...NOTHING,
      name: "Arrow",
      stroke: true,
      weight: true,
      dash: true,
      opacity: true,
      text: hasText,
      fixed: null,
    };
  }

  if (!SHAPES.has(head.type)) {
    return { ...NOTHING, name: "Element", stroke: true, opacity: true };
  }

  // --- a box drawn by a notation, or one the reader drew themselves
  const drawn = !!mark;
  const isEvent = drawn && category === "bpmn" && head.type === "ellipse";
  const isTask = drawn && category === "bpmn" && head.type === "rectangle";
  const isOrgBox = drawn && category === "org";
  return {
    name: !drawn
      ? "Shape"
      : isEvent
        ? "Event"
        : isTask
          ? "Task"
          : head.type === "diamond"
            ? category === "bpmn"
              ? "Gateway"
              : "Decision"
            : isOrgBox
              ? "Role box"
              : head.type === "ellipse"
                ? "Terminator"
                : "Step",
    stroke: true,
    fill: true,
    // an event's ring weight is what tells a start from an end
    weight: !isEvent,
    dash: !drawn,
    // only a box the notation leaves square may be rounded
    corners: !drawn || mark?.soft === true,
    opacity: true,
    text: hasText,
    fixed: isEvent
      ? "The ring weight is what separates a start from an end."
      : isTask
        ? "A task keeps the rounded outline BPMN 2.0 gives it."
        : null,
  };
}

/** What the panel shows as the current setting. */
export function readValues(picked: ExcalidrawElement[]) {
  const head = leader(picked) ?? picked[0];
  const caption = picked.find((element) => element.type === "text") as
    | (ExcalidrawElement & { fontFamily: number; fontSize: number; textAlign: string })
    | undefined;
  return {
    strokeColor: head?.strokeColor ?? "#1e1e1e",
    backgroundColor: head?.backgroundColor ?? "transparent",
    strokeWidth: head?.strokeWidth ?? 2,
    strokeStyle: (head?.strokeStyle ?? "solid") as "solid" | "dashed" | "dotted",
    rounded: !!head?.roundness,
    opacity: head?.opacity ?? 100,
    fontFamily: caption?.fontFamily ?? 2,
    fontSize: caption?.fontSize ?? 16,
    textAlign: (caption?.textAlign ?? "center") as "left" | "center" | "right",
  };
}
