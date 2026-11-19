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

/** Four editable starting points, matching common architecture drawing conventions. */
export const ARCHITECTURE_TEMPLATES = [
  {
    label: "Nested systems",
    source: `architecture "Recipe Search Platform" {
  zone APP "Recipe Search Platform" at 40 40 size 960 700
  zone SEARCH "Search & discovery" at 270 100 size 290 210
  zone DATA "Recipe management" at 620 100 size 310 320
  zone ACCOUNT "Accounts" at 270 480 size 290 190
  zone MEDIA "Media & files" at 620 480 size 310 190
  client USER "Mobile app" at 70 270
  service FIND "Search engine" at 330 170
  service RECIPE "Recipe service" at 690 160
  database CATALOG "Recipes" at 690 290
  service PROFILE "User profile" at 330 540
  storage FILES "Image storage" at 690 540
  USER -> FIND -> RECIPE -> CATALOG
  USER -> PROFILE
  PROFILE -> FILES
  RECIPE -> FILES
}
`,
  },
  {
    label: "Build & release",
    source: `architecture "Build & Release Pipeline" {
  zone CI "Continuous integration" at 60 165 size 1030 230
  zone PROD "Production & telemetry" at 60 470 size 1030 240
  external REPO "Source repository" at 85 210
  service TRIGGER "Build trigger" at 290 210
  service BUILD "Build & test" at 495 210
  storage ARTIFACT "Artifacts" at 700 210
  service DEPLOY "Release pipeline" at 900 210
  cloud WEB "Web application" at 470 535
  database DB "Database" at 700 535
  external USERS "Users" at 85 535
  service METRICS "Monitoring" at 900 535
  REPO -> TRIGGER -> BUILD -> ARTIFACT -> DEPLOY
  DEPLOY -> WEB -> DB
  USERS -> WEB
  WEB -.-> METRICS
}
`,
  },
  {
    label: "Event-driven cloud",
    source: `architecture "Event-Driven Cloud" {
  zone REGION "Cloud region" at 250 40 size 1000 680
  zone COMPUTE "Application layer" at 645 130 size 530 210
  zone PERSIST "Data layer" at 645 420 size 530 220
  client USERS "Users" at 40 285
  cloud CDN "CDN & routing" at 285 285
  service GATEWAY "API gateway" at 470 285
  storage INGEST "Ingestion" at 330 90
  queue BUS "Event bus" at 490 90
  service API "Serverless API" at 690 190
  service WORKER "Worker" at 920 190
  database RECORDS "Records" at 690 485
  storage LAKE "Data lake" at 920 485
  USERS -> CDN -> GATEWAY -> API -> RECORDS
  INGEST -.-> BUS -.-> WORKER
  WORKER -> LAKE
  API -.-> BUS
}
`,
  },
  {
    label: "Cluster & network",
    source: `architecture "Kubernetes Infrastructure" {
  zone NETWORK "Virtual network" at 250 75 size 855 585
  zone FRONT "Front end" at 285 150 size 280 340
  zone BACK "Back end" at 605 150 size 460 220
  zone OPS "Operations" at 605 425 size 460 185
  client APP "Client apps" at 35 175
  cloud BALANCER "Load balancer" at 310 205
  service INGRESS "Ingress" at 355 335
  service API "API pods" at 650 200
  service SEARCH "Search pods" at 860 200
  database SQL "SQL database" at 1150 180
  storage OBJECTS "Object storage" at 1150 390
  service MONITOR "Monitoring" at 680 475
  service SECRETS "Secrets" at 875 475
  APP -> BALANCER -> INGRESS -> API -> SEARCH
  API -> SQL
  SEARCH -> OBJECTS
  API -.-> MONITOR
  API -> SECRETS
}
`,
  },
] as const;

/**
 * Common drawings that are an existing notation started a particular way. Each
 * has a card of its own in the catalogue, opens with `?type=…&starter=…`, and
 * is offered again as a starting point inside the editor. The notation is the
 * same; only the first source differs.
 */
