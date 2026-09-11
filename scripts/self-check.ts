import assert from "node:assert";
import { parseDSL, detectCategory } from "@/lib/parser/parse-dsl";
import { computeLayout } from "@/lib/layout/compute-layout";
import { FLOWCHART_TEMPLATE, BPMN_TEMPLATE, ORG_TEMPLATE } from "@/lib/templates";
import { READY_DIAGRAMS } from "@/lib/diagrams";
import { DSLError } from "@/lib/types";
import { renameCopies } from "@/lib/canvas/copies";
import {
  asElement,
  gripSide,
  linkSignature,
  movableLeg,
  routeBetween,
  sideAnchor,
  sidesFor,
  type Point,
  type Rules,
} from "@/lib/canvas/connect";

assert.equal(detectCategory(FLOWCHART_TEMPLATE), "flow");
assert.equal(detectCategory(BPMN_TEMPLATE), "bpmn");
assert.equal(detectCategory(ORG_TEMPLATE), "org");
assert.equal(detectCategory('graph "x" {}'), null);

const flowAst = parseDSL(FLOWCHART_TEMPLATE);
assert.equal(flowAst.category, "flow");
assert.equal(flowAst.title, "Chart Title");
assert.equal(flowAst.nodes.length, 5);
assert.equal(flowAst.edges.length, 5);
const backEdge = flowAst.edges.find(
  (e) => e.from === "D1" && e.label === "No",
);
assert.ok(backEdge && backEdge.to === "P1");
const startNode = flowAst.nodes.find((n) => n.id === "S1");
assert.ok(startNode && startNode.type === "start" && startNode.label === "Start Process");

const bpmnAst = parseDSL(BPMN_TEMPLATE);
assert.equal(bpmnAst.category, "bpmn");
assert.equal(bpmnAst.title, "Vacation Request");
assert.equal(bpmnAst.nodes.length, 8);
assert.equal(bpmnAst.edges.length, 7);
assert.equal(bpmnAst.pools!.length, 1);
assert.equal(bpmnAst.pools![0].lanes.length, 3);
const s1 = bpmnAst.nodes.find((n) => n.id === "S1");
assert.ok(s1 && s1.type === "start");
assert.equal(s1.lane, "L1", "node inside lane gets its lane id");
const sendTask = bpmnAst.nodes.find((n) => n.id === "A2");
assert.ok(sendTask && sendTask.type === "send-task");
const gw = bpmnAst.nodes.find((n) => n.id === "G1");
assert.ok(gw && gw.type === "gw-ex");
const dataObj = bpmnAst.nodes.find((n) => n.id === "D1");
assert.ok(dataObj && dataObj.type === "data");
assert.equal(dataObj.lane, "L3");
const assoc = bpmnAst.edges.find(
  (e) => e.from === "A3" && e.kind === "association",
);
assert.ok(assoc && assoc.to === "D1");
const seqFlow = bpmnAst.edges.find((e) => e.from === "S1");
assert.ok(seqFlow && seqFlow.kind === undefined, "solid arrow has no kind");

// extended BPMN node types
const extAst = parseDSL(
  'bpmn "Extended" {\n  msg-start S "s"\n  timer T "t"\n  send-task A "a"\n  recv-task R "r"\n  script-task W "w"\n  user-task U "u"\n  gw-para GP "g"\n  gw-inc GI "g"\n  msg-end E "e"\n  S -> T -> A\n  W -> E\n}',
);
assert.equal(extAst.nodes.find((n) => n.id === "S")?.type, "msg-start");
assert.equal(extAst.nodes.find((n) => n.id === "T")?.type, "timer");
assert.equal(extAst.nodes.find((n) => n.id === "R")?.type, "recv-task");
assert.equal(extAst.nodes.find((n) => n.id === "W")?.type, "script-task");
assert.equal(extAst.nodes.find((n) => n.id === "U")?.type, "user-task");
assert.equal(extAst.nodes.find((n) => n.id === "GP")?.type, "gw-para");
assert.equal(extAst.nodes.find((n) => n.id === "GI")?.type, "gw-inc");
assert.equal(extAst.nodes.find((n) => n.id === "E")?.type, "msg-end");

// aliases
const aliasAst = parseDSL(
  'flow "Aliases" {\n  task T1 "Task"\n  data D1 "Data"\n  T1 -> D1\n}',
);
assert.equal(aliasAst.nodes.find((n) => n.id === "T1")?.type, "process");
assert.equal(aliasAst.nodes.find((n) => n.id === "D1")?.type, "io");

