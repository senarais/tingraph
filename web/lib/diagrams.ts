import { DiagramCategory } from "@/lib/types";
import { ARCHITECTURE_TEMPLATES, STARTERS } from "@/lib/templates";

/**
 * The notations the site offers, and the ones it has promised. The landing page
 * shows the ready ones, the catalogue at /editor shows every entry, and the hero
 * demo types the samples out. One list so the three can never disagree.
 *
 * Every `sample` is real source: `npm run self-check` parses each of them.
 */

export type DiagramFamily = "Process" | "Structure" | "Data" | "Thinking";

/** Which formal ink the preview is drawn in. Named in `lib/ink.ts`. */
export type Accent = "mono" | "navy" | "oxblood" | "forest" | "slate";

export interface DiagramKind {
  /** the DSL keyword when it is ready, otherwise a plain slug */
  id: string;
  name: string;
  family: DiagramFamily;
  /** the keyword a drawing opens with, absent while the notation is planned */
  keyword?: DiagramCategory;
  summary: string;
  /** what the notation puts on the sheet, listed on the catalogue card */
  parts: string[];
  accent: Accent;
  sample?: string;
  /**
   * Set on a common drawing that is a notation started a particular way: the
   * `STARTERS` entry it opens on. Its `keyword` is the notation it is drawn in.
   */
  starter?: string;
}

export const FLOW_SAMPLE = `flow "Data Validation" {
  start S1 "Start"
  io I1 "Read input"
  process P1 "Run checks"
  decision D1 "Valid?"
  end E1 "Save record"

  S1 -> I1 -> P1 -> D1
  D1 [Yes] -> E1
  D1 [No] -> P1
}
`;

export const BPMN_SAMPLE = `bpmn "Vacation Request" {
  pool P1 "Request" {
    lane L1 "Employee" {
      start S1 "Submit"
      task A1 "Fill vacation form"
    }
    lane L2 "Manager" {
      gw-ex G1 "Approved?"
      end E1 "Done"
    }
  }

  S1 -> A1 -> G1
  G1 [Yes] -> E1
}
`;

export const ORG_SAMPLE = `org "Faculty of Psychology" {
  role DEAN "DEAN" "Dr. Marion Hale"
  role VD1 "VICE DEAN I" "Priya Raman, Ph.D"
  role VD2 "VICE DEAN II" "Dr. Elena Sorbo"
  role SENATE "FACULTY SENATE"

  DEAN -> VD1
  DEAN -> VD2
  DEAN -.-> SENATE
}
`;

export const USECASE_SAMPLE = `usecase "Bank ATM" {
  actor CUST "Customer"
  actor BANK "Bank" right

  system ATM "Bank ATM" {
    usecase U1 "Check Balances"
    usecase U2 "Withdraw Cash"
    usecase U3 "Transfer Funds"
  }

  CUST -> U1
  CUST -> U2
  CUST -> U3
  U2 -> BANK
  U3 -> BANK
  include U2 -> U1
}
`;

export const ACTIVITY_SAMPLE = `activity "Order Payment" {
  lane U "User" {
    initial S1
    action A1 "Log in"
    decision D1
    action A3 "Enter the password"
  }
  lane S "System" {
    action A2 "View unpaid orders"
    action A4 "Confirm payment"
    final E1
  }

  S1 -> A1 -> A2 -> D1
  D1 [confirm] -> A3 -> A4 -> E1
  D1 [cancel] -> E1
}
`;

export const SEQUENCE_SAMPLE = `sequence "Shopping Cart" {
  actor CUST "Customer"
  object CART ":Cart"
  object ORDER ":Order"

  numbers on

  CUST -> CART "«create»"
  CART -> ORDER "getTotal()"
  ORDER -> ORDER "calculateTotal()"
  ORDER --> CART "totalPrice"
}
`;

