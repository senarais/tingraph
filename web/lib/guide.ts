import { DiagramCategory } from "@/lib/types";
import {
  BAR_TEMPLATE,
  HISTOGRAM_TEMPLATE,
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
  PRISMA_TEMPLATE,
  QUADRANT_TEMPLATE,
  GANTT_TEMPLATE,
  AREA_TEMPLATE,
  WATERFALL_TEMPLATE,
  FUNNEL_TEMPLATE,
  RADAR_TEMPLATE,
  TIMELINE_TEMPLATE,
  SANKEY_TEMPLATE,
  BLOCK_TEMPLATE,
  USECASE_TEMPLATE,
  ACTIVITY_TEMPLATE,
  ERD_TEMPLATE,
  SEQUENCE_TEMPLATE,
  ARCHITECTURE_TEMPLATES,
  CLASS_TEMPLATE,
  DFD_TEMPLATE,
  STATE_TEMPLATE,
  TREE_TEMPLATE,
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

const CLASS_SECTIONS: GuideSection[] = [
  {
    title: "Diagram",
    rows: [row('class "Title" {', "open a UML class diagram")],
  },
  {
    title: "Classifiers",
    rows: [
      row('class ID "Name" { ... }', "class: name, attributes, operations"),
      row('abstract ID "Name" { ... }', "abstract class, «abstract» over the name"),
      row('interface ID "Name" { ... }', "interface, «interface» over the name"),
      row('enum ID "Name" { ... }', "enumeration, «enumeration» over the name"),
      row('attr "- name : String"', "an attribute, inside the block"),
      row('method "+ save() : void"', "an operation, inside the block"),
      row('value "ACTIVE"', "an enumeration literal, inside the block"),
    ],
  },
  {
    title: "Relations",
    rows: [
      row("A -> B", "association (plain line)"),
      row('A "1" -> "0..*" B "places"', "association with multiplicities and a name"),
      row("navigate A -> B", "directed association (open arrow at B)"),
      row("inherit A -> B", "generalisation: A is a kind of B"),
      row("implement A -> B", "realisation: A implements interface B"),
      row("aggregate A -> B", "aggregation: A has B (hollow diamond at A)"),
      row("compose A -> B", "composition: A owns B (filled diamond at A)"),
      row("depend A -> B", "dependency: A uses B (dashed); also A -.-> B"),
      row("# comment", "line comment (also //)"),
    ],
  },
];

const DFD_SECTIONS: GuideSection[] = [
  {
    title: "Diagram",
    rows: [row('dfd "Title" {', "open a data flow diagram (Gane–Sarson)")],
  },
  {
    title: "Shapes",
    rows: [
      row('process ID "Verb + noun"', "process, numbered 1, 2, 3 in order written"),
      row('process ID "Check stock" "1.2"', "process with its own number (level 1)"),
      row('entity ID "Name"', "external entity: a source or a sink"),
      row('store ID "Name"', "data store, coded D1, D2, D3 in order written"),
      row('store ID "Orders" "D3"', "data store with its own code"),
    ],
  },
  {
    title: "Flows",
    rows: [
      row('A -> B "Data name"', "data flow, named with the data it carries"),
      row("A [Data name] -> B", "the same, caption in brackets"),
      row("# comment", "line comment (also //)"),
    ],
  },
];

const STATE_SECTIONS: GuideSection[] = [
  {
    title: "Diagram",
    rows: [row('state "Title" {', "open a UML state machine diagram")],
  },
  {
    title: "States",
    rows: [
      row("initial ID", "initial pseudostate (filled dot); alias: start"),
      row('state ID "Name"', "state (rounded box)"),
      row('state ID "Name" { ... }', "state listing its internal activities"),
      row('entry "action()"', "runs on entering, inside the block"),
      row('do "activity()"', "runs while in the state, inside the block"),
      row('exit "action()"', "runs on leaving, inside the block"),
      row("final ID", "final state (bullseye); alias: end"),
    ],
  },
  {
    title: "Pseudostates",
    rows: [
      row("choice ID", "choice (diamond): branch on guards"),
      row("fork ID", "fork bar: one transition into several"),
      row("join ID", "join bar: several transitions into one"),
    ],
  },
  {
    title: "Transitions",
    rows: [
      row("A -> B", "transition with no trigger (completion)"),
      row('A -> B "event [guard] / action"', "labelled transition, every part optional"),
      row('A -> A "tick"', "self-transition"),
      row("# comment", "line comment (also //)"),
    ],
  },
];

const TREE_SECTIONS: GuideSection[] = [
  {
    title: "Diagram",
    rows: [row('tree "Title" {', "open a tree: decision tree, WBS or hierarchy")],
  },
  {
    title: "Boxes",
    rows: [
      row('node ID "Label"', "branch: a box with boxes under it"),
      row('leaf ID "Label"', "leaf (rounded): a path ends here"),
    ],
  },
  {
    title: "Branches",
    rows: [
      row("A -> B", "B hangs from A"),
      row('A -> B "sunny"', "branch with a caption, e.g. a decision's answer"),
      row("A -.-> B", "cross link (dashed), outside the hierarchy"),
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
  {
    title: "Which columns it joins",
    rows: [
      row("A.id -> B.a_id", "leaves that key and meets that one"),
      row("left out", "the keys are paired up on their names"),
      row("panel", "or set it in Tables, beside the relation"),
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

const GANTT_SECTIONS: GuideSection[] = [
  {
    title: "Chart",
    rows: [
      row('gantt "Title" {', "open a Gantt chart"),
      row('unit "Week"', "what one numbered unit is called"),
      row("today 5", "a dashed line through the unit the chart is read in"),
    ],
  },
  {
    title: "Tasks",
    rows: [
      row('section "Research"', "a section; the tasks after it are listed under it"),
      row('task T1 "Survey" 1 3', "starts in unit 1, lasts 3 units"),
      row('task T2 "Write" after T1 2', "starts once T1 ends, lasts 2"),
      row('task T3 "Test" after T1 T2 2', "starts once both have ended"),
      row('task T1 "Survey" 1 3 done 60', "60% of it done"),
      row('milestone M1 "Defence" after T2', "a diamond where T2 ends"),
      row('milestone M2 "Launch" 12', "a diamond at the start of unit 12"),
    ],
  },
  {
    title: "Look",
    rows: [
      row('color "#2a78d6"', "the colour every bar takes"),
      row("text 12", "caption size, 9 to 20"),
      row("size 760 400", "width and height on the sheet"),
    ],
  },
];

const QUADRANT_SECTIONS: GuideSection[] = [
  {
    title: "Figure",
    rows: [row('quadrant "Title" {', "open a 2×2 quadrant")],
  },
  {
    title: "Axes",
    rows: [
      row('x "Effort" "Low" "High"', "across axis: its name, then its low and high ends"),
      row('y "Impact" "Low" "High"', "up axis: its name, then its low and high ends"),
    ],
  },
  {
    title: "Quarters",
    rows: [
      row('top-left "Quick wins"', "caption of the top-left quarter"),
      row('top-right "Major projects"', "caption of the top-right quarter"),
      row('bottom-left "Fill-ins"', "caption of the bottom-left quarter"),
      row('bottom-right "Thankless tasks"', "caption of the bottom-right quarter"),
    ],
  },
  {
    title: "Items",
    rows: [row('item "Name" 30 80', "a dot at 30% across and 80% up")],
  },
  {
    title: "Look",
    rows: [
      row("style tint", "outline or tint"),
      row('color "#2a78d6"', "the colour every item takes"),
      row("text 13", "caption size, 9 to 22"),
      row("size 560 500", "width and height on the sheet"),
    ],
  },
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

const HISTOGRAM_SECTIONS: GuideSection[] = [
  {
    title: "Chart",
    rows: [row('histogram "Title" {', "open a histogram; close it with }")],
  },
  {
    title: "Bins",
    rows: [
      row('"40-50" 2', "one bin and its count, in order along the axis"),
      row('"<40" 1', "an open bin at either end"),
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
    rows: [row('matrix "Title" {', "open a matrix table")],
  },
  {
    title: "Columns",
    rows: [
      row('corner "Name / Skill"', "caption in the top-left corner"),
      row('column "Safety"', "one column heading"),
      row('column "3-GEN" "Kaizen"', "a column under a spanning group heading"),
      row('column "Safety" "" "#2a78d6"', "a heading with its own fill"),
    ],
  },
  {
    title: "Rows and cells",
    rows: [
      row('row "Amir" "x" "" "Trainer"', "one value per column; any text is valid"),
      row('row "Budi" {', "open a row when cells need their own colours"),
      row('cell "High" "#00a86b"', "one cell value and an optional fill"),
      row('color "#fff2cc"', "the row heading's own fill, inside a row block"),
    ],
  },
  {
    title: "Arrangement",
    rows: [
      row("header vertical", "horizontal or vertical column labels"),
      row("align center", "left, center, right"),
      row("row-header 140", "width of the headings down the left"),
      row("header-height 112", "height of the column labels"),
    ],
  },
  {
    title: "Look",
    rows: [
      row("style headers", "plain, headers, banded, heatmap"),
      row('header-color "#2a78d6"', "shared column-heading colour"),
      row('row-color "#dce9f8"', "shared row-heading colour"),
      row('cell-color "#fff2cc"', "body fill for bands or a heatmap"),
      row('grid-color "#1f2933"', "lines and the title"),
      row("border 1.5", "grid-line weight"),
      row("text 13", "caption size"),
      row("size 760 460", "how big the matrix is drawn"),
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

const PRISMA_SECTIONS: GuideSection[] = [
  {
    title: "Diagram",
    rows: [
      row('prisma "Title" {', "open a PRISMA 2020 flow diagram"),
      row('band "Identification"', "name the phase the rows after it stand in"),
    ],
  },
  {
    title: "The flow",
    rows: [
      row('row "Records screened" 955', "a step and its total"),
      row('row "Records identified from" 1423 {', "a step with lines under it"),
      row('"Databases" 1200', "one line and its own count"),
      row('side "Records excluded" 812 {', "what left the flow at the row above"),
      row('"Duplicate records removed" 300', "one reason and its count"),
    ],
  },
  {
    title: "Look",
    rows: [
      row("style formal", "formal, banded, bold"),
      row("bands on", "the four phase bands down the left"),
      row("text 12", "caption size"),
      row("size 820 660", "how big the flow is drawn"),
      row("# comment", "line comment (also //)"),
    ],
  },
];

const ARCHITECTURE_SECTIONS: GuideSection[] = [
  { title: "Components", rows: [
    row('architecture "Title" {', "open an architecture diagram; close with }"),
    row('zone REGION "Name"', "outlined region that grows to fit components centred inside it"),
    ...["client", "service", "database", "storage", "queue", "cloud", "external"].map((type) =>
      row(`${type} ID "Name"`, `place a ${type} component`)),
    row('at 120 200', "optional starting position; nearby nodes align when generated"),
    row('size 300 180', "component size, or the minimum size of a zone"),
  ] },
  { title: "Connections", rows: [
    row("A -> B", "directed data flow; chain as A -> B -> C"),
    row("A -.-> B", "dashed event or async flow"),
    row("A [request] -> B", "caption on a connection"),
  ] },
];

const AREA_SECTIONS: GuideSection[] = [
  {
    title: "Chart",
    rows: [row('area "Title" {', "open an area chart")],
  },
  {
    title: "Readings",
    rows: [
      row("categories 2018 2019 2020", "name the readings along the axis"),
      row('series "Coal" 40 38 35', "one band across those categories"),
      row('series "Gas" "#eb6834" 25 27', "a band in a colour of its own"),
      row("2018 40", "one reading, for a single band"),
    ],
  },
  {
    title: "Bands",
    rows: [
      row("layout stacked", "stacked (each band on the one below) or overlap"),
      row("curve on", "join the readings with a curve"),
      row("markers on", "a dot at every reading"),
    ],
  },
  { title: "Axes", rows: AXIS_ROWS },
  { title: "Look", rows: LOOK_ROWS },
];

const WATERFALL_SECTIONS: GuideSection[] = [
  {
    title: "Chart",
    rows: [row('waterfall "Title" {', "open a waterfall chart")],
  },
  {
    title: "Steps",
    rows: [
      row('"Revenue" 140 start', "a bar from zero; the running total starts here"),
      row('"Cost of goods" -30', "a change: up when positive, down when negative"),
      row('"Gross margin" total', "a bar from zero to the running total so far"),
    ],
  },
  {
    title: "Bars",
    rows: [row("bars horizontal", "vertical or horizontal")],
  },
  { title: "Axes", rows: AXIS_ROWS },
  { title: "Look", rows: LOOK_ROWS },
];

const FUNNEL_SECTIONS: GuideSection[] = [
  {
    title: "Chart",
    rows: [row('funnel "Title" {', "open a funnel chart")],
  },
  {
    title: "Stages",
    rows: [
      row("Visits 12000", "one stage, named and counted, widest first"),
      row('"Added to cart" 1900', "a name with a space goes in quotes"),
    ],
  },
  {
    title: "Funnel",
    rows: [row("percent on", "write each stage's share of the first")],
  },
  { title: "Look", rows: LOOK_ROWS },
];

const RADAR_SECTIONS: GuideSection[] = [
  {
    title: "Chart",
    rows: [row('radar "Title" {', "open a radar chart")],
  },
  {
    title: "Readings",
    rows: [
      row("categories Speed Cost Safety", "name the spokes, three or more"),
      row('series "Model A" 8 6 7', "one polygon across those spokes"),
      row('series "B" "#eb6834" 6 9 5', "a polygon in a colour of its own"),
    ],
  },
  {
    title: "Wheel",
    rows: [
      row("area on", "fill each polygon"),
      row("markers on", "a dot at every reading"),
      row("range 0 10", "pin where the spokes start and end"),
    ],
  },
  { title: "Look", rows: LOOK_ROWS },
];

const TIMELINE_SECTIONS: GuideSection[] = [
  {
    title: "Figure",
    rows: [row('timeline "Title" {', "open a timeline")],
  },
  {
    title: "Events",
    rows: [
      row('event 1969 "Apollo 11"', "an event at a time written as a number"),
      row('event 1969 "Apollo 11" "first landing"', "an event with a note under it"),
      row('event "Mar 2024" "Kick-off"', "a time written as words; drawn in sequence"),
    ],
  },
  {
    title: "Axis",
    rows: [
      row("scale time", "time (gaps to scale) or even (order only)"),
      row("orientation vertical", "horizontal or vertical"),
    ],
  },
  {
    title: "Look",
    rows: [
      row('color "#2a78d6"', "the colour of the dots and stems"),
      row("text 13", "caption size, 9 to 22"),
      row("size 820 300", "width and height on the sheet"),
      row("# comment", "line comment (also //)"),
    ],
  },
];

const SANKEY_SECTIONS: GuideSection[] = [
  {
    title: "Figure",
    rows: [row('sankey "Title" {', "open a Sankey diagram")],
  },
  {
    title: "Flows",
    rows: [
      row('"Gas" -> "Power" 120', "a flow of 120 from one node to another"),
      row("Coal -> Power 80", "a one-word name needs no quotes"),
      row('node "Coal" "#555555"', "pin a node's colour"),
    ],
  },
  {
    title: "Look",
    rows: [
      row('unit "PJ"', "written after every value"),
      row("values off", "leave the totals off the nodes"),
      row("colors colorful", "ink (grey bands) or colorful (a hue per source)"),
      row("text 13", "caption size, 9 to 22"),
      row("size 760 420", "width and height on the sheet"),
      row("# comment", "line comment (also //)"),
    ],
  },
];

const BLOCK_SECTIONS: GuideSection[] = [
  {
    title: "Diagram",
    rows: [row('block "Title" {', "open a block diagram, control loop or signal-flow graph")],
  },
  {
    title: "Elements",
    rows: [
      row('input R "R(s)"', "where a signal starts, drawn as its name"),
      row('block G "G(s)"', "a block: a transfer function or a stage"),
      row("sum S", "summing junction (a crossed circle)"),
      row("point T", "takeoff point: one signal copied onto several lines"),
      row('output Y "Y(s)"', "where a signal ends, drawn as its name"),
      row('node X1 "x1"', "a signal-flow graph's variable, a small circle"),
    ],
  },
  {
    title: "Signals",
    rows: [
      row("A -> B", "a signal from A to B"),
      row('A -> B "U(s)"', "a signal with its name, or a branch gain"),
      row("A -> S plus", "into a summing junction, added"),
      row('H -> S minus "B(s)"', "into a summing junction, subtracted, with a name"),
      row("# comment", "line comment (also //)"),
    ],
  },
];

export const GUIDE_SECTIONS: Record<DiagramCategory, GuideSection[]> = {
  flow: FLOW_SECTIONS,
  bpmn: BPMN_SECTIONS,
  org: ORG_SECTIONS,
  bar: BAR_SECTIONS,
  histogram: HISTOGRAM_SECTIONS,
  line: LINE_SECTIONS,
  pie: PIE_SECTIONS,
  scatter: SCATTER_SECTIONS,
  usecase: USECASE_SECTIONS,
  activity: ACTIVITY_SECTIONS,
  erd: ERD_SECTIONS,
  architecture: ARCHITECTURE_SECTIONS,
  class: CLASS_SECTIONS,
  dfd: DFD_SECTIONS,
  state: STATE_SECTIONS,
  tree: TREE_SECTIONS,
  sequence: SEQUENCE_SECTIONS,
  mind: MIND_SECTIONS,
  matrix: MATRIX_SECTIONS,
  venn: VENN_SECTIONS,
  fishbone: FISHBONE_SECTIONS,
  prisma: PRISMA_SECTIONS,
  quadrant: QUADRANT_SECTIONS,
  gantt: GANTT_SECTIONS,
  area: AREA_SECTIONS,
  waterfall: WATERFALL_SECTIONS,
  funnel: FUNNEL_SECTIONS,
  radar: RADAR_SECTIONS,
  timeline: TIMELINE_SECTIONS,
  sankey: SANKEY_SECTIONS,
  block: BLOCK_SECTIONS,
};

/** One line of orientation, shown at the top of the guide. */
export const GUIDE_INTRO: Record<DiagramCategory, string> = {
  flow: "Declare every box once, then wire them with arrows. Spacing and routing are worked out for you.",
  bpmn: "Declare a pool, its lanes, then the elements inside each lane. Wire them afterwards, across lanes if you need to.",
  org: "Declare every role once, then draw the reporting lines. Levels, spacing and the bus routing are worked out for you.",
  usecase: "Declare the actors, then the use cases inside a system block, then join them. Actors that start something stand on the left, actors that only answer stand on the right.",
  activity: "Declare a partition, then the nodes inside it, then wire them. Partitions are drawn as columns and the flow reads down the page.",
  erd: "Declare every entity with its attributes, then the relations between them. The crow's foot at each end says how many, and a relation runs from the key it names to the key it names.",
  architecture: "Place components roughly inside zones, then connect them. Generate aligns nearby rows and columns, spaces them apart and sizes the zones. Afterwards edit freely on the sheet.",
  class: "Declare every class with its attributes and operations, then the relations between them. A parent is drawn above what specialises it.",
  dfd: "Declare the external entities, processes and data stores, then name every flow with the data it carries. Every flow passes through a process.",
  state: "Declare the states, starting with the initial dot, then the transitions between them. A transition is labelled event [guard] / action.",
  tree: "Declare every box, then hang each one from its parent. Every box has one parent, and a leaf ends a path.",
  sequence: "Declare the participants across the top, then the messages in the order they are sent. The execution bars are read off the messages, so there is nothing to place.",
  histogram: "Write one bin per line, in order along the axis, with the count that falls in it. The bars touch because the bins do.",
  bar: "Write the readings one to a line, then any settings you want. Everything here is also a control in the Chart panel, and the two always agree.",
  line: "Name the readings along the axis, then one series per line you want drawn. Everything here is also a control in the Chart panel.",
  pie: "Write one slice per line. Shares are worked out for you, so the numbers can be counts rather than percentages.",
  scatter: "Write the points as (across, up) pairs, grouped into series. Everything here is also a control in the Chart panel.",
  mind: "Write the branches as an outline: a caption, and a block under it for whatever hangs off it. Most of a mind map is built on the sheet instead — this is the quick way to start one.",
  matrix: "Declare the columns, then each row and its cell values. Cells are text on purpose: an x, a number, a status or a sentence all work, and every one can be edited again on the sheet.",
  venn: "Name the sets, then say what falls in each region between them. A region is named by the sets it is in: A, AB, ABC.",
  fishbone: "The title is the effect, in the head. Each bone is a category of cause, and what is written inside it are the causes themselves.",
  gantt: "Name the unit, open a section, then list its tasks: each starts in a unit or after other tasks, and lasts a whole number of units.",
  quadrant: "Name the two axes and both ends of each, then caption the four quarters and plot any items at a share of each axis.",
  prisma: "Write the counts in the order the review moved through them. Each row is a step in the flow, a side box says what was dropped there, and the four phase bands are read off the rows themselves.",
  area: "Name the readings along the axis, then one series per band. Stacked bands pile up into the whole; overlapping ones each stand on zero.",
  waterfall: "Write the steps in order. A number is a change on the running total; `total` draws the total so far as a bar of its own.",
  funnel: "Write the stages from the widest to the narrowest, one per line. Each bar is as wide as its count.",
  radar: "Name three or more spokes, then one series per polygon. Every spoke shares one scale, so give the readings the same range.",
  timeline: "Write one event per line: its time, its caption, and a note if it needs one. Years drawn to scale need numbers; anything else is drawn in order.",
  sankey: "Write every flow as a source, an arrow, a target and how much. The nodes are made from the names, and each band is as wide as its flow.",
  block: "Declare the input, the junctions, the blocks, the takeoff points and the output, then wire the signals. Every signal into a junction carries plus or minus.",
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

export const RULES: Record<DiagramCategory, string[]> = {
  architecture: [
    'The file is one `architecture "Title" { ... }` block.',
    'Declare components with unique IDs. Optional `at x y` and `size width height` may follow the label in either order. `at` suggests a starting row or column; Generate may move it to leave space.',
    'Declare zones before their contents; they are independent outlined backdrops, not nested blocks. A component belongs to the smallest original zone containing its centre. With one zone, unplaced components belong to it too. The zone grows or, when unsized, fits its contents.',
    'Declare all nodes before their connections. `->` is a solid flow; `-.->` is a dashed event.',
    'Uploaded images belong to the saved sheet, not the source text.',
  ],
  mind: FIGURE_RULES("mind", [
    "The title is the idea in the middle; everything else hangs off it.",
    "A branch is a caption in quotes on its own line. Give it a `{ ... }` block for whatever hangs off it, nested as deep as you like.",
    "A colour and a shape may follow a branch's caption, in that order, and apply to that branch alone.",
  ]),
  matrix: FIGURE_RULES("matrix", [
    "Declare columns first with `column \"Name\"`; an optional second caption groups consecutive columns under one spanning heading.",
    "A compact row is `row \"Name\" \"cell 1\" \"cell 2\"`. It must not have more values than there are columns; omitted values are empty.",
    "When cells need colours, open a row block and write each as `cell \"anything\" \"#rrggbb\"`. The colour is optional and the value remains text.",
    "A row block may also contain `color \"#rrggbb\"` for the heading down the left.",
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
  gantt: FIGURE_RULES("gantt", [
    "Time is counted in whole units from 1 (week 1, week 2, …); `unit` only says what a unit is called.",
    "A task is `task ID \"Name\"`, then either the unit it starts in or `after` the IDs it waits for, then how many units it lasts. It may end with `done` and a percentage.",
    "A milestone is `milestone ID \"Name\"` then a unit or `after` IDs; it lasts nothing and takes no `done`.",
    "`section \"Name\"` lists every task after it under that section, until the next section.",
    "Every ID after `after` is a task or milestone in the chart, and following them never loops back.",
  ]),
  quadrant: FIGURE_RULES("quadrant", [
    "Write each axis as its name and then the words at its low and high ends: `x \"Effort\" \"Low\" \"High\"`. The low end of the up axis is at the bottom.",
    "A quarter is named by its corner: `top-left`, `top-right`, `bottom-left`, `bottom-right`. A quarter nobody names is left empty.",
    "An item is `item \"Name\" across up`, both shares of their axis from 0 at the low end to 100 at the high.",
  ]),
  prisma: FIGURE_RULES("prisma", [
    "The title is the name of the flow, written above it.",
    "A `band` names the phase every row after it stands in, until the next `band`. Consecutive rows naming the same band share one strip, so Screening may cover two rows.",
    "A step is `row \"Caption\" 955`, optionally followed by a `{ ... }` block of lines. Each line is `\"Caption\" 1200`.",
    "A `side` box follows the row it belongs to and says what left the flow there. It takes the same caption, total and block.",
    "Counts are written plainly and drawn as `(n = 955)`. Leave the number out to draw the caption on its own.",
  ]),
  class: [
    'The file is one `class "Title" { ... }` block.',
    "A classifier is `class`, `abstract`, `interface` or `enum`, then an ID and its name in quotes. Its block lists `attr` and `method` lines (an enum lists `value` lines); write each member in UML form, e.g. `attr \"- name : String\"`, `method \"+ total() : Decimal\"`.",
    "Visibility is the first character of a member: `+` public, `-` private, `#` protected, `~` package.",
    "Write a generalisation and a realisation child first: `inherit Cat -> Animal`, `implement Repo -> Store`. They carry no multiplicity.",
    "Write an aggregation and a composition whole first: `compose Order -> OrderLine`. The diamond is drawn on the whole.",
    "A bare `A -> B` is an association. Multiplicities are quoted on either side of the arrow and the relation's name follows the second class: `Customer \"1\" -> \"0..*\" Order \"places\"`.",
  ],
  dfd: [
    'The file is one `dfd "Title" { ... }` block, in Gane–Sarson notation.',
    "Name a process with a verb and a noun (`Validate Order`), an external entity and a data store with a noun.",
    "Every data flow has a process at one end at least. An entity never connects straight to another entity or to a store, and a store never connects straight to another store.",
    "Every process has at least one flow in and one flow out: none that only takes data in (a black hole) or only sends it out (a miracle).",
    "Name every flow with the data it carries: `CUSTOMER -> P1 \"Order details\"`. A caption in quotes names one flow; a chain takes captions in brackets.",
    "Processes are numbered 1, 2, 3 and stores coded D1, D2, D3 in the order written; give a process `\"1.1\"` or a store `\"D3\"` after its name to set it, as a level-1 diagram does. An entity carries no number.",
  ],
  state: [
    'The file is one `state "Title" { ... }` block.',
    "Start with one `initial` pseudostate. It leaves by exactly one transition and nothing transitions into it.",
    "A `final` state ends the machine: no transition leaves it.",
    "Label a transition `\"event [guard] / action\"`; any part may be left out, and a transition with no label fires when the state's work is done.",
    "Branch on guards at a `choice`: one transition in, one out per guard, e.g. `C1 -> PAID \"[approved]\"`.",
    "A `fork` takes one transition in and sends several out; a `join` takes several in and sends one out.",
    "A state's block lists `entry`, `do` and `exit` activities, each at most once, drawn in that order.",
  ],
  tree: [
    'The file is one `tree "Title" { ... }` block.',
    "Declare every box with `node` (has boxes under it) or `leaf` (ends a path), then hang each from its parent with `A -> B`.",
    "Every box has exactly one parent, the boxes never loop back, and nothing hangs from a leaf.",
    "Children are drawn left to right in the order their branches are written.",
    "A caption on a branch says what leads there: `OUTLOOK -> HUMIDITY \"sunny\"`.",
    "`A -.-> B` is a dashed cross link between two boxes the hierarchy has already placed.",
  ],
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
    "Either end may name the column it joins: `PASSENGER.id one -> many BOOKING.passenger_id`. Left out, the primary key is paired with the foreign key named after it.",
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
  area: CHART_RULES("area", "a band through the readings"),
  waterfall: [
    'The file is one `waterfall "Title" { ... }` block. Nothing may sit outside it.',
    "A step is `Name 40` (a change, negative for a fall), one per line, in the order the total moves through them.",
    "`Name total` draws the running total so far; it takes no number. `Name 140 start` sets the running total to that value and draws it from zero.",
    "A waterfall is one run of steps: it takes no `series` or `categories` lines.",
    "Settings are written as `name value`, in any order, before or after the steps.",
    "Do not invent settings. Every one the language has is listed above.",
  ],
  funnel: [
    'The file is one `funnel "Title" { ... }` block. Nothing may sit outside it.',
    "A stage is `Name 1200`, one per line, from the first stage to the last.",
    "A funnel is one run of stages: it takes no `series`, `categories`, `bars`, `layout` or `grid` lines.",
    "Settings are written as `name value`, in any order.",
    "Do not invent settings. Every one the language has is listed above.",
  ],
  radar: [
    'The file is one `radar "Title" { ... }` block. Nothing may sit outside it.',
    "Name the spokes with `categories`, three or more, then write each thing compared as `series \"Name\" 8 6 7`, one value per spoke.",
    "Every spoke runs on one scale, so the readings should share a unit; `range 0 10` pins it.",
    "Settings are written as `name value`, in any order.",
    "Do not invent settings. Every one the language has is listed above.",
  ],
  timeline: FIGURE_RULES("timeline", [
    "An event is `event` then its time, then its caption in quotes, then optionally a note in quotes on the same line.",
    "A time written as a plain number (a year, a day) can be drawn to scale. A time in quotes (\"Mar 2024\", \"Phase 2\") is drawn in sequence, and so is the whole timeline if any event has one.",
    "Events are drawn in the order they are written; write them in time order.",
  ]),
  sankey: FIGURE_RULES("sankey", [
    "A flow is `\"Source\" -> \"Target\" 120`: two names and a value above 0. A name with no space needs no quotes.",
    "Nodes are made from the names in the order they are first written; `node \"Name\" \"#rrggbb\"` pins one's colour.",
    "Flows run one way: no flow may lead back round to where it started, and a node never flows into itself.",
    "Write a loss as a flow of its own (`\"Power\" -> \"Losses\" 70`); nothing is added to balance a node.",
  ]),
  block: [
    'The file is one `block "Title" { ... }` block.',
    "Declare every element before the signals: `input`, `output`, `block`, `sum`, `point` or `node`, then an ID, then a caption in quotes (a `sum` and a `point` need none).",
    "A signal is `A -> B`; a caption in quotes after it names the signal or gives a branch's gain.",
    "Every signal into a `sum` ends with `plus` or `minus`, and only those signals do. A summing junction takes two or more signals in and sends one out.",
    "A `point` takes one signal in and sends it out on two or more lines. Nothing flows into an `input` or out of an `output`.",
    "The forward path is drawn left to right; a feedback loop runs back under it to the junction it returns to.",
  ],
  bar: CHART_RULES("bar", "a bar per reading"),
  histogram: [
    'The file is one `histogram "Title" { ... }` block. Nothing may sit outside it.',
    "A bin is its range in quotes and the count in it: `\"40-50\" 2`, one per line, in order along the axis.",
    "Give every bin the same width and leave no gaps in the range; write an empty bin with a count of 0.",
    "A histogram has one distribution: it takes no `series`, `categories`, `bars` or `layout` lines.",
    "Settings are written as `name value`, in any order, before or after the bins.",
    "Do not invent settings. Every one the language has is listed above.",
  ],
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

export const KEYWORD: Record<DiagramCategory, string> = {
  flow: "flow",
  bpmn: "bpmn",
  org: "org",
  usecase: "usecase",
  activity: "activity",
  erd: "erd",
  architecture: "architecture",
  class: "class",
  dfd: "dfd",
  state: "state",
  tree: "tree",
  sequence: "sequence",
  bar: "bar",
  histogram: "histogram",
  line: "line",
  pie: "pie",
  scatter: "scatter",
  mind: "mind",
  matrix: "matrix",
  venn: "venn",
  fishbone: "fishbone",
  prisma: "prisma",
  quadrant: "quadrant",
  gantt: "gantt",
  area: "area",
  waterfall: "waterfall",
  funnel: "funnel",
  radar: "radar",
  timeline: "timeline",
  sankey: "sankey",
  block: "block",
};

export const EXAMPLE: Record<DiagramCategory, string> = {
  flow: FLOWCHART_TEMPLATE,
  bpmn: BPMN_TEMPLATE,
  org: ORG_TEMPLATE,
  usecase: USECASE_TEMPLATE,
  activity: ACTIVITY_TEMPLATE,
  erd: ERD_TEMPLATE,
  architecture: ARCHITECTURE_TEMPLATES[0].source,
  class: CLASS_TEMPLATE,
  dfd: DFD_TEMPLATE,
  state: STATE_TEMPLATE,
  tree: TREE_TEMPLATE,
  sequence: SEQUENCE_TEMPLATE,
  bar: BAR_TEMPLATE,
  histogram: HISTOGRAM_TEMPLATE,
  line: LINE_TEMPLATE,
  pie: PIE_TEMPLATE,
  scatter: SCATTER_TEMPLATE,
  mind: MIND_TEMPLATE,
  matrix: MATRIX_TEMPLATE,
  venn: VENN_TEMPLATE,
  fishbone: FISHBONE_TEMPLATE,
  prisma: PRISMA_TEMPLATE,
  quadrant: QUADRANT_TEMPLATE,
  gantt: GANTT_TEMPLATE,
  area: AREA_TEMPLATE,
  waterfall: WATERFALL_TEMPLATE,
  funnel: FUNNEL_TEMPLATE,
  radar: RADAR_TEMPLATE,
  timeline: TIMELINE_TEMPLATE,
  sankey: SANKEY_TEMPLATE,
  block: BLOCK_TEMPLATE,
};

export const NOTATION_NAME: Record<DiagramCategory, string> = {
  flow: "flowchart",
  bpmn: "BPMN 2.0 diagram",
  org: "organisational chart",
  usecase: "UML use case diagram",
  activity: "UML activity diagram",
  erd: "entity relationship diagram",
  architecture: "software architecture diagram",
  class: "UML class diagram",
  dfd: "data flow diagram (Gane–Sarson)",
  state: "UML state machine diagram",
  tree: "tree diagram",
  sequence: "UML sequence diagram",
  bar: "bar chart",
  histogram: "histogram",
  line: "line chart",
  pie: "pie chart",
  scatter: "scatter plot",
  mind: "mind map",
  matrix: "matrix table",
  venn: "Venn diagram",
  fishbone: "fishbone diagram",
  prisma: "PRISMA 2020 flow diagram",
  quadrant: "2×2 quadrant",
  gantt: "Gantt chart",
  area: "area chart",
  waterfall: "waterfall chart",
  funnel: "funnel chart",
  radar: "radar chart",
  timeline: "timeline",
  sankey: "Sankey diagram",
  block: "block diagram (control system or signal flow)",
};

/**
 * Everything an assistant has to know about one notation, in plain text: every
 * keyword, every rule, and a worked example. What it is then *asked for* is
 * the caller's business — the tutorial prompt asks for a fenced block, the
 * chatbot asks for a JSON object — so both compose this and part company after
 * it, and neither describes the language twice.
 */
export function briefingFor(category: DiagramCategory): string {
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
    "SYNTAX",
    sections,
    "",
    "RULES",
    RULES[category].map((rule) => `- ${rule}`).join("\n"),
    "",
    "WORKED EXAMPLE",
    EXAMPLE[category].trimEnd(),
  ].join("\n");
}

/**
 * The whole tutorial as one block of plain text, written as a briefing for an
 * assistant, ending with the output contract so what comes back can be pasted
 * straight into the editor.
 */
export function promptFor(category: DiagramCategory): string {
  return [
    `You are writing Tingraph source. Tingraph is a small text language that draws a ${NOTATION_NAME[category]}. Answer with Tingraph source only.`,
    "",
    briefingFor(category),
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