// hyphenated ids survive tokenization
const idAst = parseDSL('bpmn "Ids" {\n  task Node-1 "N"\n  task node.2 "M"\n  Node-1 -.-> node.2\n}');
assert.ok(idAst.nodes.find((n) => n.id === "Node-1"));
assert.ok(idAst.nodes.find((n) => n.id === "node.2"));
assert.equal(idAst.edges[0].kind, "association");

// label without quotes defaults to id
const bareAst = parseDSL('flow "Bare" {\n  process P\n  P -> P\n}');
assert.equal(bareAst.nodes.find((n) => n.id === "P")?.label, "P");

// comments supported
const commentAst = parseDSL(
  'flow "C" {\n  # declare\n  process A "A"\n  // chain\n  process B "B"\n  A -> B\n}',
);
assert.equal(commentAst.nodes.length, 2);

// flow layout: no overlapping nodes, polylines present
const positioned = computeLayout(flowAst);
assert.equal(positioned.nodes.length, 5);
for (const n of positioned.nodes) {
  assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
}
for (const e of positioned.edges) {
  assert.ok(e.points.length >= 2, "edge has polyline points");
}
const overlaps = (x1: number, y1: number, w1: number, h1: number, x2: number, y2: number, w2: number, h2: number) =>
  x1 < x2 + w2 && x2 < x1 + w1 && y1 < y2 + h2 && y2 < y1 + h1;
for (const cat of [positioned, computeLayout(bpmnAst)]) {
  for (let i = 0; i < cat.nodes.length; i++) {
    for (let j = i + 1; j < cat.nodes.length; j++) {
      const n1 = cat.nodes[i];
      const n2 = cat.nodes[j];
      // bpmn nodes reserve label space below the shape; compare padded boxes
      const pad = cat.category === "bpmn" ? 20 : 0;
      assert.ok(
        !overlaps(
          n1.x, n1.y, n1.width, n1.height + pad,
          n2.x, n2.y, n2.width, n2.height + pad,
        ),
        `nodes ${n1.id}/${n2.id} must not overlap (${cat.category})`,
      );
    }
  }
}

// bpmn layout: canonical sizes + LR direction per lane
const bpmnPos = computeLayout(bpmnAst);
assert.equal(bpmnPos.pools?.length, 1, "pooled layout produces pools");
const pool = bpmnPos.pools![0];
assert.equal(pool.lanes.length, 3);
// lanes stack vertically and share pool width
assert.ok(pool.lanes[0].y < pool.lanes[1].y);
assert.ok(pool.lanes[1].y < pool.lanes[2].y);
assert.equal(pool.lanes[0].x, pool.lanes[2].x);
assert.equal(pool.lanes[0].width, pool.lanes[2].width);
// pool box encloses its lanes
assert.ok(pool.y <= pool.lanes[0].y);
assert.ok(pool.y + pool.height >= pool.lanes[2].y + pool.lanes[2].height);
const evNode = bpmnPos.nodes.find((n) => n.id === "S1")!;
assert.equal(evNode.width, 36);
assert.equal(evNode.height, 36);
const taskNode = bpmnPos.nodes.find((n) => n.id === "A1")!;
assert.equal(taskNode.width, 100);
assert.equal(taskNode.height, 80);
const gwNode = bpmnPos.nodes.find((n) => n.id === "G1")!;
assert.equal(gwNode.width, 50);
assert.equal(gwNode.height, 50);
const dataNode = bpmnPos.nodes.find((n) => n.id === "D1")!;
assert.equal(dataNode.width, 36);
assert.equal(dataNode.height, 50);
// LR: chain S1->A1->A2 (all in lane L1) strictly increases x
const chain = ["S1", "A1", "A2"].map(
  (id) => bpmnPos.nodes.find((n) => n.id === id)!,
);
for (let i = 1; i < chain.length; i++) {
  assert.ok(
    chain[i].x > chain[i - 1].x,
    `bpmn lane LR: ${chain[i].id} must be right of ${chain[i - 1].id}`,
  );
}
// lanes are vertically disjoint regions
const laneNodes = (laneId: string) =>
  bpmnPos.nodes.filter((n) => n.lane === laneId);
const l1 = laneNodes("L1");
const l3 = laneNodes("L3");
const l1MaxY = Math.max(...l1.map((n) => n.y + n.height));
const l3MinY = Math.min(...l3.map((n) => n.y));
assert.ok(l1MaxY < l3MinY, "lane L1 content is above lane L3 content");