export const ERD_SAMPLE = `erd "Airline Booking" {
  entity PASSENGER "passengers" {
    pk "id" "bigint"
    "first_name" "varchar(50)"
    "passport_number" "varchar(20)" unique
  }

  entity BOOKING "booking" {
    pk "booking_id" "bigint"
    fk "passenger_id" "bigint"
    "status" "varchar(20)"
  }

  weak BAGGAGE "baggage" {
    pk "id" "bigint"
    fk "booking_id" "bigint"
  }

  PASSENGER one -> many BOOKING "makes"
  BOOKING one -.-> many BAGGAGE "checks in"
}
`;

export const BAR_SAMPLE = `bar "Favourite Fruit" {
  x "Favourite fruit"
  y "Number of students"

  Apples 9
  Bananas 16
  Oranges 10
  Grapes 7
}
`;

export const LINE_SAMPLE = `line "Wildlife Population" {
  legend bottom
  categories 2017 2018 2019 2020
  series "Bears" 8 55 92 116
  series "Dolphins" 150 77 34 12
}
`;

export const PIE_SAMPLE = `pie "Cookie Market Share" {
  percent on

  "Mocha Marvels" 32.9
  "Caramel Swirls" 24.4
  "PB Bliss" 19.0
  "Choco Chippers" 23.7
}
`;

export const SCATTER_SAMPLE = `scatter "Local Index by Year" {
  x "Year"
  y "Local index"
  trend on

  (1900, 10) (1903, 15) (1906, 4) (1909, 14)
  (1912, 30) (1915, 55) (1918, 69) (1920, 92)
}
`;

export const MIND_SAMPLE = `mind "Web Design" {
  "Visual Design" {
    "Colour Scheme"
    "Typography"
  }
  "User Experience" {
    "Wireframing"
    "User Research"
  }
  "Development" {
    "Responsive Design"
  }
}
`;

export const MATRIX_SAMPLE = `matrix "Team skill matrix" {
  corner "Name / Skill"
  column "3-GEN" "GENBA KAIZEN"
  column "3-MU" "GENBA KAIZEN"
  column "7 Wastes" "GENBA KAIZEN"
  column "KAIZEN" "GENBA KAIZEN"
  column "Sort" "5S"
  column "Set in order" "5S"
  column "Shine" "5S"
  column "Standardise" "5S"
  column "Sustain" "5S"

  row "Amir" "x" "" "x" "" "1" "" "" "" ""
  row "Budi" "" "x" "" "x" "2" "" "" "" ""
  row "Hasan" "x" "x" "" "" "" "1" "" "" ""
  row "Tuti" "" "" "x" "" "" "" "x" "" ""

  header vertical
  header-height 112
  row-header 140
  size 900 540
}
`;

export const VENN_SAMPLE = `venn "Three sets" {
  set A "Set 1"
  set B "Set 2"
  set C "Set 3"

  A "126"
  B "129"
  C "128"
  AB "32"
  ABC "9"
}
`;

export const PRISMA_SAMPLE = `prisma "PRISMA 2020 flow diagram" {
  band "Identification"
  row "Records identified from" 1423 {
    "Databases" 1200
    "Registers" 223
  }
  side "Records removed before screening" 468 {
    "Duplicate records removed" 468
  }

  band "Screening"
  row "Records screened" 955
  side "Records excluded" 812
  row "Reports sought for retrieval" 143
  side "Reports not retrieved" 20

  band "Eligibility"
  row "Reports assessed for eligibility" 123
  side "Reports excluded" 110 {
    "Reason 1" 50
    "Reason 2" 60
  }

  band "Included"
  row "Studies included in review" 13
}
`;

export const FISHBONE_SAMPLE = `fishbone "The part is the wrong size" {
  bone "Material" {
    "Wrong specification"
    "Poor storage"
  }
  bone "Method" {
    "Wrong procedure"
  }
  bone "Machine" {
    "Machine malfunction"
  }
  bone "People" {
    "Employee mistake"
  }
}
`;

export const GANTT_SAMPLE = `gantt "Website Launch" {
  unit "Week"
  today 3

  section "Design"
  task T1 "Wireframes" 1 2 done 100
  task T2 "Visual design" after T1 2 done 50
  section "Build"
  task T3 "Frontend" after T2 3
  task T4 "Backend" 3 4
  milestone M1 "Launch" after T3 T4
}
`;

