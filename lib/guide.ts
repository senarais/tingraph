import { DiagramCategory } from "@/lib/types";
import {
  BAR_TEMPLATE,
  BPMN_TEMPLATE,
  FLOWCHART_TEMPLATE,
  LINE_TEMPLATE,
  ORG_TEMPLATE,
  PIE_TEMPLATE,
  SCATTER_TEMPLATE,
} from "@/lib/templates";

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


/**
 * The chart settings, written once. Every kind of chart understands the whole
 * list; a setting that means nothing to the chart in front of it is simply not
 * shown, here or in the panel on the sheet.
 */
const LOOK_ROWS: GuideRow[] = [
  row('colors colorful', "auto, single, colorful, warm, cool, ink"),
  row('colors "#2a78d6"', "one colour, pinned"),
  row("style framed", "plain, ruled, framed, bold"),
  row("legend bottom", "none, right, bottom, top"),
  row("values on", "write the number on every mark"),
  row("size 520 340", "how big the chart is drawn"),
  row("# comment", "line comment (also //)"),
];

const AXIS_ROWS: GuideRow[] = [
  row('x "Caption"', "caption under the across axis"),
  row('y "Caption"', "caption beside the up axis"),
  row("grid value", "none, value, category, both"),
  row("range 0 250", "pin where the value axis runs"),
];

const BAR_SECTIONS: GuideSection[] = [
  {
    title: "Chart",
    rows: [row('bar "Title" {', "open a bar chart; close it with }")],
  },
  {
    title: "Readings",
    rows: [
      row("Apples 40", "one bar, named and measured"),
      row('"Two words" 40', "a name with a space goes in quotes"),
      row("categories A B C", "name the bars, for grouped series"),
      row('series "Round 1" 10 20 12', "one series across those categories"),
      row('series "R1" "#e34948" 10 20', "a series in a colour of its own"),
    ],
  },
  {
    title: "Bars",
    rows: [
      row("bars horizontal", "vertical or horizontal"),
      row("layout stacked", "grouped or stacked, for several series"),
    ],
  },
  { title: "Axes", rows: AXIS_ROWS },
  { title: "Look", rows: LOOK_ROWS },
];

const LINE_SECTIONS: GuideSection[] = [
  {
    title: "Chart",
    rows: [row('line "Title" {', "open a line chart")],
  },
  {
    title: "Readings",
    rows: [
      row("2017 8", "one reading, named and measured"),
      row("categories 2017 2018", "name the readings along the axis"),
      row('series "Bears" 8 55 92', "one line across those categories"),
      row('series "B" "#2a78d6" 8 55', "a line in a colour of its own"),
    ],
  },
  {
    title: "Line",
    rows: [
      row("markers on", "a dot at every reading"),
      row("curve on", "join the readings with a curve"),
      row("area on", "wash the space under the line"),
    ],
  },
  { title: "Axes", rows: AXIS_ROWS },
  { title: "Look", rows: LOOK_ROWS },
];

const PIE_SECTIONS: GuideSection[] = [
  {
    title: "Chart",
    rows: [row('pie "Title" {', "open a pie chart")],
  },
  {
    title: "Slices",
    rows: [
      row("Apples 40", "one slice, named and measured"),
      row('"Mocha Marvels" 32.9', "a name with a space goes in quotes"),
      row('series "Share" 40 60', "the same slices, written as a series"),
    ],
  },
  {
    title: "Pie",
    rows: [
      row("percent on", "read the values as shares of the whole"),
      row("donut 0.5", "open a hole in the middle, 0 to 0.9"),
    ],
  },
  { title: "Look", rows: LOOK_ROWS },
];