// --- BPMN grid invariants across a range of shapes of diagram
const BPMN_CASES: Array<[string, string]> = [
  ["template", BPMN_TEMPLATE],
  [
    "loop back",
    'bpmn "Loop" {\n  pool P "P" {\n    lane L "L" {\n      start S "s"\n      task A "a"\n      gw-ex G "ok?"\n      end E "e"\n    }\n  }\n  S -> A -> G\n  G [yes] -> E\n  G [no] -> A\n}',
  ],
  [
    "parallel branches",
    'bpmn "Split" {\n  pool P "P" {\n    lane L1 "One" {\n      start S "s"\n      gw-para G "fork"\n      task A "a"\n      task B "b"\n      gw-para J "join"\n      end E "e"\n    }\n  }\n  S -> G\n  G -> A -> J\n  G -> B -> J\n  J -> E\n}',
  ],
  [
    "two pools",
    'bpmn "Pools" {\n  pool P1 "Customer" {\n    start S "s"\n    task A "order"\n  }\n  pool P2 "Shop" {\n    task B "ship"\n    end E "done"\n  }\n  S -> A -> B -> E\n}',
  ],
  [
    "crowded column",
    'bpmn "Order" {\n  pool P1 "Customer" {\n    msg-start S "order placed"\n    task A "choose items"\n    recv-task R "receive invoice"\n    end E "done"\n  }\n  pool P2 "Supplier" {\n    lane L1 "Sales" {\n      task B "check stock"\n      gw-ex G "in stock?"\n      send-task C "send invoice"\n    }\n    lane L2 "Warehouse" {\n      user-task D "pack order"\n      data DO "picking list"\n      msg-end ME "order rejected"\n    }\n  }\n  S -> A -> B -> G\n  G [yes] -> D -> C -> R -> E\n  G [no] -> ME\n  D -.-> DO\n}',
  ],
  [
    "skipped rank",
    'bpmn "Skip" {\n  pool P "P" {\n    lane L "L" {\n      start S "s"\n      task A "a"\n      task B "b"\n      end E "e"\n    }\n  }\n  S -> A -> B -> E\n  S -> B\n}',
  ],
  [
    "no pool",
    'bpmn "Bare" {\n  start S "s"\n  user-task A "review"\n  data D "log"\n  end E "e"\n  S -> A -> E\n  A -.-> D\n}',
  ],
];

function overlapsBox(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

for (const [name, source] of BPMN_CASES) {
  const laid = computeLayout(parseDSL(source));
  const nodes = laid.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      assert.ok(
        !overlapsBox(nodes[i], nodes[j]),
        `${name}: ${nodes[i].id}/${nodes[j].id} overlap`,
      );
    }
  }

  for (const lane of laid.pools?.flatMap((p) => p.lanes) ?? []) {
    for (const node of nodes.filter((n) => n.lane === lane.id)) {
      assert.ok(
        node.x >= lane.x + lane.headerWidth &&
          node.x + node.width <= lane.x + lane.width &&
          node.y >= lane.y &&
          node.y + node.height <= lane.y + lane.height,
        `${name}: ${node.id} escapes lane ${lane.id}`,
      );
    }
  }
  for (const pool of laid.pools ?? []) {
    let cursor = pool.y;
    for (const lane of pool.lanes) {
      assert.equal(lane.y, cursor, `${name}: lanes tile pool ${pool.id}`);
      cursor += lane.height;
    }
    assert.equal(cursor, pool.y + pool.height, `${name}: pool ${pool.id} height`);
  }

  for (const edge of laid.edges) {
    assert.ok(edge.points.length >= 2, `${name}: ${edge.from}->${edge.to} routed`);
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1];
      const b = edge.points[i];
      assert.ok(
        Math.abs(a.x - b.x) < 1 || Math.abs(a.y - b.y) < 1,
        `${name}: ${edge.from}->${edge.to} leg ${i} is not orthogonal`,
      );
    }
    // ends sit on the boundary of their shape
    for (const [point, id] of [
      [edge.points[0], edge.from],
      [edge.points[edge.points.length - 1], edge.to],
    ] as const) {
      const node = byId.get(id)!;
      const onVerticalEdge =
        (Math.abs(point.x - node.x) < 1 ||
          Math.abs(point.x - (node.x + node.width)) < 1) &&
        point.y >= node.y - 1 &&
        point.y <= node.y + node.height + 1;
      const onHorizontalEdge =
        (Math.abs(point.y - node.y) < 1 ||
          Math.abs(point.y - (node.y + node.height)) < 1) &&
        point.x >= node.x - 1 &&
        point.x <= node.x + node.width + 1;
      assert.ok(
        onVerticalEdge || onHorizontalEdge,
        `${name}: ${edge.from}->${edge.to} does not touch ${id}`,
      );
    }
    // no leg cuts through an unrelated shape
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1];
      const b = edge.points[i];
      const box = {
        x: Math.min(a.x, b.x) + 1,
        y: Math.min(a.y, b.y) + 1,
        width: Math.abs(a.x - b.x) - 2,
        height: Math.abs(a.y - b.y) - 2,
      };
      if (box.width < 0 || box.height < 0) {
        box.width = Math.max(0, box.width);
        box.height = Math.max(0, box.height);
      }
      for (const node of nodes) {
        if (node.id === edge.from || node.id === edge.to) {
          continue;
        }
        assert.ok(
          !overlapsBox(box, node),
          `${name}: ${edge.from}->${edge.to} crosses ${node.id}`,
        );
      }
    }
  }
}

