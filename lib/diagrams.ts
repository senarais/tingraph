import { DiagramCategory } from "@/lib/types";

/**
 * The notations the site offers, and the ones it has promised. The landing page
 * shows the ready ones, the catalogue at /build shows every entry, and the hero
 * demo types the samples out. One list so the three can never disagree.
 *
 * Every `sample` is real source: `npm run self-check` parses each of them.
 */

export type DiagramFamily = "Process" | "Structure" | "Data";

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
];

/** Announced, not drawable yet. The catalogue greys these out. */
export const PLANNED_DIAGRAMS: DiagramKind[] = [
  {
    id: "sequence",
    name: "Sequence diagram",
    family: "Process",
    summary: "Lifelines with the messages that pass between them, in order.",
    parts: ["Lifelines", "Messages", "Activation bars"],
    accent: "slate",
  },
  {
    id: "erd",
    name: "Entity relationship",
    family: "Structure",
    summary: "Entities, their attributes, and the cardinality between them.",
    parts: ["Entities", "Attributes", "Cardinality"],
    accent: "slate",
  },
  {
    id: "state",
    name: "State machine",
    family: "Process",
    summary: "States and the events that move a thing from one to the next.",
    parts: ["States", "Transitions", "Initial and final"],
    accent: "slate",
  },
  {
    id: "mindmap",
    name: "Mind map",
    family: "Structure",
    summary: "One central idea and the branches that hang off it.",
    parts: ["Central node", "Branches", "Leaves"],
    accent: "slate",
  },
];

export const ALL_DIAGRAMS: DiagramKind[] = [
  ...READY_DIAGRAMS,
  ...PLANNED_DIAGRAMS,
];

/** stroke and wash for one preview, matching the editor's formal inks */
export const ACCENTS: Record<Accent, { stroke: string; wash: string }> = {
  mono: { stroke: "#1e1e1e", wash: "#e5e7eb" },
  navy: { stroke: "#1e3a8a", wash: "#dce4f6" },
  oxblood: { stroke: "#991b1b", wash: "#f6dede" },
  forest: { stroke: "#065f46", wash: "#d8ece3" },
  slate: { stroke: "#6b7280", wash: "#e9eaec" },
};
