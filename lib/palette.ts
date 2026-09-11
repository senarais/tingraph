import {
  bpmnShapeSize,
  flowDimensions,
  orgBoxLayout,
} from "@/lib/layout/compute-layout";
import { DiagramCategory, NodeType } from "@/lib/types";

export interface PaletteItem {
  /** DSL keyword */
  type: string;
  label: string;
  /** what the element means, shown on the card */
  hint: string;
  /** structural blocks (pool, lane) are written in code, never dropped */
  droppable: boolean;
}

export interface PaletteGroup {
  title: string;
  items: PaletteItem[];
}

/** The drag payload a shape card writes, and the canvas reads back on drop. */
export const SHAPE_DRAG_TYPE = "application/x-tingraph-shape";

const BPMN_GROUPS: PaletteGroup[] = [
  {
    title: "Events",
    items: [
      { type: "start", label: "Start", hint: "thin circle", droppable: true },
      { type: "msg-start", label: "Message start", hint: "catching envelope", droppable: true },
      { type: "timer", label: "Timer", hint: "clock face", droppable: true },
      { type: "end", label: "End", hint: "thick circle", droppable: true },
      { type: "msg-end", label: "Message end", hint: "throwing envelope", droppable: true },
    ],
  },
  {
    title: "Activities",
    items: [
      { type: "task", label: "Task", hint: "rounded box", droppable: true },
      { type: "send-task", label: "Send task", hint: "filled envelope", droppable: true },
      { type: "recv-task", label: "Receive task", hint: "open envelope", droppable: true },
      { type: "script-task", label: "Script task", hint: "script marker", droppable: true },
      { type: "user-task", label: "User task", hint: "user marker", droppable: true },
    ],
  },
  {
    title: "Gateways",
    items: [
      { type: "gw-ex", label: "Exclusive", hint: "one branch wins", droppable: true },
      { type: "gw-para", label: "Parallel", hint: "all branches run", droppable: true },
      { type: "gw-inc", label: "Inclusive", hint: "any branch runs", droppable: true },
    ],
  },
  {
    title: "Data & structure",
    items: [
      { type: "data", label: "Data object", hint: "document", droppable: true },
      { type: "pool", label: "Pool", hint: "participant block", droppable: false },
      { type: "lane", label: "Lane", hint: "role inside a pool", droppable: false },
    ],
  },
];

const FLOW_GROUPS: PaletteGroup[] = [
  {
    title: "Nodes",
    items: [
      { type: "start", label: "Start", hint: "terminator", droppable: true },
      { type: "process", label: "Process", hint: "step", droppable: true },
      { type: "decision", label: "Decision", hint: "branch point", droppable: true },
      { type: "io", label: "Input / output", hint: "shaded step", droppable: true },
      { type: "end", label: "End", hint: "terminator", droppable: true },
    ],
  },
];

const ORG_GROUPS: PaletteGroup[] = [
  {
    title: "Boxes",
    items: [
      { type: "role", label: "Role & name", hint: "band over a name", droppable: true },
      { type: "role-only", label: "Role only", hint: "band on its own", droppable: true },
      { type: "role-units", label: "Role & units", hint: "band over sub-roles", droppable: true },
    ],
  },
];

/**
 * A chart has no shapes to drop: what a reader adds to one is a reading, and
 * that is the Chart panel's job rather than the shape drawer's. The rail hides
 * the drawer entirely when this list is empty.
 */
export const PALETTE_GROUPS: Record<DiagramCategory, PaletteGroup[]> = {
  bpmn: BPMN_GROUPS,
  flow: FLOW_GROUPS,
  org: ORG_GROUPS,
  bar: [],
  line: [],
  pie: [],
  scatter: [],
};

function idPrefix(type: string): string {
  if (type.startsWith("msg-")) return "M";
  if (type.startsWith("send-") || type.startsWith("script-")) return "S";
  if (type.startsWith("recv-")) return "R";
  if (type.startsWith("user-")) return "U";
  if (type.startsWith("gw-")) return "G";
  if (type === "data") return "D";
  if (type === "process") return "P";
  if (type === "decision") return "Q";
  if (type === "io") return "I";
  return type.slice(0, 1).toUpperCase();
}

/** The box a palette item stands for, as the org layout reads it. */
export function orgSampleNode(type: string, counter: number) {
  if (type === "role-only") {
    return { id: `R${counter}`, type: "role" as const, label: `ROLE ${counter}` };
  }
  if (type === "role-units") {
    return {
      id: `R${counter}`,
      type: "role" as const,
      label: `ROLE ${counter}`,
      entries: [
        { label: "Sub-role", name: "Name" },
        { label: "Sub-role", name: "Name" },
      ],
    };
  }
  return {
    id: `R${counter}`,
    type: "role" as const,
    label: `ROLE ${counter}`,
    name: "Name",
  };
}

/** DSL text for the item, ready to drop at the caret. */
export function snippetFor(item: PaletteItem, counter: number): string {
  if (item.type === "role") {
    return `\n  role R${counter} "ROLE ${counter}" "Name"`;
  }
  if (item.type === "role-only") {
    return `\n  role R${counter} "ROLE ${counter}"`;
  }
  if (item.type === "role-units") {
    return (
      `\n  role R${counter} "ROLE ${counter}" {` +
      `\n    unit "Sub-role" "Name"` +
      `\n    unit "Sub-role" "Name"` +
      `\n  }`
    );
  }
  if (item.type === "pool") {
    return `\n  pool P${counter} "Pool ${counter}" {\n    lane L${counter} "Lane ${counter}" {\n    }\n  }\n`;
  }
  if (item.type === "lane") {
    return `\n  lane L${counter} "Lane ${counter}" {\n  }\n`;
  }
  return `\n  ${item.type} ${idPrefix(item.type)}${counter} "${item.label}"`;
}

/**
 * Writes a snippet into the source without an editor in play — used when the
 * shape palette is open and the code panel is not mounted. `caretLine` is a
 * 1-based line number; the snippet lands after it when it sits inside the
 * diagram body, otherwise just above the closing brace.
 */
export function withSnippet(
  code: string,
  snippet: string,
  caretLine?: number,
): string {
  const lines = code.split("\n");
  let closing = lines.length - 1;
  while (closing > 0 && !lines[closing].includes("}")) {
    closing -= 1;
  }
  const insertAt =
    caretLine !== undefined && caretLine >= 1 && caretLine <= closing
      ? caretLine
      : closing;
  const block = snippet.replace(/^\n/, "").replace(/\n$/, "").split("\n");
  lines.splice(insertAt, 0, ...block);
  return lines.join("\n");
}

/**
 * How big the item lands on the sheet. The preview that follows the pointer
 * during a drag and the shape that is finally dropped read this same
 * measurement, so the box the reader is shown is the box they get.
 */
export function paletteShapeSize(
  item: PaletteItem,
  category: DiagramCategory,
): { width: number; height: number } {
  if (category === "org") {
    const box = orgBoxLayout(orgSampleNode(item.type, 1));
    return { width: box.width, height: box.height };
  }
  if (category === "flow") {
    return flowDimensions(item.type as NodeType, item.label);
  }
  return bpmnShapeSize(item.type as NodeType, droppedLabel(item));
}

/**
 * The caption a dropped BPMN shape starts with. An event or a gateway carries
 * its caption underneath, and an unnamed one is cleaner to type over than a
 * placeholder, so only an activity arrives with words in it.
 */
export function droppedLabel(item: PaletteItem): string {
  return item.type.includes("task") || item.type === "task" ? item.label : "";
}