// error cases carry friendly messages and line numbers
function expectDSLError(code: string, msgPart: string, line?: number): void {
  try {
    parseDSL(code);
    throw new Error(`expected DSLError for: ${code}`);
  } catch (err) {
    assert.ok(err instanceof DSLError, `expected DSLError, got ${err}`);
    assert.ok(
      err.message.includes(msgPart),
      `expected message to contain "${msgPart}", got "${err.message}"`,
    );
    if (line !== undefined) {
      assert.equal(err.line, line);
    }
  }
}

expectDSLError('x "Title" {}', 'must start with "flow", "bpmn" or "org"');
expectDSLError('flow Missing { }', "diagram title", 1);
expectDSLError('flow "T" { process P1 "P"\n', 'Missing closing "}"', 1);
expectDSLError('flow "T" { process P1 "P"\n  P1 -> Q1 }', 'undeclared node "Q1"');
expectDSLError('flow "T" { process P1 "P"\n  process P1 "Q" }', 'Duplicate node id "P1"', 2);
expectDSLError('flow "T" { process P1 "P"\n  P1 [Yes] P2 }', 'Expected "->" after "P1"', 2);
expectDSLError('flow "T" { bogus P1 "P" }', 'Expected "->" after "bogus"', 1);
expectDSLError('bpmn "T" { process P "P" }', 'Expected "->" after "process"', 1);
expectDSLError('flow "T" { process P1 @ }', 'Unexpected character', 1);
expectDSLError('bpmn "T" { decision D "D" }', 'Expected "->" after "decision"', 1);
expectDSLError('flow "T" { gw-para G "G" }', 'Expected "->" after "gw-para"', 1);
expectDSLError('flow "T" { process P1 "P" }\nleftover', 'Unexpected content after closing "}"', 2);

// pool/lane errors
expectDSLError('bpmn "T" { pool P1 "p" { pool P2 "q" {} } }', 'Pools cannot nest inside pools', 1);
expectDSLError('bpmn "T" { pool P1 "p" { lane L1 "l" { lane L2 "x" {} } } }', '"lane" cannot nest inside a lane', 1);
expectDSLError('bpmn "T" { start S "s"\n  pool S "p" {} }', 'Duplicate id "S"', 2);
expectDSLError('bpmn "T" { pool P1 "p" {}\n  lane P1 "x" {} }', 'Duplicate id "P1"', 2);

// pool with statements but no lane wraps them in one implicit lane
const implicit = parseDSL(
  'bpmn "T" { pool P1 "P" { start S "s"\n  task A "a"\n  S -> A } }',
);
assert.equal(implicit.pools!.length, 1);
assert.equal(implicit.pools![0].lanes.length, 1);
assert.equal(implicit.pools![0].lanes[0].id, "P1");
assert.equal(implicit.nodes.find((n) => n.id === "S")?.lane, "P1");
assert.ok(implicit.edges.length >= 1, "edges work inside a pool block");

// dashed arrows parse in flow too (rendered solid there; bpmn styles them)
const flowAssoc = parseDSL('flow "F" {\n  process A "A"\n  process B "B"\n  A -.-> B\n}');
assert.equal(flowAssoc.edges[0].kind, "association");

// ------------------------------------------------------------------ org chart

const orgAst = parseDSL(ORG_TEMPLATE);
assert.equal(orgAst.category, "org");
assert.equal(orgAst.nodes.length, 12);
const dean = orgAst.nodes.find((n) => n.id === "DEAN");
assert.equal(dean?.name, "Dr. Marion Hale");
assert.equal(
  orgAst.nodes.find((n) => n.id === "SENATE")?.name,
  undefined,
  "a role with one caption carries no name",
);
const lab = orgAst.nodes.find((n) => n.id === "LABS");
assert.equal(lab?.entries?.length, 3, "sub-roles parsed");
assert.equal(lab?.entries?.[1].label, "Computing Lab");
assert.equal(lab?.entries?.[1].name, "Karel Sandvik, M.Sc");
assert.equal(
  orgAst.edges.find((e) => e.to === "SENATE")?.kind,
  "association",
  "the senate is tied in with a dotted line",
);

