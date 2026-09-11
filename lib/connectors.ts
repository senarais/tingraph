import type { Arrowhead } from "@excalidraw/excalidraw/element/types";
import type { DiagramCategory } from "@/lib/types";

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
 * `lib/canvas/connect.ts`; nothing else needs to know about it. An ERD's
 * crow's-foot ties are the next ones to land, and Excalidraw already carries
 * the heads they need.
 */
export interface ConnectorKind {
  id: string;
  label: string;
  /** what the line means, one line, shown beside it in the rail */
  hint: string;
  strokeStyle: "solid" | "dashed" | "dotted";
  startArrowhead: Arrowhead | null;
  endArrowhead: Arrowhead | null;
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

/**
 * A chart joins nothing: its marks are readings, not elements, so it carries
 * no connectors and the rail does not offer the instrument at all.
 */
export const CONNECTORS: Record<DiagramCategory, ConnectorKind[]> = {
  bpmn: BPMN,
  flow: FLOW,
  org: ORG,
  bar: [],
  line: [],
  pie: [],
  scatter: [],
};

const ALL = [...BPMN, ...FLOW, ...ORG];

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

/** Just the part of a connector Excalidraw draws from. */
export function connectorInk(kind: ConnectorKind) {
  return {
    strokeStyle: kind.strokeStyle,
    startArrowhead: kind.startArrowhead,
    endArrowhead: kind.endArrowhead,
  };
}
