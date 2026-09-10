import { DiagramCategory } from "@/lib/types";
import { BPMN_TEMPLATE, FLOWCHART_TEMPLATE, ORG_TEMPLATE } from "@/lib/templates";

/**
 * The one description of the language. The guide drawer reads `sections` to
 * draw its tables, and `promptFor` folds the same rows into a briefing a
 * reader can paste into a chat so an assistant writes valid source for them.
 * Two renderings, one source of truth.
 */

export interface GuideRow {
  syntax: string;
  meaning: string;
}

export interface GuideSection {
  title: string;
  rows: GuideRow[];
}

const row = (syntax: string, meaning: string): GuideRow => ({ syntax, meaning });

const FLOW_SECTIONS: GuideSection[] = [
  {
    title: "Diagram",
    rows: [row('flow "Title" {', "open a flowchart; close it with }")],
  },
  {
    title: "Nodes",
    rows: [
      row('start ID "Label"', "terminator (ellipse)"),
      row('process ID "Label"', "process step; alias: task"),
      row('decision ID "Label"', "branch point (diamond)"),
      row('io ID "Label"', "input / output; alias: data"),
      row('end ID "Label"', "terminator (ellipse)"),
    ],
  },
  {
    title: "Edges",
    rows: [
      row("A -> B", "directed edge"),
      row("A [Yes] -> B", "edge with a caption"),
      row("A -> B -> C", "chain"),
      row("# comment", "line comment (also //)"),
    ],
  },
];

const BPMN_SECTIONS: GuideSection[] = [
  {
    title: "Diagram",
    rows: [
      row('bpmn "Title" {', "open a BPMN 2.0 diagram"),
      row('pool ID "Label" {', "participant, holds lanes"),
      row('lane ID "Label" {', "role inside a pool"),
    ],
  },
  {
    title: "Events",
    rows: [
      row('start ID "Label"', "start event (thin circle)"),
      row('msg-start ID "Label"', "message start (open envelope)"),
      row('timer ID "Label"', "timer event (clock)"),
      row('end ID "Label"', "end event (thick circle)"),
      row('msg-end ID "Label"', "message end (filled envelope)"),
    ],
  },
  {
    title: "Activities",
    rows: [
      row('task ID "Label"', "task (rounded rectangle)"),
      row('send-task ID "Label"', "send task"),
      row('recv-task ID "Label"', "receive task"),
      row('script-task ID "Label"', "script task"),
      row('user-task ID "Label"', "user task"),
    ],
  },
  {
    title: "Gateways and data",
    rows: [
      row('gw-ex ID "Label"', "exclusive gateway (X)"),
      row('gw-para ID "Label"', "parallel gateway (+)"),
      row('gw-inc ID "Label"', "inclusive gateway (O)"),
      row('data ID "Label"', "data object (document)"),
    ],
  },
  {
    title: "Flows",
    rows: [
      row("A -> B", "sequence flow"),
      row("A [Yes] -> B", "conditional flow"),
      row("A -.-> D", "data association (dotted)"),
    ],
  },
];

const ORG_SECTIONS: GuideSection[] = [
  {
    title: "Chart",
    rows: [row('org "Title" {', "open an org chart")],
  },
  {
    title: "Boxes",
    rows: [
      row('role ID "Role" "Name"', "role band over a name"),
      row('role ID "Role"', "role band on its own"),
      row('role ID "Role" {', "role band over sub-roles"),
      row('unit "Sub-role" "Name"', "one sub-role, inside a role block"),
    ],
  },
  {
    title: "Lines",
    rows: [
      row("A -> B", "B reports to A"),
      row("A -> B -> C", "chain of reporting lines"),
      row("A -.-> B", "advisory tie (dashed)"),
      row("# comment", "line comment (also //)"),
    ],
  },
];

export const GUIDE_SECTIONS: Record<DiagramCategory, GuideSection[]> = {
  flow: FLOW_SECTIONS,
  bpmn: BPMN_SECTIONS,
  org: ORG_SECTIONS,
};

