import { nodeSize } from "@/lib/layout/compute-layout";
import { DiagramCategory, DSLNode, NodeType } from "@/lib/types";

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

const USECASE_GROUPS: PaletteGroup[] = [
  {
    title: "Elements",
    items: [
      { type: "actor", label: "Actor", hint: "stick figure", droppable: true },
      { type: "usecase", label: "Use case", hint: "an oval goal", droppable: true },
      { type: "system", label: "System", hint: "the boundary round them", droppable: false },
    ],
  },
];

const ACTIVITY_GROUPS: PaletteGroup[] = [
  {
    title: "Steps",
    items: [
      { type: "action", label: "Action", hint: "rounded box", droppable: true },
      { type: "object", label: "Object", hint: "a value passing along", droppable: true },
    ],
  },
  {
    title: "Branches",
    items: [
      { type: "decision", label: "Decision", hint: "one way or the other", droppable: true },
      { type: "merge", label: "Merge", hint: "the ways coming back", droppable: true },
      { type: "fork", label: "Fork", hint: "split into several", droppable: true },
      { type: "join", label: "Join", hint: "several back into one", droppable: true },
    ],
  },
  {
    title: "Start and stop",
    items: [
      { type: "initial", label: "Initial", hint: "filled dot", droppable: true },
      { type: "final", label: "Final", hint: "bullseye", droppable: true },
      { type: "flow-final", label: "Flow final", hint: "this branch stops", droppable: true },
      { type: "lane", label: "Partition", hint: "a column, written in code", droppable: false },
    ],
  },
];

const ERD_GROUPS: PaletteGroup[] = [
  {
    title: "Tables",
    items: [
      { type: "entity", label: "Entity", hint: "a table and its attributes", droppable: true },
      { type: "weak", label: "Weak entity", hint: "double outline", droppable: true },
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
  usecase: USECASE_GROUPS,
  activity: ACTIVITY_GROUPS,
  erd: ERD_GROUPS,
  sequence: [],
  bar: [],
  line: [],
  pie: [],
  scatter: [],
  mind: [],
  matrix: [],
  venn: [],
  fishbone: [],
};

function idPrefix(type: string): string {
  if (type === "usecase") return "U";
  if (type === "actor") return "A";
  if (type === "action") return "A";
  if (type === "object") return "O";
  if (type === "initial") return "S";
  if (type === "final" || type === "flow-final") return "E";
  if (type === "merge") return "M";
  if (type === "fork") return "F";
  if (type === "join") return "J";
  if (type === "entity" || type === "weak") return "E";
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

/**
 * The node a palette item stands for, as the layout reads it. One place, so
 * the preview under the pointer, the shape that lands and the size the two are
 * measured at can never disagree.
 */
export function sampleNode(
  category: DiagramCategory,
  type: string,
  counter: number,
): DSLNode {
  if (category === "org") {
    return orgSampleNode(type, counter) as DSLNode;
  }
  const id = `${idPrefix(type)}${counter}`;
  if (category === "erd") {
    return {
      id,
      type: type as NodeType,
      label: `table_${counter}`,
      fields: [
        { name: "id", type: "bigint", key: "pk" },
        { name: "name", type: "varchar(50)" },
      ],
    };
  }
  if (category === "usecase") {
    return {
      id,
      type: type as NodeType,
      label: type === "actor" ? `Actor ${counter}` : `Use case ${counter}`,
    };
  }
  if (category === "activity") {
    return {
      id,
      type: type as NodeType,
      label:
        type === "action" ? `Action ${counter}` : type === "object" ? `Object ${counter}` : "",
    };
  }
  const item = PALETTE_GROUPS[category]
    .flatMap((group) => group.items)
    .find((entry) => entry.type === type);
  return {
    id,
    type: type as NodeType,
    label: category === "flow" ? (item?.label ?? type) : droppedLabel(item ?? { type, label: type, hint: "", droppable: true }),
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
  if (item.type === "system") {
    return `\n  system S${counter} "System ${counter}" {\n    usecase U${counter} "Goal"\n  }\n`;
  }
  if (item.type === "entity" || item.type === "weak") {
    return (
      `\n  ${item.type} E${counter} "table_${counter}" {` +
      `\n    pk "id" "bigint"` +
      `\n    "name" "varchar(50)"` +
      `\n  }`
    );
  }
  if (
    item.type === "initial" ||
    item.type === "final" ||
    item.type === "flow-final" ||
    item.type === "decision" ||
    item.type === "merge" ||
    item.type === "fork" ||
    item.type === "join"
  ) {
    return `\n  ${item.type} ${idPrefix(item.type)}${counter}`;
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
  return nodeSize(category, sampleNode(category, item.type, 1));
}

/**
 * The caption a dropped BPMN shape starts with. An event or a gateway carries
 * its caption underneath, and an unnamed one is cleaner to type over than a
 * placeholder, so only an activity arrives with words in it.
 */
export function droppedLabel(item: PaletteItem): string {
  return item.type.includes("task") || item.type === "task" ? item.label : "";
}