expectDSLError('org "T" { unit "a" "b" }', 'only belongs inside a role block', 1);
expectDSLError('org "T" { role R "R" { role X "x" } }', 'Expected "unit"', 1);
expectDSLError('org "T" { role R "R" { unit } }', "caption", 1);
expectDSLError('org "T" { role R "R" { } }', "empty role block", 1);
expectDSLError('org "T" { role R "R"\n  role R "S" }', 'Duplicate node id "R"', 2);

// a sub-role caption with no name is allowed
const bare = parseDSL('org "T" { role R "R" { unit "Only" } }');
assert.equal(bare.nodes[0].entries?.[0].name, undefined);

const org = computeLayout(orgAst);
assert.equal(org.category, "org");
assert.equal(org.pools, undefined, "an org chart has no pools");

const at = (id: string) => org.nodes.find((n) => n.id === id)!;
// rows are top aligned, so boxes of different heights start on the same line
assert.equal(at("VD1").y, at("LABS").y, "siblings share a row");
assert.ok(at("VD1").y > at("DEAN").y + at("DEAN").height, "children sit below");
assert.equal(at("SENATE").y, at("DEAN").y, "the satellite rides beside its host");
assert.ok(
  at("SENATE").x >= at("DEAN").x + at("DEAN").width,
  "the satellite sits to the right of its host",
);
// a role with no name is a band and nothing else
assert.ok(at("SENATE").height < at("DEAN").height, "a role-only box is shorter");
// the parent is centred over the run of its children
const kids = ["VD1", "VD2", "VD3", "LABS", "UG", "PG", "QA"].map(at);
const runCentre =
  (kids[0].x +
    kids[0].width / 2 +
    kids[kids.length - 1].x +
    kids[kids.length - 1].width / 2) /
  2;
assert.ok(
  Math.abs(at("DEAN").x + at("DEAN").width / 2 - runCentre) <= 1,
  "the parent is centred over its children",
);

// nothing overlaps
for (let i = 0; i < org.nodes.length; i++) {
  for (let j = i + 1; j < org.nodes.length; j++) {
    const a = org.nodes[i];
    const b = org.nodes[j];
    assert.ok(
      !(
        a.x < b.x + b.width &&
        b.x < a.x + a.width &&
        a.y < b.y + b.height &&
        b.y < a.y + a.height
      ),
      `${a.id} and ${b.id} overlap`,
    );
  }
}

// every reporting line is a bus: parent bottom, shared rail, child top
const busses = org.edges.filter((e) => e.reporting);
assert.equal(busses.length, 10, "ten reporting lines");
for (const edge of busses) {
  const from = at(edge.from);
  const to = at(edge.to);
  const first = edge.points[0];
  const last = edge.points[edge.points.length - 1];
  assert.equal(first.y, from.y + from.height, `${edge.from} leaves its bottom`);
  assert.equal(last.y, to.y, `${edge.to} is entered at its top`);
  assert.equal(last.x, Math.round(to.x + to.width / 2), "entered on centre");
}
const rails = new Set(
  org.edges
    .filter((e) => e.reporting && e.from === "DEAN" && e.points.length === 4)
    .map((e) => e.points[1].y),
);
assert.equal(rails.size, 1, "children of one box share a single rail");
assert.ok(
  !org.edges.find((e) => e.to === "SENATE")?.reporting,
  "a dotted tie is not a reporting line",
);

// a cycle degrades to a plain connector rather than looping forever
const cyclic = computeLayout(
  parseDSL('org "C" { role A "A"\n  role B "B"\n  A -> B\n  B -> A }'),
);
assert.equal(cyclic.nodes.length, 2);
assert.equal(cyclic.edges.filter((e) => e.reporting).length, 1);

// ------------------------------------------------------- growing sideways

// a flowchart laid out across the page keeps its ranks, turned a quarter turn
const flowDown = computeLayout(parseDSL(FLOWCHART_TEMPLATE), "down");
const flowRight = computeLayout(parseDSL(FLOWCHART_TEMPLATE), "right");
const rank = (drawn: typeof flowDown, id: string) =>
  drawn.nodes.find((n) => n.id === id)!;
