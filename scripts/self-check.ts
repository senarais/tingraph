import assert from "node:assert";
import { parseDSL, detectCategory } from "@/lib/parser/parse-dsl";
import { computeLayout } from "@/lib/layout/compute-layout";
import { FLOWCHART_TEMPLATE, BPMN_TEMPLATE, ORG_TEMPLATE } from "@/lib/templates";
import { DSLError } from "@/lib/types";
import { squareRoute, type Corner } from "@/lib/canvas/route";

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
const dekan = orgAst.nodes.find((n) => n.id === "DEKAN");
assert.equal(dekan?.name, "Dr. Gumgum Gumelar F. R, M.Si");
assert.equal(
  orgAst.nodes.find((n) => n.id === "SENAT")?.name,
  undefined,
  "a role with one caption carries no name",
);
const lab = orgAst.nodes.find((n) => n.id === "LAB");
assert.equal(lab?.entries?.length, 3, "sub-roles parsed");
assert.equal(lab?.entries?.[1].label, "Lab. Komputer");
assert.equal(lab?.entries?.[1].name, "Fildzah Rudyah P. M.Si");
assert.equal(
  orgAst.edges.find((e) => e.to === "SENAT")?.kind,
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
assert.equal(at("WD1").y, at("LAB").y, "siblings share a row");
assert.ok(at("WD1").y > at("DEKAN").y + at("DEKAN").height, "children sit below");
assert.equal(at("SENAT").y, at("DEKAN").y, "the satellite rides beside its host");
assert.ok(
  at("SENAT").x >= at("DEKAN").x + at("DEKAN").width,
  "the satellite sits to the right of its host",
);
// a role with no name is a band and nothing else
assert.ok(at("SENAT").height < at("DEKAN").height, "a role-only box is shorter");
// the parent is centred over the run of its children
const kids = ["WD1", "WD2", "WD3", "LAB", "S1", "S2", "GPJM"].map(at);
const runCentre =
  (kids[0].x +
    kids[0].width / 2 +
    kids[kids.length - 1].x +
    kids[kids.length - 1].width / 2) /
  2;
assert.ok(
  Math.abs(at("DEKAN").x + at("DEKAN").width / 2 - runCentre) <= 1,
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
    .filter((e) => e.reporting && e.from === "DEKAN" && e.points.length === 4)
    .map((e) => e.points[1].y),
);
assert.equal(rails.size, 1, "children of one box share a single rail");
assert.ok(
  !org.edges.find((e) => e.to === "SENAT")?.reporting,
  "a dotted tie is not a reporting line",
);

// a cycle degrades to a plain connector rather than looping forever
const cyclic = computeLayout(
  parseDSL('org "C" { role A "A"\n  role B "B"\n  A -> B\n  B -> A }'),
);
assert.equal(cyclic.nodes.length, 2);
assert.equal(cyclic.edges.filter((e) => e.reporting).length, 1);

// ------------------------------------------------------------- square routes

/** Every leg of a route has to run either straight down or straight across. */
function assertSquare(points: readonly Corner[], what: string): void {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    assert.ok(
      Math.abs(a[0] - b[0]) < 0.01 || Math.abs(a[1] - b[1]) < 0.01,
      `${what}: leg ${i} runs at a slant (${a} -> ${b})`,
    );
  }
}

// a route that is already square is left exactly as it is
assert.equal(
  squareRoute([
    [0, 0],
    [0, 40],
    [80, 40],
    [80, 90],
  ]),
  null,
  "a square route needs no repair",
);
assert.equal(squareRoute([[0, 0], [0, 50]]), null, "a straight leg is square");

// the ends stay put and the corners are re-cut against them
const dragged = squareRoute([
  [0, 0],
  [3, 40],
  [80, 40],
  [130, 90],
]) as Corner[];
assertSquare(dragged, "dragged route");
assert.deepEqual(dragged[0], [0, 0], "the start does not move");
assert.deepEqual(dragged[dragged.length - 1], [130, 90], "the end does not move");
assert.deepEqual(dragged, [
  [0, 0],
  [0, 40],
  [130, 40],
  [130, 90],
]);

// a route that runs across the page keeps running across
const sideways = squareRoute([
  [0, 0],
  [40, 6],
  [40, 60],
  [90, 70],
]) as Corner[];
assertSquare(sideways, "sideways route");
assert.deepEqual(sideways, [
  [0, 0],
  [40, 0],
  [40, 70],
  [90, 70],
]);

// a two-point slant grows a step, taken along the longer run
const stepped = squareRoute([[0, 0], [60, 200]]) as Corner[];
assertSquare(stepped, "stepped route");
assert.equal(stepped.length, 4);
assert.deepEqual(stepped[1], [0, 100], "it leaves downwards, the longer run");
const across = squareRoute([[0, 0], [200, 60]]) as Corner[];
assertSquare(across, "across route");
assert.deepEqual(across[1], [100, 0], "it leaves sideways, the longer run");

// a longer route keeps every one of its bends
const long = squareRoute([
  [0, 0],
  [5, 30],
  [50, 30],
  [50, 70],
  [120, 74],
]) as Corner[];
assertSquare(long, "long route");
assert.equal(long.length, 5);
assert.deepEqual(long[long.length - 1], [120, 74]);

// a corner that lands on the far end collapses instead of doubling back
const collapsed = squareRoute([
  [0, 0],
  [4, 40],
  [80, 40],
  [0, 90],
]) as Corner[];
assertSquare(collapsed, "collapsed route");
assert.deepEqual(collapsed, [[0, 0], [0, 90]], "it straightens out");

// repairing twice changes nothing more
assert.equal(squareRoute(dragged), null, "the repair settles");
assert.equal(squareRoute(long), null, "the repair settles on long routes");
assert.equal(squareRoute(stepped), null, "the repair settles on new steps");

// every route the three notations lay out is already square
for (const template of [FLOWCHART_TEMPLATE, BPMN_TEMPLATE, ORG_TEMPLATE]) {
  const drawn = computeLayout(parseDSL(template));
  for (const edge of drawn.edges) {
    const corners = edge.points.map((p) => [p.x, p.y] as Corner);
    if (corners.length < 2) {
      continue;
    }
    assertSquare(corners, `${drawn.category} ${edge.from}->${edge.to}`);
    assert.equal(
      squareRoute(corners),
      null,
      `${drawn.category} ${edge.from}->${edge.to} needs no repair`,
    );
  }
}

console.log("parse + layout self-check: all assertions passed");