export interface Starter {
  /** the slug the catalogue card and `?starter=` use */
  id: string;
  category: DiagramCategory;
  label: string;
  source: string;
}

export const STARTERS: Starter[] = [
  {
    id: "system-context",
    category: "architecture",
    label: "System context",
    source: `architecture "Internet Banking - System Context" {
  zone BANK "Big Bank plc" at 260 60 size 620 380
  client CUSTOMER "Personal customer" at 40 200
  service BANKING "Internet banking system" at 330 200
  external MAINFRAME "Mainframe banking system" at 620 120
  external EMAIL "E-mail system" at 620 300
  CUSTOMER [views accounts, pays] -> BANKING
  BANKING [reads and writes] -> MAINFRAME
  BANKING [sends e-mail] -> EMAIL
  EMAIL -.-> CUSTOMER
}
`,
  },
  {
    id: "container",
    category: "architecture",
    label: "C4 containers",
    source: `architecture "Internet Banking - Containers" {
  zone SYSTEM "Internet banking system" at 230 40 size 700 470
  client CUSTOMER "Personal customer" at 20 230
  client SPA "Single-page app" at 280 120
  client MOBILE "Mobile app" at 280 340
  service API "API application" at 520 230
  database DB "Accounts database" at 760 120
  queue EVENTS "Event queue" at 760 340
  external MAINFRAME "Mainframe banking system" at 1000 230
  CUSTOMER -> SPA
  CUSTOMER -> MOBILE
  SPA [JSON over HTTPS] -> API
  MOBILE [JSON over HTTPS] -> API
  API [SQL] -> DB
  API -.-> EVENTS
  API [XML over HTTPS] -> MAINFRAME
}
`,
  },
  {
    id: "component",
    category: "architecture",
    label: "Components",
    source: `architecture "API Application - Components" {
  zone APP "API application" at 230 40 size 700 470
  client SPA "Single-page app" at 20 230
  service SIGNIN "Sign-in controller" at 280 120
  service ACCOUNTS "Accounts controller" at 280 340
  service SECURITY "Security component" at 520 120
  service FACADE "Mainframe facade" at 520 340
  database DB "Accounts database" at 1000 120
  external MAINFRAME "Mainframe banking system" at 1000 340
  SPA -> SIGNIN
  SPA -> ACCOUNTS
  SIGNIN -> SECURITY
  ACCOUNTS -> FACADE
  SECURITY [reads users] -> DB
  FACADE [XML over HTTPS] -> MAINFRAME
}
`,
  },
  {
    id: "deployment",
    category: "architecture",
    label: "Deployment",
    source: `architecture "Production Deployment" {
  zone DEVICE "Customer's device" at 40 150 size 220 230
  zone CLOUD "Cloud region" at 330 40 size 860 500
  zone CLUSTER "Kubernetes cluster" at 560 110 size 320 380
  zone DATA "Managed services" at 920 110 size 240 380
  client BROWSER "Web browser" at 70 220
  cloud CDN "CDN" at 370 380
  service WEB "Web pods" at 600 220
  service API "API pods" at 600 400
  storage FILES "Object storage" at 960 220
  database SQL "Primary database" at 960 400
  BROWSER [static files] -> CDN
  BROWSER [HTTPS] -> WEB
  WEB -> API
  API -> SQL
  API -> FILES
}
`,
  },
  {
    id: "swot",
    category: "matrix",
    label: "SWOT analysis",
    source: `matrix "SWOT analysis" {
  corner ""
  column "Helpful"
  column "Harmful"

  row "Internal" "Strengths: loyal customers, fast delivery, strong brand" "Weaknesses: small team, thin margins, legacy system"
  row "External" "Opportunities: new market, online sales, partnerships" "Threats: new competitor, rising costs, regulation"

  style headers
  align left
  row-header 110
  size 760 420
}
`,
  },
  {
    id: "raci",
    category: "matrix",
    label: "RACI matrix",
    source: `matrix "Website launch - RACI" {
  corner "Task / Role"
  column "Product owner"
  column "Designer"
  column "Developer"
  column "QA"
  column "Marketing"

  row "Define scope" "A" "C" "C" "I" "C"
  row "Design pages" "A" "R" "C" "I" "I"
  row "Build site" "I" "C" "R" "C" "I"
  row "Test release" "A" "I" "C" "R" "I"
  row "Announce launch" "A" "I" "I" "I" "R"

  style headers
  align center
  row-header 150
  size 760 360
}
`,
  },
  {
    id: "decision-matrix",
    category: "matrix",
    label: "Decision matrix",
    source: `matrix "Choosing a database" {
  corner "Option / Criterion"
  column "Cost (x2)"
  column "Performance (x3)"
  column "Ease of use (x1)"
  column "Support (x2)"
  column "Weighted total"

  row "PostgreSQL" "4" "4" "3" "5" "33"
  row "MySQL" "5" "3" "4" "4" "31"
  row "MongoDB" "3" "4" "4" "3" "28"

  style banded
  align center
  row-header 140
  size 760 300
}
`,
  },
  {
    id: "heatmap",
    category: "matrix",
    label: "Heatmap",
    source: `matrix "Support tickets by day and hour" {
  corner "Day / Hour"
  column "08-10"
  column "10-12"
  column "12-14"
  column "14-16"
  column "16-18"

  row "Monday" {
    cell "12" "#fde0dd"
    cell "31" "#fa9fb5"
    cell "18" "#fcc5c0"
    cell "40" "#f768a1"
    cell "22" "#fcc5c0"
  }
  row "Tuesday" {
    cell "9" "#fff7f3"
    cell "25" "#fcc5c0"
    cell "15" "#fde0dd"
    cell "33" "#fa9fb5"
    cell "19" "#fde0dd"
  }
  row "Wednesday" {
    cell "14" "#fde0dd"
    cell "44" "#dd3497"
    cell "28" "#fa9fb5"
    cell "51" "#ae017e"
    cell "26" "#fcc5c0"
  }

  style heatmap
  align center
  row-header 130
  size 760 320
}
`,
  },
];