/** One line of orientation, shown at the top of the guide. */
export const GUIDE_INTRO: Record<DiagramCategory, string> = {
  flow: "Declare every box once, then wire them with arrows. Spacing and routing are worked out for you.",
  bpmn: "Declare a pool, its lanes, then the elements inside each lane. Wire them afterwards, across lanes if you need to.",
  org: "Declare every role once, then draw the reporting lines. Levels, spacing and the bus routing are worked out for you.",
};

const RULES: Record<DiagramCategory, string[]> = {
  flow: [
    "The file is one `flow \"Title\" { ... }` block. Nothing may sit outside it.",
    "An element is `<keyword> <ID> \"Label\"`, one per line. The ID is short, unique, and never quoted.",
    "Every ID used in an arrow must be declared above it.",
    "A decision usually has two outgoing arrows, each with its own caption: `D1 [Yes] -> E1`.",
  ],
  bpmn: [
    "The file is one `bpmn \"Title\" { ... }` block.",
    "Participants are `pool ID \"Label\" { ... }`; inside a pool, roles are `lane ID \"Label\" { ... }`; elements are declared inside a lane.",
    "An element is `<keyword> <ID> \"Label\"`, one per line, and its ID must be unique across the whole diagram.",
    "Flows are declared after the pool block, at the top level, and may cross lanes.",
    "A data object is joined with a dotted association `A -.-> D1`, never with a sequence flow.",
  ],
  org: [
    "The file is one `org \"Title\" { ... }` block.",
    "A box is `role ID \"ROLE\" \"Name\"`. Drop the second caption for a role with no name attached.",
    "A box that lists sub-roles opens a block: `role ID \"ROLE\" { unit \"Sub-role\" \"Name\" ... }`. `unit` is only legal inside such a block.",
    "`A -> B` means B reports to A. Use it once per reporting line.",
    "`A -.-> B` is an advisory tie, drawn dashed and left out of the reporting bus.",
  ],
};

const KEYWORD = { flow: "flow", bpmn: "bpmn", org: "org" } as const;

const EXAMPLE: Record<DiagramCategory, string> = {
  flow: FLOWCHART_TEMPLATE,
  bpmn: BPMN_TEMPLATE,
  org: ORG_TEMPLATE,
};

const NOTATION_NAME: Record<DiagramCategory, string> = {
  flow: "flowchart",
  bpmn: "BPMN 2.0 diagram",
  org: "organisational chart",
};

/**
 * The whole tutorial as one block of plain text, written as a briefing for an
 * assistant: every keyword, every rule, and a worked example, ending with the
 * output contract so what comes back can be pasted straight into the editor.
 */
export function promptFor(category: DiagramCategory): string {
  const sections = GUIDE_SECTIONS[category]
    .map(
      (section) =>
        `${section.title}\n` +
        section.rows
          .map((entry) => `  ${entry.syntax.padEnd(26)}  ${entry.meaning}`)
          .join("\n"),
    )
    .join("\n\n");

  return [
    `You are writing Tingraph source. Tingraph is a small text language that draws a ${NOTATION_NAME[category]}. Answer with Tingraph source only.`,
    "",
    "SYNTAX",
    sections,
    "",
    "RULES",
    RULES[category].map((rule) => `- ${rule}`).join("\n"),
    "",
    "WORKED EXAMPLE",
    EXAMPLE[category].trimEnd(),
    "",
    "OUTPUT",
    `- Reply with one fenced code block and nothing else.`,
    `- The block starts with \`${KEYWORD[category]} "…" {\` and ends with \`}\`.`,
    "- Do not invent keywords: use only the ones listed above.",
    "- Keep labels short enough to read inside a box, and keep every ID unique.",
    "",
    "MY DIAGRAM",
    "Describe what you want here, then send this message.",
  ].join("\n");
}