export const QUADRANT_SAMPLE = `quadrant "Eisenhower Matrix" {
  x "Urgency" "Urgent" "Not urgent"
  y "Importance" "Not important" "Important"

  top-left "Do"
  top-right "Schedule"
  bottom-left "Delegate"
  bottom-right "Eliminate"
}
`;

export const HISTOGRAM_SAMPLE = `histogram "Commute Time" {
  x "Minutes"
  y "Employees"

  "0-10" 4
  "10-20" 12
  "20-30" 9
  "30-40" 5
  "40-50" 2
}
`;

export const CLASS_SAMPLE = `class "Shop" {
  class CUST "Customer" {
    attr "- name : String"
    method "+ placeOrder() : Order"
  }
  class ORDER "Order" {
    attr "- total : Decimal"
  }
  abstract PAY "Payment"
  class CARD "CardPayment"

  CUST "1" -> "0..*" ORDER "places"
  ORDER "1" -> "1" PAY "settled by"
  inherit CARD -> PAY
}
`;

export const DFD_SAMPLE = `dfd "Library - Level 0" {
  entity MEMBER "Member"
  process P1 "Lend Book"
  process P2 "Return Book"
  store LOANS "Loans"

  MEMBER -> P1 "Loan request"
  P1 -> LOANS "Loan record"
  P1 -> MEMBER "Due date"
  MEMBER -> P2 "Returned book"
  LOANS -> P2 "Open loan"
  P2 -> MEMBER "Receipt"
}
`;

export const STATE_SAMPLE = `state "Door" {
  initial S0
  state CLOSED "Closed"
  state OPEN "Open" {
    entry "lightOn()"
  }
  state LOCKED "Locked"

  S0 -> CLOSED
  CLOSED -> OPEN "open"
  OPEN -> CLOSED "close"
  CLOSED -> LOCKED "lock [key ok]"
  LOCKED -> CLOSED "unlock"
}
`;

export const TREE_SAMPLE = `tree "Build a Website" {
  node W "Website"
  node D "Design"
  node B "Build"
  leaf D1 "Wireframes"
  leaf D2 "Visual style"
  leaf B1 "Frontend"
  leaf B2 "Backend"
  leaf L "Launch"

  W -> D
  W -> B
  W -> L
  D -> D1
  D -> D2
  B -> B1
  B -> B2
}
`;