assert.ok(
  rank(flowDown, "E1").y > rank(flowDown, "S1").y &&
    Math.abs(rank(flowDown, "E1").x - rank(flowDown, "S1").x) < 200,
  "top down: the chart runs down the page",
);
assert.ok(
  rank(flowRight, "E1").x > rank(flowRight, "S1").x &&
    Math.abs(rank(flowRight, "E1").y - rank(flowRight, "S1").y) < 200,
  "sideways: the chart runs across the page",
);
assert.equal(
  flowDown.nodes.length,
  flowRight.nodes.length,
  "the same boxes either way",
);

// an org chart the same: levels step across, the boxes on one level stack
const orgRight = computeLayout(parseDSL(ORG_TEMPLATE), "right");
const acrossAt = (id: string) => orgRight.nodes.find((n) => n.id === id)!;
assert.ok(
  acrossAt("VD1").x > acrossAt("DEAN").x + acrossAt("DEAN").width,
  "children stand to the right of their parent",
);
assert.equal(acrossAt("VD1").x, acrossAt("QA").x, "one level shares a column");
assert.ok(acrossAt("QA").y > acrossAt("VD1").y, "siblings stack down the column");
assert.ok(
  acrossAt("SERVICES").x > acrossAt("UG").x + acrossAt("UG").width,
  "the next level steps across again",
);
// the parent is centred on the run of its children, across the column now
const column = ["VD1", "VD2", "VD3", "LABS", "UG", "PG", "QA"].map(acrossAt);
const runMiddle =
  (column[0].y +
    column[0].height / 2 +
    column[column.length - 1].y +
    column[column.length - 1].height / 2) /
  2;
assert.ok(
  Math.abs(acrossAt("DEAN").y + acrossAt("DEAN").height / 2 - runMiddle) <= 1,
  "the parent is centred on its children",
);
// the satellite parks under its host rather than beside it
assert.equal(acrossAt("SENATE").x, acrossAt("DEAN").x, "the satellite shares the column");
assert.ok(
  acrossAt("SENATE").y >= acrossAt("DEAN").y + acrossAt("DEAN").height,
  "the satellite sits below its host",
);
// reporting lines leave the trailing edge and enter the leading one
for (const edge of orgRight.edges.filter((e) => e.reporting)) {
  const from = acrossAt(edge.from);
  const to = acrossAt(edge.to);
  const first = edge.points[0];
  const last = edge.points[edge.points.length - 1];
  assert.equal(first.x, from.x + from.width, `${edge.from} leaves its right edge`);
  assert.equal(last.x, to.x, `${edge.to} is entered on its left edge`);
  assert.equal(last.y, Math.round(to.y + to.height / 2), "entered on centre");
}
const railsRight = new Set(
  orgRight.edges
    .filter((e) => e.reporting && e.from === "DEAN" && e.points.length === 4)
    .map((e) => e.points[1].x),
);
assert.equal(railsRight.size, 1, "children of one box share a single rail");

// nothing overlaps either way
for (const drawn of [flowRight, orgRight]) {
  for (let i = 0; i < drawn.nodes.length; i++) {
    for (let j = i + 1; j < drawn.nodes.length; j++) {
      const a = drawn.nodes[i];
      const b = drawn.nodes[j];
      assert.ok(
        !(
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height
        ),
        `${drawn.category} sideways: ${a.id} and ${b.id} overlap`,
      );
    }
  }
}

// a BPMN diagram reads along its lanes whichever way the picker is set
const bpmnDown = computeLayout(parseDSL(BPMN_TEMPLATE), "down");
const bpmnRight = computeLayout(parseDSL(BPMN_TEMPLATE), "right");
assert.deepEqual(
  bpmnRight.nodes.map((n) => [n.id, n.x, n.y]),
  bpmnDown.nodes.map((n) => [n.id, n.x, n.y]),
  "BPMN ignores the direction",
);

// ---------------------------------------------------------------- connectors

/** Every leg of a route has to run either straight down or straight across. */
function assertSquare(points: readonly Point[], what: string): void {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    assert.ok(
      Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01,
      `${what}: leg ${i} runs at a slant (${JSON.stringify(a)} -> ${JSON.stringify(b)})`,
    );
  }
}

const CHART: Rules = { category: "org", direction: "down" };
const SHEET: Rules = { category: "bpmn", direction: "down" };

const parentBox = { x: 300, y: 100, width: 160, height: 48 };
const leftChild = { x: 100, y: 240, width: 160, height: 48 };
const rightChild = { x: 500, y: 240, width: 160, height: 48 };
const belowChild = { x: 300, y: 240, width: 160, height: 48 };