/** The starter a catalogue link names, if there is one for that notation. */
export function starterFor(category: DiagramCategory, id: string | undefined): Starter | undefined {
  return STARTERS.find((starter) => starter.id === id && starter.category === category);
}

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

export const USECASE_TEMPLATE = `usecase "Bank ATM" {
  actor CUST "Customer"
  actor TECH "ATM Technician"
  actor BANK "Bank" right

  system ATM "Bank ATM" {
    usecase U1 "Check Balances"
    usecase U2 "Deposit Funds"
    usecase U3 "Withdraw Cash"
    usecase U4 "Transfer Funds"
    usecase U5 "Maintenance"
    usecase U6 "Repair"
  }

  CUST -> U1
  CUST -> U2
  CUST -> U3
  CUST -> U4
  TECH -> U5
  TECH -> U6

  U1 -> BANK
  U2 -> BANK
  U3 -> BANK
  U4 -> BANK
  U5 -> BANK
  U6 -> BANK

  include U3 -> U1
}
`;

export const ACTIVITY_TEMPLATE = `activity "Client Visit" {
  lane SALES "Sales Person" {
    initial S1
    action A1 "Call client and set up appointment"
    decision D1
    action A4 "Send follow-up letter"
    decision D2
    final E1
  }

  lane CONS "Consultant" {
    action A2 "Prepare a laptop"
    action A3 "Meet with the client"
    action A5 "Create proposal"
    action A6 "Send proposal to client"
  }

  lane TECH "Corporate Technician" {
    action A7 "Prepare a conference room"
  }

  S1 -> A1 -> D1
  D1 [appointment offsite] -> A2
  D1 [appointment onsite] -> A7
  A2 -> A3
  A7 -> A3
  A3 -> A4 -> D2
  D2 [statement of problem] -> A5 -> A6 -> E1
  D2 [no statement of problem] -> E1
}
`;