const SCATTER_SECTIONS: GuideSection[] = [
  {
    title: "Chart",
    rows: [row('scatter "Title" {', "open a scatter plot")],
  },
  {
    title: "Points",
    rows: [
      row("(12, 40)", "one point, across then up"),
      row('(12, 40) "A. Cabbell"', "a point with a name beside it"),
      row('series "Japan" (13, 4)', "a named cloud of points"),
      row('series "J" "#e34948" (13, 4)', "a cloud in a colour of its own"),
    ],
  },
  {
    title: "Cloud",
    rows: [
      row("trend on", "one straight line of best fit"),
      row("markers on", "draw the points themselves"),
    ],
  },
  { title: "Axes", rows: AXIS_ROWS },
  { title: "Look", rows: LOOK_ROWS },
];

export const GUIDE_SECTIONS: Record<DiagramCategory, GuideSection[]> = {
  flow: FLOW_SECTIONS,
  bpmn: BPMN_SECTIONS,
  org: ORG_SECTIONS,
  bar: BAR_SECTIONS,
  line: LINE_SECTIONS,
  pie: PIE_SECTIONS,
  scatter: SCATTER_SECTIONS,
};

/** One line of orientation, shown at the top of the guide. */
export const GUIDE_INTRO: Record<DiagramCategory, string> = {
  flow: "Declare every box once, then wire them with arrows. Spacing and routing are worked out for you.",
  bpmn: "Declare a pool, its lanes, then the elements inside each lane. Wire them afterwards, across lanes if you need to.",
  org: "Declare every role once, then draw the reporting lines. Levels, spacing and the bus routing are worked out for you.",
  bar: "Write the readings one to a line, then any settings you want. Everything here is also a control in the Chart panel, and the two always agree.",
  line: "Name the readings along the axis, then one series per line you want drawn. Everything here is also a control in the Chart panel.",
  pie: "Write one slice per line. Shares are worked out for you, so the numbers can be counts rather than percentages.",
  scatter: "Write the points as (across, up) pairs, grouped into series. Everything here is also a control in the Chart panel.",
};

/** The rules every chart shares, with the one word that differs filled in. */
const CHART_RULES = (keyword: string, mark: string): string[] => [
  `The file is one \`${keyword} "Title" { ... }\` block. Nothing may sit outside it.`,
  `A reading is \`Name 40\`, one per line, and draws ${mark}. A name with a space or a comma in it goes in quotes.`,
  "Settings are written as `name value`, in any order, before or after the readings.",
  "A word that is a setting name is never read as a reading; quote it if you need it as a name.",
  "Use `series` only when there is more than one thing being measured; a single series needs no `series` line at all.",
  "Do not invent settings. Every one the language has is listed above.",
];

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
  bar: CHART_RULES("bar", "a bar per reading"),
  line: CHART_RULES("line", "a line through the readings"),
  pie: CHART_RULES("pie", "a slice per reading"),
  scatter: CHART_RULES("scatter", "a point per reading"),
  org: [
    "The file is one `org \"Title\" { ... }` block.",
    "A box is `role ID \"ROLE\" \"Name\"`. Drop the second caption for a role with no name attached.",
    "A box that lists sub-roles opens a block: `role ID \"ROLE\" { unit \"Sub-role\" \"Name\" ... }`. `unit` is only legal inside such a block.",
    "`A -> B` means B reports to A. Use it once per reporting line.",
    "`A -.-> B` is an advisory tie, drawn dashed and left out of the reporting bus.",
  ],
};

const KEYWORD: Record<DiagramCategory, string> = {
  flow: "flow",
  bpmn: "bpmn",
  org: "org",
  bar: "bar",
  line: "line",
  pie: "pie",
  scatter: "scatter",
};

const EXAMPLE: Record<DiagramCategory, string> = {
  flow: FLOWCHART_TEMPLATE,
  bpmn: BPMN_TEMPLATE,
  org: ORG_TEMPLATE,
  bar: BAR_TEMPLATE,
  line: LINE_TEMPLATE,
  pie: PIE_TEMPLATE,
  scatter: SCATTER_TEMPLATE,
};

const NOTATION_NAME: Record<DiagramCategory, string> = {
  flow: "flowchart",
  bpmn: "BPMN 2.0 diagram",
  org: "organisational chart",
  bar: "bar chart",
  line: "line chart",
  pie: "pie chart",
  scatter: "scatter plot",
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
