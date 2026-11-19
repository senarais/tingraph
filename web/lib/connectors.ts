import type { Arrowhead } from "@excalidraw/excalidraw/element/types";
import { headRoom } from "@/lib/canvas/connect";
import type { DiagramCategory, DSLEdge } from "@/lib/types";

/**
 * The connectors each notation draws with.
 *
 * A notation does not have one line, it has a small set of them: BPMN tells a
 * sequence flow from a message flow from an association, and an org chart
 * tells a reporting line from an advisory one. The rail offers this list, and
 * the sheet keeps whichever one a connector was drawn as, so a line can always
 * be read back for what it means.
 *
 * A new notation is added by adding a row here and a routing rule in
 * `lib/canvas/connect.ts`; nothing else needs to know about it.
 */
export interface ConnectorKind {
  id: string;
  label: string;
  /** what the line means, one line, shown beside it in the rail */
  hint: string;
  strokeStyle: "solid" | "dashed" | "dotted";
  startArrowhead: Arrowhead | null;
  endArrowhead: Arrowhead | null;
  /**
   * Known to the sheet, but left out of the rail's list. An ERD can write any
   * pairing of crow's feet it likes; a list of sixteen would be a worse thing
   * to hand a reader than the five they actually reach for.
   */
  hidden?: true;
}

const BPMN: ConnectorKind[] = [
  {
    id: "sequence",
    label: "Sequence flow",
    hint: "one step, then the next",
    strokeStyle: "solid",
    startArrowhead: null,
    endArrowhead: "triangle",
  },
  {
    id: "message",
    label: "Message flow",
    hint: "across participants",
    strokeStyle: "dashed",
    startArrowhead: "circle_outline",
    endArrowhead: "triangle_outline",
  },
  {
    id: "association",
    label: "Association",
    hint: "ties data to a step",
    strokeStyle: "dotted",
    startArrowhead: null,
    endArrowhead: "triangle_outline",
  },
];

const FLOW: ConnectorKind[] = [
  {
    id: "flow",
    label: "Flow line",
    hint: "the way the chart runs",
    strokeStyle: "solid",
    startArrowhead: null,
    endArrowhead: "triangle",
  },
  {
    id: "annotation",
    label: "Annotation",
    hint: "a note tied to a step",
    strokeStyle: "dotted",
    startArrowhead: null,
    endArrowhead: "triangle_outline",
  },
];

const ARCHITECTURE: ConnectorKind[] = [
  { id: "data-flow", label: "Data flow", hint: "request or transfer", strokeStyle: "solid", startArrowhead: null, endArrowhead: "triangle" },
  { id: "event", label: "Event / async", hint: "dashed event path", strokeStyle: "dashed", startArrowhead: null, endArrowhead: "triangle_outline" },
];

const ORG: ConnectorKind[] = [
  {
    id: "report",
    label: "Reporting line",
    hint: "reports to, on the rail",
    strokeStyle: "solid",
    startArrowhead: null,
    endArrowhead: "triangle",
  },
  {
    id: "advisory",
    label: "Advisory tie",
    hint: "dashed, no command",
    strokeStyle: "dashed",
    startArrowhead: null,
    endArrowhead: null,
  },
];

const USECASE: ConnectorKind[] = [
  {
    id: "association",
    label: "Association",
    hint: "this actor takes part in this",
    strokeStyle: "solid",
    startArrowhead: null,
    endArrowhead: null,
  },
  {
    id: "directed",
    label: "Directed association",
    hint: "and this end starts it",
    strokeStyle: "solid",
    startArrowhead: null,
    endArrowhead: "arrow",
  },
  {
    id: "include",
    label: "Include",
    hint: "always runs the other one",
    strokeStyle: "dashed",
    startArrowhead: null,
    endArrowhead: "arrow",
  },
  {
    id: "extend",
    label: "Extend",
    hint: "adds to it, under a condition",
    strokeStyle: "dashed",
    startArrowhead: null,
    endArrowhead: "arrow",
  },
  {
    id: "inherit",
    label: "Generalisation",
    hint: "is a kind of, hollow head",
    strokeStyle: "solid",
    startArrowhead: null,
    endArrowhead: "triangle_outline",
  },
];

const ACTIVITY: ConnectorKind[] = [
  {
    id: "control",
    label: "Control flow",
    hint: "one action, then the next",
    strokeStyle: "solid",
    startArrowhead: null,
    endArrowhead: "arrow",
  },
  {
    id: "object-flow",
    label: "Object flow",
    hint: "a value passed on",
    strokeStyle: "dashed",
    startArrowhead: null,
    endArrowhead: "arrow",
  },
];

/**
 * UML class relations. The ids carry the notation's name because a use case
 * diagram already has an `association` and an `inherit` drawn differently, and
 * a line is looked up by id across every notation when a sheet is read back.
 *
 * Aggregation and composition carry their diamond at the *start*: the source
 * writes the whole first (`compose Order -> Line`), and the diamond belongs on
 * the whole.
 */