export const ERD_TEMPLATE = `erd "Airline Booking" {
  entity PASSENGER "passengers" {
    pk "id" "bigint"
    "first_name" "varchar(50)"
    "last_name" "varchar(50)"
    "passport_number" "varchar(20)" unique
    "country_of_residence" "varchar(50)" null
  }

  entity BOOKING "booking" {
    pk "booking_id" "bigint"
    fk "passenger_id" "bigint"
    fk "flight_id" "bigint"
    "status" "varchar(20)"
    "booking_platform" "varchar(20)"
  }

  entity FLIGHT "flights" {
    pk "flight_id" "bigint"
    fk "airline_id" "bigint"
    "departing_gate" "varchar(20)"
    "arriving_gate" "varchar(20)"
  }

  entity AIRLINE "airline" {
    pk "airline_id" "bigint"
    "airline_name" "varchar(50)"
    "country" "varchar(50)"
  }

  weak BAGGAGE "baggage" {
    pk "id" "bigint"
    fk "booking_id" "bigint"
    "weight_in_kg" "decimal(4,2)"
  }

  PASSENGER one -> many BOOKING "makes"
  AIRLINE one -> many FLIGHT "operates"
  FLIGHT one -> many BOOKING "carries"
  BOOKING one -.-> many BAGGAGE "checks in"
}
`;

