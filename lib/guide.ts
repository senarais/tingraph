import { DiagramCategory } from "@/lib/types";
import {
  BAR_TEMPLATE,
  BPMN_TEMPLATE,
  FLOWCHART_TEMPLATE,
  LINE_TEMPLATE,
  ORG_TEMPLATE,
  PIE_TEMPLATE,
  SCATTER_TEMPLATE,
  MIND_TEMPLATE,
  MATRIX_TEMPLATE,
  VENN_TEMPLATE,
  FISHBONE_TEMPLATE,
  USECASE_TEMPLATE,
  ACTIVITY_TEMPLATE,
  ERD_TEMPLATE,
  SEQUENCE_TEMPLATE,
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


const USECASE_SECTIONS: GuideSection[] = [
  {
    title: "Diagram",
    rows: [
      row('usecase "Title" {', "open a use case diagram"),
      row('system S "Name" {', "the boundary the use cases stand in"),
    ],
  },
  {
    title: "Elements",
    rows: [
      row('actor A "Name"', "a stick figure outside the system"),
      row('actor A "Name" right', "pin it to that side of the boundary"),
      row('usecase U "Goal"', "an oval, declared inside a system block"),
    ],
  },
  {
    title: "Relations",
    rows: [
      row("A -> U", "association: A takes part in U"),
      row("include U -> V", "U always runs V"),
      row("extend V -> U", "V adds to U, under a condition"),
      row("inherit A -> B", "A is a kind of B (hollow head)"),
      row("# comment", "line comment (also //)"),
    ],
  },
];

const ACTIVITY_SECTIONS: GuideSection[] = [
  {
    title: "Diagram",
    rows: [
      row('activity "Title" {', "open an activity diagram"),
      row('lane L "Name" {', "a partition; it is drawn as a column"),
    ],
  },
  {
    title: "Nodes",
    rows: [
      row("initial S1", "the filled dot it starts at; alias: start"),
      row('action A1 "Do it"', "a rounded box; alias: task"),
      row("decision D1", "a branch; guards go on the arrows"),
      row("merge M1", "the branches coming back together"),
      row("fork F1", "one flow splitting into several"),
      row("join J1", "several coming back into one"),
      row('object O1 "Invoice"', "a value passing along the flow"),
      row("final E1", "the bullseye it ends at; alias: end"),
      row("flow-final X1", "this one branch stops here"),
    ],
  },
  {
    title: "Flows",
    rows: [
      row("A -> B", "control flow"),
      row("D1 [yes] -> B", "a guard on the branch"),
      row("A -.-> O1", "object flow (dashed)"),
      row("A -> B -> C", "chain"),
    ],
  },
];

const ERD_SECTIONS: GuideSection[] = [
  {
    title: "Diagram",
    rows: [
      row('erd "Title" {', "open an entity relationship diagram"),
      row('entity E "table" {', "an entity, with its attributes inside"),
      row('weak E "table" {', "one that needs its owner to be told apart"),
    ],
  },
  {
    title: "Attributes",
    rows: [
      row('"name" "type"', "one attribute row"),
      row('pk "id" "bigint"', "primary key"),
      row('fk "owner_id" "bigint"', "foreign key; pfk for both"),
      row('"email" "varchar" unique', "unique"),
      row('"closed_at" "date" null', "may be missing; drawn as type?"),
    ],
  },
  {
    title: "Relations",
    rows: [
      row("A -> B", "one to many, the usual case"),
      row("A one -> many B", "the crow's foot at each end"),
      row('A many -> one B "label"', "and what the relation is called"),
      row("A -.-> B", "non-identifying (dashed)"),
      row("ends", "one, many, one-or-many, zero-or-one"),
    ],
  },
];

const SEQUENCE_SECTIONS: GuideSection[] = [
  {
    title: "Diagram",
    rows: [row('sequence "Title" {', "open a sequence diagram")],
  },
  {
    title: "Participants",
    rows: [
      row('object B ":Order"', "a named box over a lifeline"),
      row('actor A "Customer"', "a stick figure"),
      row('boundary S "Screen"', "what the outside world touches"),
      row('control C "Handler"', "what runs the work"),
      row('entity E "Account"', "what is stored"),
      row('database D "Ledger"', "a store drawn as a drum"),
    ],
  },
  {
    title: "Messages",
    rows: [
      row('A -> B "call()"', "a call; opens an execution on B"),
      row('A ->> B "signal()"', "asynchronous, open head"),
      row('B --> A "answer"', "a reply; ends B's execution"),
      row('create A -> B "new"', "B's lifeline starts here"),
      row('destroy A -> B "close"', "B's lifeline ends with a cross"),
      row('B -> B "check()"', "a call to itself, drawn as a loop"),
    ],
  },
  {
    title: "Fragments",
    rows: [
      row('alt "guard" { … }', "one section runs"),
      row('} else "guard" { … }', "the next section of an alt"),
      row('opt "guard" { … }', "runs only if the guard holds"),
      row('loop "while" { … }', "runs again and again"),
      row("par { … } and { … }", "the sections run alongside"),
      row("break / critical", "the other two operators"),
    ],
  },
  {
    title: "Settings",
    rows: [
      row("numbers on", "number every message in order"),
      row("activations off", "leave the execution bars off"),
      row("style tinted", "formal, tinted or bold"),
      row("colors colorful", "or one colour: colors \"#2a78d6\""),
      row("spacing 150", "least room between two lifelines"),
      row("step 46", "from one message down to the next"),
      row("text 12", "caption size"),
      row("size 700 420", "how big it is drawn"),
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
  row("legend bottom", "auto, none, right, bottom, top"),
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


const MIND_SECTIONS: GuideSection[] = [
  {
    title: "Map",
    rows: [row('mind "Central idea" {', "open a mind map; the title is the middle")],
  },
  {
    title: "Branches",
    rows: [
      row('"A branch"', "one branch off the idea"),
      row('"A branch" {', "a branch with more hanging off it"),
      row('"A branch" "#2a78d6"', "a branch in a colour of its own"),
      row('"A branch" circle', "a branch drawn as a different shape"),
    ],
  },
  {
    title: "Arrangement",
    rows: [
      row("layout radial", "radial, sides, down"),
      row("spread 150", "how far a level sits from the one above"),
      row("line curve", "curve, elbow, straight"),
      row("shape round", "round, pill, box, circle, diamond, hex, none"),
    ],
  },
  {
    title: "Look",
    rows: [
      row("colors colorful", "auto, single, colorful, warm, cool, ink"),
      row("branch on", "one hue per branch, rather than per level"),
      row("style formal", "formal, soft, bold, wire"),
      row("text 13", "how big a caption is set"),
      row("size 760 560", "how big the map is drawn"),
      row("# comment", "line comment (also //)"),
    ],
  },
];

const MATRIX_SECTIONS: GuideSection[] = [
  {
    title: "Matrix",
    rows: [row('matrix "Title" {', "open a 2×2 matrix")],
  },
  {
    title: "Axes",
    rows: [
      row('x "Value" "Low" "High"', "the across axis, and its two ends"),
      row('y "Effort" "Low" "High"', "the up axis; low is the bottom end"),
      row("axis cross", "cross, arrows, tabs, none"),
    ],
  },
  {
    title: "Quadrants",
    rows: [
      row('top-left "Do later"', "name one corner"),
      row('top-right "Do now" "note"', "a name and a second line"),
      row('bottom-left "Don\'t do"', "the other two the same way"),
      row("labels inside", "inside the quadrants, or at the corners"),
    ],
  },
  {
    title: "Items",
    rows: [row('item "Rewrite docs" 70 30', "a card, at a percentage across and up")],
  },
  {
    title: "Look",
    rows: [
      row("style filled", "plain, filled, boxed, cards"),
      row("colors colorful", "auto, single, colorful, warm, cool, ink"),
      row("size 560 480", "how big the matrix is drawn"),
      row("# comment", "line comment (also //)"),
    ],
  },
];

const VENN_SECTIONS: GuideSection[] = [
  {
    title: "Diagram",
    rows: [row('venn "Title" {', "open a Venn diagram")],
  },
  {
    title: "Sets",
    rows: [
      row('set A "Human"', "name a ring; two or three of them"),
      row('set A "Human" "#2a78d6"', "a ring in a colour of its own"),
      row("overlap 0.5", "how far the rings sit into each other"),
    ],
  },
  {
    title: "Regions",
    rows: [
      row('A "126"', "what is only in A"),
      row('AB "32"', "what is in A and B but not C"),
      row('ABC "9"', "what is in all three"),
      row('out "Kermit"', "what is in none of them"),
    ],
  },
  {
    title: "Look",
    rows: [
      row("style tint", "outline, tint, bold"),
      row("colors colorful", "auto, single, colorful, warm, cool, ink"),
      row("zeros on", "write a nought in an empty region"),
      row("size 520 460", "how big the diagram is drawn"),
      row("# comment", "line comment (also //)"),
    ],
  },
];

const FISHBONE_SECTIONS: GuideSection[] = [
  {
    title: "Diagram",
    rows: [row('fishbone "The effect" {', "open one; the title goes in the head")],
  },
  {
    title: "Bones",
    rows: [
      row('bone "Material" {', "a category of cause; close it with }"),
      row('"A cause"', "one cause on that bone"),
      row('"A cause" {', "a cause with what is behind it"),
      row('bone "Material" "#e34948"', "a bone in a colour of its own"),
    ],
  },
  {
    title: "Look",
    rows: [
      row("style formal", "formal, boxed, bold"),
      row("head arrow", "arrow, box, curve"),
      row("angle 60", "how steeply a bone leaves the spine"),
      row("arrows on", "arrowheads where a cause meets its bone"),
      row("colors colorful", "auto, single, colorful, warm, cool, ink"),
      row("size 820 460", "how big it is drawn"),
      row("# comment", "line comment (also //)"),
    ],
  },
];

export const GUIDE_SECTIONS: Record<DiagramCategory, GuideSection[]> = {
  flow: FLOW_SECTIONS,
  bpmn: BPMN_SECTIONS,
  org: ORG_SECTIONS,
  bar: BAR_SECTIONS,
  line: LINE_SECTIONS,
  pie: PIE_SECTIONS,
  scatter: SCATTER_SECTIONS,
  usecase: USECASE_SECTIONS,
  activity: ACTIVITY_SECTIONS,
  erd: ERD_SECTIONS,
  sequence: SEQUENCE_SECTIONS,
  mind: MIND_SECTIONS,
  matrix: MATRIX_SECTIONS,
  venn: VENN_SECTIONS,
  fishbone: FISHBONE_SECTIONS,
};

/** One line of orientation, shown at the top of the guide. */
export const GUIDE_INTRO: Record<DiagramCategory, string> = {
  flow: "Declare every box once, then wire them with arrows. Spacing and routing are worked out for you.",
  bpmn: "Declare a pool, its lanes, then the elements inside each lane. Wire them afterwards, across lanes if you need to.",
  org: "Declare every role once, then draw the reporting lines. Levels, spacing and the bus routing are worked out for you.",
  usecase: "Declare the actors, then the use cases inside a system block, then join them. Actors that start something stand on the left, actors that only answer stand on the right.",
  activity: "Declare a partition, then the nodes inside it, then wire them. Partitions are drawn as columns and the flow reads down the page.",
  erd: "Declare every entity with its attributes, then the relations between them. The crow's foot at each end says how many.",
  sequence: "Declare the participants across the top, then the messages in the order they are sent. The execution bars are read off the messages, so there is nothing to place.",
  bar: "Write the readings one to a line, then any settings you want. Everything here is also a control in the Chart panel, and the two always agree.",
  line: "Name the readings along the axis, then one series per line you want drawn. Everything here is also a control in the Chart panel.",
  pie: "Write one slice per line. Shares are worked out for you, so the numbers can be counts rather than percentages.",
  scatter: "Write the points as (across, up) pairs, grouped into series. Everything here is also a control in the Chart panel.",
  mind: "Write the branches as an outline: a caption, and a block under it for whatever hangs off it. Most of a mind map is built on the sheet instead — this is the quick way to start one.",
  matrix: "Name the two axes and their ends, then the four corners. Items are dropped into the field and dragged where they belong on the sheet.",
  venn: "Name the sets, then say what falls in each region between them. A region is named by the sets it is in: A, AB, ABC.",
  fishbone: "The title is the effect, in the head. Each bone is a category of cause, and what is written inside it are the causes themselves.",
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

const FIGURE_RULES = (keyword: string, body: string[]): string[] => [
  `The file is one \`${keyword} "Title" { ... }\` block. Nothing may sit outside it.`,
  ...body,
  "Settings are written as `name value`, in any order.",
  "Do not invent settings. Every one the language has is listed above.",
];

const RULES: Record<DiagramCategory, string[]> = {
  mind: FIGURE_RULES("mind", [
    "The title is the idea in the middle; everything else hangs off it.",
    "A branch is a caption in quotes on its own line. Give it a `{ ... }` block for whatever hangs off it, nested as deep as you like.",
    "A colour and a shape may follow a branch's caption, in that order, and apply to that branch alone.",
  ]),
  matrix: FIGURE_RULES("matrix", [
    "`x` and `y` each take three captions: the axis name, the low end, the high end. On `y`, low is the bottom.",
    "The four corners are `top-left`, `top-right`, `bottom-left` and `bottom-right`, each with a name and optionally a second line.",
    "`item \"Name\" 70 30` places a card at a percentage across and up the field.",
  ]),
  venn: FIGURE_RULES("venn", [
    "Declare two or three sets with `set A \"Name\"`, in order: A, then B, then C.",
    "A region is named by the sets it belongs to — `A`, `AB`, `ABC` — and `out` is what belongs to none of them.",
    "A region nobody names is left empty rather than drawn as a blank.",
  ]),
  fishbone: FIGURE_RULES("fishbone", [
    "The title is the effect, and it is written in the head.",
    "Each category of cause is `bone \"Name\" { ... }`, and the causes inside it are captions in quotes.",
    "A cause may take a `{ ... }` block of its own for what is behind it, one level deep.",
    "Bones alternate above and below the spine in the order they are written.",
  ]),
  usecase: [
    'The file is one `usecase "Title" { ... }` block.',
    'Actors are declared at the top level; use cases go inside `system S "Name" { ... }`.',
    "`A -> U` is an association and is the only relation written with a bare arrow.",
    "`include`, `extend` and `inherit` each take one relation: `include U -> V`.",
    "An actor with no side written takes the left if it starts anything, the right otherwise.",
  ],
  activity: [
    'The file is one `activity "Title" { ... }` block.',
    'Partitions are `lane L "Name" { ... }` and are drawn as columns, left to right in the order written.',
    "Declare every node inside the partition it belongs to, then wire them after or inside.",
    "A guard belongs on the arrow out of a decision: `D1 [yes] -> A2`.",
    "A decision has one flow in and several out; a merge has several in and one out.",
  ],
  erd: [
    'The file is one `erd "Title" { ... }` block.',
    'An entity is `entity ID "table" { ... }`, and every attribute inside it is written in quotes.',
    "An attribute is `\"name\" \"type\"`, optionally opened with `pk`, `fk` or `pfk` and closed with `unique` or `null`.",
    "A relation is `A one -> many B`; leaving both ends out means one to many.",
    "The ends are `one`, `many`, `one-or-many` and `zero-or-one`. A dashed arrow is non-identifying.",
  ],
  sequence: [
    'The file is one `sequence "Title" { ... }` block.',
    "Declare every participant before the messages, at the top level: `object B \":Order\"`.",
    "Messages are written in the order they are sent, one per line, and that order is the diagram.",
    "`->` is a call, `->>` is asynchronous, `-->` is a reply. `create` and `destroy` open a message line.",
    "A fragment is a block: `alt \"guard\" { ... } else \"guard\" { ... }`. They may be nested.",
    "The execution bars are worked out from the messages; never try to place them.",
  ],
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
  usecase: "usecase",
  activity: "activity",
  erd: "erd",
  sequence: "sequence",
  bar: "bar",
  line: "line",
  pie: "pie",
  scatter: "scatter",
  mind: "mind",
  matrix: "matrix",
  venn: "venn",
  fishbone: "fishbone",
};

const EXAMPLE: Record<DiagramCategory, string> = {
  flow: FLOWCHART_TEMPLATE,
  bpmn: BPMN_TEMPLATE,
  org: ORG_TEMPLATE,
  usecase: USECASE_TEMPLATE,
  activity: ACTIVITY_TEMPLATE,
  erd: ERD_TEMPLATE,
  sequence: SEQUENCE_TEMPLATE,
  bar: BAR_TEMPLATE,
  line: LINE_TEMPLATE,
  pie: PIE_TEMPLATE,
  scatter: SCATTER_TEMPLATE,
  mind: MIND_TEMPLATE,
  matrix: MATRIX_TEMPLATE,
  venn: VENN_TEMPLATE,
  fishbone: FISHBONE_TEMPLATE,
};

const NOTATION_NAME: Record<DiagramCategory, string> = {
  flow: "flowchart",
  bpmn: "BPMN 2.0 diagram",
  org: "organisational chart",
  usecase: "UML use case diagram",
  activity: "UML activity diagram",
  erd: "entity relationship diagram",
  sequence: "UML sequence diagram",
  bar: "bar chart",
  line: "line chart",
  pie: "pie chart",
  scatter: "scatter plot",
  mind: "mind map",
  matrix: "2×2 matrix",
  venn: "Venn diagram",
  fishbone: "fishbone diagram",
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
