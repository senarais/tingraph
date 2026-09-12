import { DiagramCategory } from "@/lib/types";

export const FLOWCHART_TEMPLATE = `flow "Chart Title" {
  start S1 "Start Process"
  io I1 "Read Input Data"
  process P1 "Execute Algorithm"
  decision D1 "Is Valid?"
  end E1 "Finish"

  S1 -> I1 -> P1 -> D1
  D1 [Yes] -> E1
  D1 [No] -> P1
}
`;

export const BPMN_TEMPLATE = `bpmn "Vacation Request" {
  pool P1 "Request" {
    lane L1 "Employee" {
      start S1 "Submit request"
      task A1 "Fill vacation form"
      send-task A2 "Send to manager"
    }
    lane L2 "Manager" {
      gw-ex G1 "Approved?"
      end E1 "Done"
    }
    lane L3 "HR" {
      send-task A3 "Record leave"
      data D1 "Request log"
      end E2 "Archived"
    }
  }

  S1 -> A1 -> A2 -> G1
  G1 [Yes] -> A3 -> E2
  G1 [No] -> E1
  A3 -.-> D1
}
`;

export const ORG_TEMPLATE = `org "FACULTY OF PSYCHOLOGY ORGANISATIONAL CHART" {
  role DEAN "DEAN" "Dr. Marion Hale"
  role SENATE "FACULTY SENATE"

  role VD1 "VICE DEAN I" "Priya Raman, Ph.D"
  role VD2 "VICE DEAN II" "Dr. Elena Sorbo, M.Ed"
  role VD3 "VICE DEAN III" "Tomas Weller, Ph.D"

  role LABS "HEAD OF LABORATORIES" {
    unit "Psychodiagnostics Lab" "Ines Fabri, M.Sc"
    unit "Computing Lab" "Karel Sandvik, M.Sc"
    unit "Experimental and Media Lab" "Ada Moreau, M.Sc"
  }
  role UG "HEAD OF UNDERGRADUATE PROGRAMME" "Nadia Brenner, M.Sc"
  role PG "HEAD OF MASTER PROGRAMME" "Dr. Owen Castellan"
  role QA "QUALITY ASSURANCE CHAIR" "Sofia Lindqvist, M.Sc"

  role SERVICES "SERVICES COORDINATOR" "Rafael Duarte, M.A"
  role QA1 "QA TEAM, UNDERGRADUATE" "Hana Oyelaan, M.Sc"
  role QA2 "QA TEAM, MASTER" "Iris Kovak, M.Sc"

  DEAN -> VD1
  DEAN -> VD2
  DEAN -> VD3
  DEAN -> LABS
  DEAN -> UG
  DEAN -> PG
  DEAN -> QA
  UG -> SERVICES
  QA -> QA1
  QA -> QA2
  DEAN -.-> SENATE
}
`;

export const BAR_TEMPLATE = `bar "Favourite Fruit" {
  x "Favourite fruit"
  y "Number of students"

  Apples 9
  Bananas 16
  Oranges 10
  Grapes 7
}
`;

export const LINE_TEMPLATE = `line "Wildlife Population" {
  y "Animals counted"
  legend bottom

  categories 2017 2018 2019 2020 2021 2022
  series "Bears" 8 55 92 116 137 184
  series "Dolphins" 150 77 34 12 5 2
  series "Whales" 80 54 100 76 93 72
}
`;

export const PIE_TEMPLATE = `pie "Cookie Market Share, 2023" {
  percent on

  "Mocha Marvels" 32.9
  "Caramel Swirls" 24.4
  "PB Bliss" 19.0
  "Choco Chippers" 9.0
  "Mint Melts" 7.4
  "Berry Bursts" 7.2
}
`;

export const SCATTER_TEMPLATE = `scatter "Local Index by Year" {
  x "Year"
  y "Local index"
  trend on

  series "Local index"
    (1900, 10) (1901, 9) (1902, 12) (1903, 15) (1904, 9) (1905, 40)
    (1906, 4) (1907, 19) (1908, 25) (1909, 14) (1910, 20) (1911, 38)
    (1912, 30) (1913, 60) (1914, 75) (1915, 55) (1916, 89) (1917, 95)
    (1918, 69) (1919, 100) (1920, 92)
}
`;

export const MIND_TEMPLATE = `mind "Web Design" {
  "Visual Design" {
    "Colour Scheme"
    "Typography"
    "Imagery and Icons"
  }
  "User Experience" {
    "Wireframing"
    "User Research"
    "Usability Testing"
  }
  "Development" {
    "Responsive Design"
    "JavaScript"
    "HTML and CSS"
  }
  "Content Strategy" {
    "Copywriting"
    "Search Engine Optimisation"
    "Content Management"
  }
}
`;

export const MATRIX_TEMPLATE = `matrix "Priorities" {
  x "Value" "Low value" "High value"
  y "Effort" "High effort" "Low effort"

  top-left "Do later"
  top-right "Do now"
  bottom-left "Don't do"
  bottom-right "Do next"
}
`;

export const VENN_TEMPLATE = `venn "Three sets" {
  set A "Set 1"
  set B "Set 2"
  set C "Set 3"

  A "126"
  B "129"
  C "128"
  AB "32"
  AC "33"
  BC "30"
  ABC "9"
}
`;

export const FISHBONE_TEMPLATE = `fishbone "The part is produced the wrong size" {
  bone "Material" {
    "Wrong specification of the material"
    "Poor storage conditions"
    "Worn out material"
  }
  bone "Method" {
    "Wrong production procedure"
  }
  bone "Measurement" {
    "Wrong size of the mould"
    "Blueprint mistake"
  }
  bone "Environment" {
    "Wrong production conditions"
  }
  bone "Machine" {
    "Machine malfunction"
    "Machine defect"
  }
  bone "People" {
    "Employee mistake"
    "Mistaken machine settings"
  }
}
`;

export const TEMPLATES: Record<DiagramCategory, string> = {
  flow: FLOWCHART_TEMPLATE,
  bpmn: BPMN_TEMPLATE,
  org: ORG_TEMPLATE,
  bar: BAR_TEMPLATE,
  line: LINE_TEMPLATE,
  pie: PIE_TEMPLATE,
  scatter: SCATTER_TEMPLATE,
  mind: MIND_TEMPLATE,
  matrix: MATRIX_TEMPLATE,
  venn: VENN_TEMPLATE,
  fishbone: FISHBONE_TEMPLATE,
};

export const TEMPLATE_LABELS: Record<DiagramCategory, string> = {
  flow: "Flowchart",
  bpmn: "BPMN 2.0",
  org: "Org chart",
  bar: "Bar chart",
  line: "Line chart",
  pie: "Pie chart",
  scatter: "Scatter plot",
  mind: "Mind map",
  matrix: "2×2 matrix",
  venn: "Venn diagram",
  fishbone: "Fishbone",
};