export const READY_DIAGRAMS: DiagramKind[] = [
  {
    id: "flow",
    name: "Flowchart",
    family: "Process",
    keyword: "flow",
    summary:
      "Terminators, steps, decisions and input/output boxes, wired with arrows and branch captions.",
    parts: ["Start and end", "Process step", "Decision", "Input / output"],
    accent: "navy",
    sample: FLOW_SAMPLE,
  },
  {
    id: "bpmn",
    name: "BPMN 2.0",
    family: "Process",
    keyword: "bpmn",
    summary:
      "Pools and lanes with the events, tasks, gateways and data objects drawn to BPMN 2.0 shape conventions.",
    parts: ["Pools and lanes", "Events", "Tasks", "Gateways", "Data objects"],
    accent: "forest",
    sample: BPMN_SAMPLE,
  },
  {
    id: "org",
    name: "Org chart",
    family: "Structure",
    keyword: "org",
    summary:
      "Role bands over the name of the person holding them, sub-role units, and dashed advisory ties.",
    parts: ["Role band", "Name line", "Sub-role units", "Advisory tie"],
    accent: "oxblood",
    sample: ORG_SAMPLE,
  },
  {
    id: "usecase",
    name: "Use case",
    family: "Process",
    keyword: "usecase",
    summary:
      "Actors round a system boundary and the goals they want from it, joined by associations, includes, extends and generalisations.",
    parts: ["Actors", "Use cases", "System boundary", "Include and extend"],
    accent: "navy",
    sample: USECASE_SAMPLE,
  },
  {
    id: "activity",
    name: "Activity diagram",
    family: "Process",
    keyword: "activity",
    summary:
      "UML control flow down the page through swimlane partitions, with decisions, merges, forks, joins and object nodes.",
    parts: ["Partitions", "Actions", "Decisions", "Forks and joins"],
    accent: "slate",
    sample: ACTIVITY_SAMPLE,
  },
  {
    id: "sequence",
    name: "Sequence diagram",
    family: "Process",
    keyword: "sequence",
    summary:
      "Lifelines with the messages that pass between them in order, execution bars read off the calls, and combined fragments round the runs that need one.",
    parts: ["Lifelines", "Messages", "Execution bars", "alt, opt and loop"],
    accent: "oxblood",
    sample: SEQUENCE_SAMPLE,
  },
  {
    id: "erd",
    name: "Entity relationship",
    family: "Data",
    keyword: "erd",
    summary:
      "Entities with their attributes, keys marked in a gutter of their own, and crow's-foot relations saying how many of each.",
    parts: ["Entities", "Attributes", "Primary and foreign keys", "Crow's feet"],
    accent: "forest",
    sample: ERD_SAMPLE,
  },
  {
    id: "architecture",
    name: "Architecture diagram",
    family: "Structure",
    keyword: "architecture",
    summary: "Place systems, services, data stores and regions freely; connect them, label flows and replace symbols with your own logos.",
    parts: ["Zones", "Services & data", "Flows & events", "Custom images"],
    accent: "navy",
    sample: ARCHITECTURE_TEMPLATES[0].source,
  },
  {
    id: "gantt",
    name: "Gantt chart",
    family: "Process",
    keyword: "gantt",
    summary:
      "Tasks in sections across numbered weeks or months, with how long each lasts, what each waits for, how much is done and the milestones on the way.",
    parts: ["Sections", "Dependencies", "Progress", "Milestones & today"],
    accent: "oxblood",
    sample: GANTT_SAMPLE,
  },
  {
    id: "quadrant",
    name: "2×2 quadrant",
    family: "Thinking",
    keyword: "quadrant",
    summary:
      "Two axes crossed at their middles, each named with its low and high end, four captioned quarters and items plotted by share of each axis.",
    parts: ["Named axes", "Four quarters", "Plotted items", "Drag to place"],
    accent: "forest",
    sample: QUADRANT_SAMPLE,
  },
  {
    id: "histogram",
    name: "Histogram",
    family: "Data",
    keyword: "histogram",
    summary:
      "How one measured quantity is distributed: counts in touching bins of equal width, on one outlined distribution.",
    parts: ["Touching bins", "Counts", "Axis titles", "Value range"],
    accent: "navy",
    sample: HISTOGRAM_SAMPLE,
  },
  {
    id: "class",
    name: "Class diagram",
    family: "Structure",
    keyword: "class",
    summary:
      "UML classes with their attributes and operations, joined by association, generalisation, realisation, aggregation, composition and dependency.",
    parts: ["Three compartments", "Interfaces & enums", "Six relations", "Multiplicity"],
    accent: "navy",
    sample: CLASS_SAMPLE,
  },
  {
    id: "dfd",
    name: "Data flow diagram",
    family: "Process",
    keyword: "dfd",
    summary:
      "Gane–Sarson processes, external entities and data stores joined by named data flows, from a context diagram down to level 1.",
    parts: ["Numbered process", "External entity", "Data store", "Named flows"],
    accent: "forest",
    sample: DFD_SAMPLE,
  },
  {
    id: "state",
    name: "State machine",
    family: "Process",
    keyword: "state",
    summary:
      "UML states and the transitions between them, labelled event [guard] / action, with entry, do and exit activities.",
    parts: ["Initial and final", "States & activities", "Choice", "Fork and join"],
    accent: "oxblood",
    sample: STATE_SAMPLE,
  },
  {
    id: "tree",
    name: "Tree diagram",
    family: "Thinking",
    keyword: "tree",
    summary:
      "A hierarchy hung from one root on square rails: a decision tree, a work breakdown structure or any hierarchy.",
    parts: ["Branches", "Leaves", "Captioned paths", "Cross links"],
    accent: "slate",
    sample: TREE_SAMPLE,
  },
  {
    id: "bar",
    name: "Bar chart",
    family: "Data",
    keyword: "bar",
    summary:
      "Readings as bars, upright or on their side, grouped or stacked, with the whole look set from the sheet or from the source.",
    parts: ["Readings", "Series", "Axes and key", "Grouped or stacked"],
    accent: "navy",
    sample: BAR_SAMPLE,
  },
  {
    id: "line",
    name: "Line chart",
    family: "Data",
    keyword: "line",
    summary:
      "One run per series over a shared axis, straight or curved, with dots at the readings and a wash underneath.",
    parts: ["Readings", "Series", "Markers", "Wash under the line"],
    accent: "forest",
    sample: LINE_SAMPLE,
  },
  {
    id: "pie",
    name: "Pie chart",
    family: "Data",
    keyword: "pie",
    summary:
      "Shares of one whole, named on the sheet or in a key, with a hole in the middle when a ring reads better.",
    parts: ["Slices", "Shares or values", "Donut hole", "Key"],
    accent: "oxblood",
    sample: PIE_SAMPLE,
  },
  {
    id: "scatter",
    name: "Scatter plot",
    family: "Data",
    keyword: "scatter",
    summary:
      "Points against two measured axes, grouped into series, with a line of best fit through the cloud.",
    parts: ["Points", "Series", "Trend line", "Named points"],
    accent: "slate",
    sample: SCATTER_SAMPLE,
  },
  {
    id: "mind",
    name: "Mind map",
    family: "Thinking",
    keyword: "mind",
    summary:
      "One idea with everything that hangs off it, arranged around it, along two sides or downward — and built branch by branch on the sheet.",
    parts: ["Central idea", "Branches", "Seven shapes", "Pictures in place of shapes"],
    accent: "navy",
    sample: MIND_SAMPLE,
  },
  {
    id: "matrix",
    name: "Matrix table",
    family: "Thinking",
    keyword: "matrix",
    summary:
      "Rows and columns compared in one editable grid, with grouped headings, free-form cells and colour when meaning needs it.",
    parts: ["Grouped columns", "Free-form cells", "Horizontal or vertical headings", "Four styles"],
    accent: "oxblood",
    sample: MATRIX_SAMPLE,
  },
  {
    id: "venn",
    name: "Venn diagram",
    family: "Thinking",
    keyword: "venn",
    summary:
      "Two or three sets and everything that falls in the regions between them, with the overlap dragged to where it reads best.",
    parts: ["Two or three rings", "Every region", "Adjustable overlap", "Tinted or outlined"],
    accent: "forest",
    sample: VENN_SAMPLE,
  },
  {
    id: "fishbone",
    name: "Fishbone",
    family: "Thinking",
    keyword: "fishbone",
    summary:
      "One effect at the head and the categories of cause that lead to it, with the causes behind each cause nested under it.",
    parts: ["The effect", "Bones", "Causes", "Causes behind causes"],
    accent: "mono",
    sample: FISHBONE_SAMPLE,
  },
  {
    id: "prisma",
    name: "PRISMA flow",
    family: "Process",
    keyword: "prisma",
    summary:
      "The record counts a systematic review reports from identification through screening and eligibility to the studies it included, with what left the flow at each step.",
    parts: ["Four phases", "Records and exclusions", "Counts", "PRISMA 2020 flow"],
    accent: "navy",
    sample: PRISMA_SAMPLE,
  },
];