const CLASS: ConnectorKind[] = [
  {
    id: "class-association",
    label: "Association",
    hint: "the two know each other",
    strokeStyle: "solid",
    startArrowhead: null,
    endArrowhead: null,
  },
  {
    id: "class-directed",
    label: "Directed association",
    hint: "only this end knows the other",
    strokeStyle: "solid",
    startArrowhead: null,
    endArrowhead: "arrow",
  },
  {
    id: "class-inherit",
    label: "Generalisation",
    hint: "is a kind of, hollow head",
    strokeStyle: "solid",
    startArrowhead: null,
    endArrowhead: "triangle_outline",
  },
  {
    id: "class-implement",
    label: "Realisation",
    hint: "implements the interface",
    strokeStyle: "dashed",
    startArrowhead: null,
    endArrowhead: "triangle_outline",
  },
  {
    id: "class-aggregate",
    label: "Aggregation",
    hint: "has, hollow diamond on the whole",
    strokeStyle: "solid",
    startArrowhead: "diamond_outline",
    endArrowhead: null,
  },
  {
    id: "class-compose",
    label: "Composition",
    hint: "owns, filled diamond on the whole",
    strokeStyle: "solid",
    startArrowhead: "diamond",
    endArrowhead: null,
  },
  {
    id: "class-depend",
    label: "Dependency",
    hint: "uses, dashed",
    strokeStyle: "dashed",
    startArrowhead: null,
    endArrowhead: "arrow",
  },
];

/** A data flow diagram has one line: data, moving, and always named. */
const DFD: ConnectorKind[] = [
  {
    id: "data",
    label: "Data flow",
    hint: "named data, moving one way",
    strokeStyle: "solid",
    startArrowhead: null,
    endArrowhead: "triangle",
  },
];

const STATE: ConnectorKind[] = [
  {
    id: "transition",
    label: "Transition",
    hint: "event [guard] / action",
    strokeStyle: "solid",
    startArrowhead: null,
    endArrowhead: "arrow",
  },
];

const TREE: ConnectorKind[] = [
  {
    id: "branch",
    label: "Branch",
    hint: "parent to child, on the rail",
    strokeStyle: "solid",
    startArrowhead: null,
    endArrowhead: null,
  },
  {
    id: "cross-link",
    label: "Cross link",
    hint: "dashed, outside the hierarchy",
    strokeStyle: "dashed",
    startArrowhead: null,
    endArrowhead: null,
  },
];

/**
 * The four ends a crow's foot is written with. Excalidraw carries a head for
 * each of them but has none that rings a fork, so "many" stands for zero or
 * many — the pairing every ERD leans on — and one-or-many is written out.
 */
export type ErdEnd = "one" | "many" | "one-or-many" | "zero-or-one";

const ERD_HEADS: Record<ErdEnd, Arrowhead> = {
  one: "crowfoot_one",
  many: "crowfoot_many",
  "one-or-many": "crowfoot_one_or_many",
  "zero-or-one": "circle_outline",
};

const ERD_WORDS: Record<ErdEnd, string> = {
  one: "one",
  many: "many",
  "one-or-many": "one or many",
  "zero-or-one": "zero or one",
};

export const ERD_ENDS = Object.keys(ERD_HEADS) as ErdEnd[];

/** The line one pairing of ends is drawn as. */
export function erdLine(from: ErdEnd, to: ErdEnd): string {
  return `erd-${from}-to-${to}`;
}

/** The five pairings the rail offers, in the order it offers them. */
const ERD_SHOWN: Array<[ErdEnd, ErdEnd]> = [
  ["one", "many"],
  ["many", "one"],
  ["one", "one"],
  ["many", "many"],
  ["zero-or-one", "many"],
];

function erdKind(from: ErdEnd, to: ErdEnd, shown: boolean): ConnectorKind {
  const name = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
  return {
    id: erdLine(from, to),
    label: `${name(ERD_WORDS[from])} to ${ERD_WORDS[to]}`,
    hint: "crow's foot at each end",
    strokeStyle: "solid",
    startArrowhead: ERD_HEADS[from],
    endArrowhead: ERD_HEADS[to],
    ...(shown ? {} : { hidden: true as const }),
  };
}

const ERD: ConnectorKind[] = [
  ...ERD_SHOWN.map(([from, to]) => erdKind(from, to, true)),
  {
    id: "non-identifying",
    label: "Non-identifying",
    hint: "dashed: the child stands on its own",
    strokeStyle: "dashed",
    startArrowhead: "crowfoot_one",
    endArrowhead: "crowfoot_many",
  },
  ...ERD_ENDS.flatMap((from) =>
    ERD_ENDS.filter(
      (to) => !ERD_SHOWN.some(([a, b]) => a === from && b === to),
    ).map((to) => erdKind(from, to, false)),
  ),
];