// a chart hangs a child off the bottom of its parent, never off the side
assert.deepEqual(
  sidesFor(parentBox, leftChild, CHART),
  ["bottom", "top"],
  "a reporting line leaves the bottom of the box above",
);
assert.deepEqual(
  sidesFor(leftChild, parentBox, CHART),
  ["top", "bottom"],
  "and the same line drawn the other way round leaves the top",
);
// two boxes on one level are joined across, whichever notation they are in
assert.deepEqual(
  sidesFor(leftChild, rightChild, CHART),
  ["right", "left"],
  "two boxes on one level are joined side to side",
);
// a BPMN sheet reads across, so a flow between two clear shapes runs across
assert.deepEqual(
  sidesFor(parentBox, rightChild, SHEET),
  ["right", "left"],
  "a sequence flow reads left to right",
);

const toLeft = routeBetween(parentBox, leftChild, CHART);
const toRight = routeBetween(parentBox, rightChild, CHART);
assertSquare(toLeft, "chart route left");
assertSquare(toRight, "chart route right");
assert.equal(toLeft.length, 4, "an offset child is reached over one rail");
assert.equal(
  toLeft[1].y,
  toRight[1].y,
  "every child of one box turns on the same rail",
);
assert.equal(
  toLeft[0].x,
  parentBox.x + parentBox.width / 2,
  "the rail hangs from the middle of the parent",
);
assert.equal(toLeft[0].y, parentBox.y + parentBox.height, "and from its bottom edge");
assert.equal(
  toLeft[3].x,
  leftChild.x + leftChild.width / 2,
  "and meets the middle of the child",
);
assert.equal(toLeft[3].y, leftChild.y, "at its top edge");

// a child standing directly under its parent is reached by one straight line
const straight = routeBetween(parentBox, belowChild, CHART);
assert.equal(straight.length, 2, "a child underneath needs no turn");
assert.equal(straight[0].x, straight[1].x, "and the line is plumb");

// two boxes of different heights standing side by side are joined by one rule
const short = { x: 100, y: 100, width: 120, height: 24 };
const tall = { x: 320, y: 80, width: 120, height: 64 };
const across = routeBetween(short, tall, CHART);
assert.equal(across.length, 2, "side by side is one straight rule");
assert.equal(across[0].y, across[1].y, "and it is level");

// a box that sits on top of the one it points at is gone round, not through
const overlapping = { x: 320, y: 120, width: 160, height: 48 };
const round = routeBetween(parentBox, overlapping, CHART);
assertSquare(round, "route with no room between the boxes");
assert.ok(round.length >= 4, "with no room between them the line goes round");

// the middle leg answers to the reader: it moves, and takes its corners with it
const moved = routeBetween(parentBox, leftChild, { ...CHART, bend: 200 });
assertSquare(moved, "route with the rail moved");
assert.equal(moved[1].y, 200, "the rail lands where it was dragged");
const leg = movableLeg(moved);
assert.ok(leg && !leg.upright && leg.value === 200, "and it is the leg with a handle");
assert.equal(movableLeg(straight), null, "a straight line has no handle");
assert.equal(movableLeg(round), null, "nor has one that goes round the outside");

// an end pinned to a side is used even when the rule would have picked another
const pinned = routeBetween(parentBox, leftChild, { ...CHART, fromSide: "left" });
assertSquare(pinned, "route pinned to a side");
assert.equal(pinned[0].x, parentBox.x, "a pinned end leaves the side it was given");

// a dot is grabbed from the outline: a press in the middle of a short box is
// not a press on its top edge, whatever the reach
assert.equal(gripSide(parentBox, { x: 380, y: 100 }, 10), "top", "a press on the dot");
assert.equal(gripSide(parentBox, { x: 380, y: 94 }, 10), "top", "and just above it");
assert.equal(
  gripSide(parentBox, { x: 380, y: 111 }, 10),
  undefined,
  "a press well inside is the notation's to route",
);
assert.equal(
  gripSide(parentBox, { x: 300, y: 124 }, 10),
  "left",
  "and each side has its own dot",
);

// the dot on a side is what pins that side, and it sits at the side's middle
assert.deepEqual(
  sideAnchor(parentBox, "left", leftChild),
  { x: 300, y: 124 },
  "the left dot sits on the left edge",
);
assert.deepEqual(
  sideAnchor(parentBox, "bottom", leftChild),
  { x: 380, y: 148 },
  "and the bottom dot under the middle",
);