/** What a starter's card says, beside the source `STARTERS` holds for it. */
const STARTER_CARDS: Record<string, Omit<DiagramKind, "id" | "keyword" | "sample" | "starter">> = {
  "system-context": {
    name: "System context diagram",
    family: "Structure",
    summary: "C4 level 1: the system in the middle, the people who use it and the systems it depends on around it.",
    parts: ["People", "Your system", "External systems", "Relationships"],
    accent: "navy",
  },
  "container": {
    name: "C4 container diagram",
    family: "Structure",
    summary: "C4 level 2: the apps, services and data stores inside one system boundary, and how they talk.",
    parts: ["System boundary", "Containers", "Data stores", "Protocols"],
    accent: "navy",
  },
  "component": {
    name: "Component diagram",
    family: "Structure",
    summary: "The components inside one service, with the stores and systems they reach outside it.",
    parts: ["Container boundary", "Components", "Dependencies", "Outside systems"],
    accent: "slate",
  },
  "deployment": {
    name: "Deployment diagram",
    family: "Structure",
    summary: "Where the software runs: devices, regions, clusters and managed services, with the traffic between them.",
    parts: ["Nodes and regions", "Deployed services", "Managed stores", "Traffic"],
    accent: "slate",
  },
  "swot": {
    name: "SWOT analysis",
    family: "Thinking",
    summary: "Strengths and weaknesses inside, opportunities and threats outside, in one two-by-two table.",
    parts: ["Helpful / harmful", "Internal / external", "Four quarters", "Free text"],
    accent: "forest",
  },
  "raci": {
    name: "RACI matrix",
    family: "Thinking",
    summary: "Who is responsible, accountable, consulted and informed for each task, one row per task.",
    parts: ["Tasks", "Roles", "R, A, C, I", "Headed columns"],
    accent: "oxblood",
  },
  "decision-matrix": {
    name: "Decision matrix",
    family: "Thinking",
    summary: "Options scored against weighted criteria, with the weighted total that ranks them.",
    parts: ["Options", "Weighted criteria", "Scores", "Totals"],
    accent: "oxblood",
  },
  "heatmap": {
    name: "Heatmap",
    family: "Data",
    summary: "A grid of values shaded by size, so the busy cells stand out at a glance.",
    parts: ["Rows and columns", "Values", "Cell shading", "Heatmap style"],
    accent: "oxblood",
  },
};