/**
 * A figure joins nothing: its marks are drawn from its own spec rather than
 * placed one at a time, so it carries no connectors and the rail does not
 * offer the instrument at all. A mind map's branches are not connectors —
 * they are part of the map, and the map draws them itself.
 */
/**
 * A block diagram has one line: a signal, from one element to the next, with
 * a filled head. A junction's + and − are written at the end of the signal,
 * not drawn as a kind of line.
 */
const BLOCK: ConnectorKind[] = [
  {
    id: "signal",
    label: "Signal",
    hint: "from one element to the next",
    strokeStyle: "solid",
    startArrowhead: null,
    endArrowhead: "triangle",
  },
];

export const CONNECTORS: Record<DiagramCategory, ConnectorKind[]> = {
  bpmn: BPMN,
  flow: FLOW,
  org: ORG,
  usecase: USECASE,
  activity: ACTIVITY,
  erd: ERD,
  architecture: ARCHITECTURE,
  class: CLASS,
  dfd: DFD,
  state: STATE,
  tree: TREE,
  block: BLOCK,
  sequence: [],
  bar: [],
  histogram: [],
  area: [],
  waterfall: [],
  funnel: [],
  radar: [],
  timeline: [],
  sankey: [],
  line: [],
  pie: [],
  scatter: [],
  mind: [],
  matrix: [],
  venn: [],
  fishbone: [],
  prisma: [],
  quadrant: [],
  gantt: [],
};

const ALL = [
  ...BPMN,
  ...FLOW,
  ...ORG,
  ...USECASE,
  ...ACTIVITY,
  ...ERD,
  ...ARCHITECTURE,
  ...CLASS,
  ...DFD,
  ...STATE,
  ...TREE,
  ...BLOCK,
];

/** The line a notation draws unless the reader picks another, if it draws any. */
export function defaultConnector(category: DiagramCategory): string | null {
  return CONNECTORS[category][0]?.id ?? null;
}

/** A connector kind by name, falling back to the notation's own first line. */
export function connectorKind(id: string, category: DiagramCategory): ConnectorKind {
  return (
    CONNECTORS[category].find((kind) => kind.id === id) ??
    ALL.find((kind) => kind.id === id) ??
    CONNECTORS[category][0] ??
    BPMN[0]
  );
}

/**
 * The lines that each say something of their own, so two of them are never
 * drawn as one even when they leave or meet the same element. A data flow is
 * named with the data it carries and a transition with the event that fires
 * it; two that merged into one stretch would leave a reader unable to tell
 * which name belongs to which. A class association is named too, and its
 * multiplicities sit at its own ends. Every other line of the same kind that
 * leaves or meets one element may share a stretch: that is a bracket.
 */
const NEVER_SHARED = new Set([
  "data",
  "transition",
  "class-association",
  "class-directed",
  "class-aggregate",
  "class-compose",
  "class-depend",
]);

/** Whether a line is one of those that never shares a stretch with another. */
export function keepsApart(line: string): boolean {
  return NEVER_SHARED.has(line);
}

/** Whether two connectors may run along one stretch: a bracket, or a merge. */
export function mayShare(
  a: { line: string; from: string; to: string },
  b: { line: string; from: string; to: string },
): boolean {
  return a.line === b.line && !NEVER_SHARED.has(a.line) && (a.from === b.from || a.to === b.to);
}

/** Just the part of a connector Excalidraw draws from. */
export function connectorInk(kind: ConnectorKind) {
  return {
    strokeStyle: kind.strokeStyle,
    startArrowhead: kind.startArrowhead,
    endArrowhead: kind.endArrowhead,
  };
}

/**
 * Which of the notation's lines an edge in the source is drawn as. A notation
 * whose source names the line outright — a use case include, an ERD's pair of
 * crow's feet — says so on the edge; the rest have one solid line and one
 * dashed one, and the arrow written in the source picks between them.
 */
const DASHED: Partial<Record<DiagramCategory, string>> = {
  bpmn: "association",
  org: "advisory",
  flow: "annotation",
  usecase: "include",
  activity: "object-flow",
  erd: "non-identifying",
  architecture: "event",
  class: "class-depend",
  tree: "cross-link",
};

export function edgeLine(
  category: DiagramCategory,
  edge: Pick<DSLEdge, "line" | "kind">,
): string {
  if (edge.line) {
    return edge.line;
  }
  if (edge.kind !== "association") {
    return defaultConnector(category) ?? "sequence";
  }
  return DASHED[category] ?? "annotation";
}

/**
 * The straight run each end of an edge needs for its heads to be drawn whole,
 * so a layout can leave that much room before the last turn.
 */
export function edgeHeads(
  category: DiagramCategory,
  edge: Pick<DSLEdge, "line" | "kind">,
): [number, number] {
  const kind = connectorKind(edgeLine(category, edge), category);
  return [headRoom(kind.startArrowhead), headRoom(kind.endArrowhead)];
}