export const SEQUENCE_TEMPLATE = `sequence "Shopping Cart" {
  actor CUST "Customer"
  object CART ":Shopping Cart"
  object ORDER ":Order"
  object ITEM ":Item"

  numbers on
  activations on

  CUST -> CART "«create»"
  CART -> ORDER "getTotal()"
  ORDER -> ITEM "getPrice()"
  ITEM --> ORDER "itemPrice"
  ORDER -> ORDER "calculateTotal()"
  ORDER --> CART "totalPrice"
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

export const HISTOGRAM_TEMPLATE = `histogram "Exam Scores" {
  x "Score"
  y "Number of students"

  "40-50" 2
  "50-60" 5
  "60-70" 11
  "70-80" 14
  "80-90" 8
  "90-100" 3
}
`;

export const GANTT_TEMPLATE = `gantt "Thesis Schedule" {
  unit "Week"
  today 5

  section "Proposal"
  task T1 "Literature review" 1 3 done 100
  task T2 "Write the proposal" after T1 2 done 60
  milestone M1 "Proposal defence" after T2

  section "Research"
  task T3 "Build the prototype" after M1 4
  task T4 "Collect the data" after T3 3
  task T5 "Analyse the results" after T4 2

  section "Writing"
  task T6 "Write chapters 4 and 5" after T5 3
  milestone M2 "Final defence" after T6
}
`;

export const QUADRANT_TEMPLATE = `quadrant "Feature Priorities" {
  x "Effort" "Low" "High"
  y "Impact" "Low" "High"

  top-left "Quick wins"
  top-right "Major projects"
  bottom-left "Fill-ins"
  bottom-right "Thankless tasks"

  item "Dark mode" 20 72
  item "Export to PDF" 35 88
  item "Offline sync" 82 80
  item "Rename buttons" 15 22
  item "Legacy importer" 78 18
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

export const MATRIX_TEMPLATE = `matrix "Team skill matrix" {
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

export const PRISMA_TEMPLATE = `prisma "PRISMA 2020 flow diagram" {
  band "Identification"
  row "Records identified from" 1423 {
    "Databases" 1200
    "Registers" 223
  }
  side "Records removed before screening" 468 {
    "Duplicate records removed" 300
    "Records marked as ineligible by automation tools" 100
    "Records removed for other reasons" 68
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
    "Reason 2" 35
    "Reason 3" 25
  }

  band "Included"
  row "Studies included in review" 13 {
    "Reports of included studies" 16
  }
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

export const CLASS_TEMPLATE = `class "Library System" {
  abstract ITEM "LibraryItem" {
    attr "# id : String"
    attr "# title : String"
    method "+ isAvailable() : Boolean"
  }
  class BOOK "Book" {
    attr "- isbn : String"
    attr "- pages : Integer"
    method "+ getAuthor() : Author"
  }
  class MEMBER "Member" {
    attr "- name : String"
    attr "- email : String"
    method "+ borrow(item : LibraryItem) : Loan"
  }
  class LOAN "Loan" {
    attr "- dueDate : Date"
    method "+ isOverdue() : Boolean"
  }
  interface NOTIFY "Notifiable" {
    method "+ notify(message : String) : void"
  }
  enum STATUS "LoanStatus" {
    value "ACTIVE"
    value "RETURNED"
    value "OVERDUE"
  }

  inherit BOOK -> ITEM
  implement MEMBER -> NOTIFY
  MEMBER "1" -> "0..*" LOAN "makes"
  compose LOAN "1" -> "1" STATUS
  LOAN "0..*" -> "1" ITEM "lends"
}
`;

export const DFD_TEMPLATE = `dfd "Online Shop - Level 0" {
  entity CUST "Customer"
  entity BANK "Bank"
  process P1 "Place Order"
  process P2 "Process Payment"
  process P3 "Ship Order"
  store ORDERS "Orders"
  store STOCK "Inventory"

  CUST -> P1 "Order details"
  P1 -> ORDERS "New order"
  STOCK -> P1 "Stock level"
  P1 -> P2 "Amount due"
  P2 -> BANK "Payment request"
  BANK -> P2 "Payment confirmation"
  P2 -> P3 "Paid order"
  ORDERS -> P3 "Order lines"
  P3 -> STOCK "Stock update"
  P3 -> CUST "Delivery note"
}
`;

export const STATE_TEMPLATE = `state "Order Lifecycle" {
  initial S0
  state NEW "Pending" {
    entry "reserveStock()"
  }
  choice C1
  state PAID "Paid"
  state SHIP "Shipped" {
    entry "notifyCustomer()"
    do "trackParcel()"
  }
  state CANCEL "Cancelled"
  final E1

  S0 -> NEW
  NEW -> C1 "pay"
  C1 -> PAID "[approved]"
  C1 -> CANCEL "[declined] / releaseStock()"
  NEW -> CANCEL "cancel / releaseStock()"
  PAID -> SHIP "dispatch"
  SHIP -> E1 "delivered"
  CANCEL -> E1
}
`;

export const TREE_TEMPLATE = `tree "Play Outside?" {
  node OUT "Outlook?"
  node HUM "Humidity?"
  node WIND "Windy?"
  leaf Y1 "Play"
  leaf N1 "Don't play"
  leaf Y2 "Play"
  leaf Y3 "Play"
  leaf N2 "Don't play"

  OUT -> HUM "sunny"
  OUT -> Y1 "overcast"
  OUT -> WIND "rain"
  HUM -> N1 "high"
  HUM -> Y2 "normal"
  WIND -> N2 "true"
  WIND -> Y3 "false"
}
`;

export const TEMPLATES: Record<DiagramCategory, string> = {
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
  prisma: PRISMA_TEMPLATE,
  architecture: ARCHITECTURE_TEMPLATES[0].source,
  class: CLASS_TEMPLATE,
  dfd: DFD_TEMPLATE,
  state: STATE_TEMPLATE,
  tree: TREE_TEMPLATE,
  histogram: HISTOGRAM_TEMPLATE,
  quadrant: QUADRANT_TEMPLATE,
  gantt: GANTT_TEMPLATE,
};

export const TEMPLATE_LABELS: Record<DiagramCategory, string> = {
  flow: "Flowchart",
  bpmn: "BPMN 2.0",
  org: "Org chart",
  usecase: "Use case",
  activity: "Activity",
  erd: "ER diagram",
  sequence: "Sequence",
  bar: "Bar chart",
  line: "Line chart",
  pie: "Pie chart",
  scatter: "Scatter plot",
  mind: "Mind map",
  matrix: "matrix table",
  venn: "Venn diagram",
  fishbone: "Fishbone",
  prisma: "PRISMA flow",
  architecture: "Architecture diagram",
  class: "Class diagram",
  dfd: "Data flow",
  state: "State machine",
  tree: "Tree",
  histogram: "Histogram",
  quadrant: "Quadrant",
  gantt: "Gantt chart",
};