// Excalidraw holds a connector as an origin plus points measured from it, and
// the first of those points has to be [0, 0]
const held = asElement(toLeft);
assert.deepEqual(held.points[0], [0, 0], "a route is anchored on its first point");
assert.equal(held.x, toLeft[0].x, "the origin carries the offset instead");
assert.equal(held.y, toLeft[0].y);
assert.equal(
  held.width,
  Math.max(...toLeft.map((p) => p.x)) - Math.min(...toLeft.map((p) => p.x)),
  "and the box is the span of the route",
);

// every route the three notations lay out is already square, either way round
for (const template of [FLOWCHART_TEMPLATE, BPMN_TEMPLATE, ORG_TEMPLATE]) {
  for (const heading of ["down", "right"] as const) {
    const drawn = computeLayout(parseDSL(template), heading);
    for (const edge of drawn.edges) {
      if (edge.points.length < 2) {
        continue;
      }
      assertSquare(edge.points, `${drawn.category} ${edge.from}->${edge.to}`);
    }
  }
}

// ---------------------------------------------------------------- copies

const mark = (unit: string, link?: object) => ({
  customData: { tingraph: { unit, kind: "node", ...(link ? { link } : {}) } },
});
const original = [
  { id: "box", groupIds: ["u1"], ...mark("u1") },
  { id: "cap", groupIds: ["u1"], ...mark("u1") },
  { id: "other", groupIds: ["u2"], ...mark("u2") },
  {
    id: "line",
    groupIds: [],
    ...mark("e1", { line: "report", from: { unit: "u1" }, to: { unit: "u2" }, at: "x" }),
  },
];
let stamp = 0;
const copied = [
  ...original,
  { id: "box~", groupIds: ["g9"], ...mark("u1") },
  { id: "cap~", groupIds: ["g9"], ...mark("u1") },
  { id: "other~", groupIds: ["g8"], ...mark("u2") },
  {
    id: "line~",
    groupIds: [],
    ...mark("e1", { line: "report", from: { unit: "u1" }, to: { unit: "u2" }, at: "x" }),
  },
];
const patched = renameCopies(copied, original, () => `c${++stamp}`);

assert.equal(patched.size, 4, "only the copies are renamed");
assert.equal(patched.get("box"), undefined, "the original keeps its name");
assert.equal(
  patched.get("box~")!.unit,
  patched.get("cap~")!.unit,
  "both pieces of one copy answer to the same new name",
);
assert.notEqual(patched.get("box~")!.unit, "u1", "which is not the original's");
assert.deepEqual(
  patched.get("box~")!.groupIds,
  [patched.get("box~")!.unit],
  "and the copy is a group of its own, not the original's",
);
assert.notEqual(
  patched.get("other~")!.unit,
  patched.get("box~")!.unit,
  "two copied elements stay two elements",
);
const tie = patched.get("line~")!.link!;
assert.equal(tie.from.unit, patched.get("box~")!.unit, "a copied line joins the copies");
assert.equal(tie.to.unit, patched.get("other~")!.unit, "at both ends");
assert.equal(tie.at, "", "and is re-cut where it was put down");

// a connector copied without the elements it joined comes away loose
const alone = renameCopies(
  [...original, { id: "line~", groupIds: [], ...mark("e1", { line: "report", from: { unit: "u1" }, to: { unit: "u2" }, at: "x" }) }],
  original,
  () => "c9",
);
assert.equal(alone.get("line~")!.link, null, "a line copied on its own is let go");

// a connector only reads as unchanged while both boxes stand where they were
const signature = linkSignature(
  parentBox,
  leftChild,
  { from: {}, to: {} },
  toLeft[0],
);
assert.equal(
  signature,
  linkSignature(parentBox, leftChild, { from: {}, to: {} }, toLeft[0]),
  "the same drawing reads the same",
);
assert.notEqual(
  signature,
  linkSignature(parentBox, { ...leftChild, y: 260 }, { from: {}, to: {} }, toLeft[0]),
  "a box that has moved reads different",
);
assert.notEqual(
  signature,
  linkSignature(parentBox, leftChild, { from: {}, to: {} }, { x: 0, y: 0 }),
  "and so does a connector dragged off its route",
);

// the samples the public pages type out are real source, not prose that looks
// like it: every one of them parses and lays out
for (const kind of READY_DIAGRAMS) {
  assert.ok(kind.sample, `${kind.id} has a sample`);
  const ast = parseDSL(kind.sample!);
  assert.equal(ast.category, kind.keyword, `${kind.id} sample opens with its own keyword`);
  computeLayout(ast, "down");
}

console.log("parse + layout self-check: all assertions passed");