/**
 * Common drawings that are a notation started a particular way: a card of
 * their own, a starter source, and the notation's editor. They are not
 * notations, so they stay out of `READY_DIAGRAMS` and every count of those.
 */
export const STARTER_DIAGRAMS: DiagramKind[] = STARTERS.map((starter) => ({
  ...STARTER_CARDS[starter.id],
  id: starter.id,
  keyword: starter.category,
  sample: starter.source,
  starter: starter.id,
}));

/** Announced, not drawable yet. The catalogue greys these out. */
export const PLANNED_DIAGRAMS: DiagramKind[] = [];

export const ALL_DIAGRAMS: DiagramKind[] = [
  ...READY_DIAGRAMS,
  ...STARTER_DIAGRAMS,
  ...PLANNED_DIAGRAMS,
];

/**
 * The three the landing page types out. Three on purpose: the hero demo shows
 * one notation at a time and cycles, and a row of tabs that keeps growing
 * would wrap and stop being a hero. One from each family.
 */
export const HERO_DIAGRAMS: DiagramKind[] = ["bpmn", "flow", "line"]
  .map((id) => READY_DIAGRAMS.find((kind) => kind.id === id))
  .filter((kind): kind is DiagramKind => Boolean(kind));

/**
 * How many the landing page puts on cards before sending the reader to the
 * catalogue. The order of `READY_DIAGRAMS` is the curation: whatever is first
 * is what a first-time reader is shown.
 */
export const FEATURED_COUNT = 6;

export const FEATURED_DIAGRAMS: DiagramKind[] = READY_DIAGRAMS.slice(
  0,
  FEATURED_COUNT,
);

/** Every family that has something in it, for the catalogue's own filters. */
export const FAMILIES: DiagramFamily[] = [
  ...new Set(ALL_DIAGRAMS.map((kind) => kind.family)),
];

/** stroke and wash for one preview, matching the editor's formal inks */
export const ACCENTS: Record<Accent, { stroke: string; wash: string }> = {
  mono: { stroke: "#1e1e1e", wash: "#e5e7eb" },
  navy: { stroke: "#1e3a8a", wash: "#dce4f6" },
  oxblood: { stroke: "#991b1b", wash: "#f6dede" },
  forest: { stroke: "#065f46", wash: "#d8ece3" },
  slate: { stroke: "#6b7280", wash: "#e9eaec" },
};
