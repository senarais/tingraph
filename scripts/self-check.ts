import assert from "node:assert";
import { parseDSL, detectCategory } from "@/lib/parser/parse-dsl";
import { computeLayout } from "@/lib/layout/compute-layout";
import { FLOWCHART_TEMPLATE, BPMN_TEMPLATE } from "@/lib/templates";
import { DSLError } from "@/lib/types";

assert.equal(detectCategory(FLOWCHART_TEMPLATE), "flow");
assert.equal(detectCategory(BPMN_TEMPLATE), "bpmn");
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

expectDSLError('x "Title" {}', 'must start with "flow" or "bpmn"');
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

console.log("parse + layout self-check: all assertions passed");
