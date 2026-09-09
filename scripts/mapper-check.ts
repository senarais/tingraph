import assert from "node:assert";
import { parseDSL } from "../lib/parser/parse-dsl";
import { computeLayout } from "../lib/layout/compute-layout";
import {
  buildLaneSkeletons,
  buildPoolSkeletons,
  buildSkeletons,
} from "../lib/excalidraw-mapper/build-skeletons";
import { unitOf } from "../lib/canvas/units";
import { FLOWCHART_TEMPLATE, BPMN_TEMPLATE } from "../lib/templates";

type Skel = Record<string, unknown> & {
  id?: string;
  type: string;
  text?: string;
};

function indexByPrefix(skeletons: unknown[]): Skel[] {
  return skeletons.map((s) => s as Skel);
}

function byId(skeletons: unknown[]): Map<string, Skel> {
  return new Map(
    skeletons.map((s) => [String((s as Skel).id ?? ""), s as Skel]),
  );
}

// --- both templates produce skeletons
for (const tpl of [FLOWCHART_TEMPLATE, BPMN_TEMPLATE]) {
  const positioned = computeLayout(parseDSL(tpl));
  const skeletons = byId(buildSkeletons(positioned, "#1e1e1e"));
  assert.ok(skeletons.size > 0, "skeletons produced");
  const title = skeletons.get("diagram-title");
  assert.ok(title && title.type === "text", "title element present");
  for (const n of positioned.nodes) {
    if (n.type === "data") continue; // data object = line outline, no container id
    const el = skeletons.get(n.id);
    assert.ok(el, `node ${n.id} mapped`);
    assert.equal(el.roughness, 0, "roughness 0");
    assert.equal(el.strokeColor, "#1e1e1e", "stroke color");
    assert.equal(el.fillStyle, "solid", "solid fill");
    assert.equal(el.opacity, 100, "opaque");
  }
  const typeOf = new Map(positioned.nodes.map((n) => [n.id, n.type]));
  positioned.edges.forEach((edge, i) => {
    const arrow = skeletons.get(`edge-${i}`);
    assert.ok(arrow && arrow.type === "arrow", `edge-${i} is arrow`);
    // outlines (data objects) carry no bindable container, so they stay free
    assert.equal(
      !!arrow.start,
      typeOf.get(edge.from) !== "data",
      `edge-${i} start binding`,
    );
    assert.equal(
      !!arrow.end,
      typeOf.get(edge.to) !== "data",
      `edge-${i} end binding`,
    );
    const points = arrow.points as unknown[];
    assert.ok(Array.isArray(points) && points.length >= 2, "polyline points");
    if (positioned.category === "bpmn") {
      if (edge.kind === "association") {
        assert.equal(arrow.strokeStyle, "dotted", "association dotted");
        assert.equal(arrow.endArrowhead, "triangle_outline", "association open head");
      } else {
        assert.equal(arrow.endArrowhead, "triangle", "sequence flow filled head");
      }
    }
  });
}

// --- flow shape mapping unchanged
const flow = computeLayout(parseDSL(FLOWCHART_TEMPLATE));
const flowS = byId(buildSkeletons(flow));
assert.equal(flowS.get("S1")?.type, "ellipse");
assert.equal(flowS.get("E1")?.type, "ellipse");
assert.equal(flowS.get("P1")?.type, "rectangle");
assert.equal(flowS.get("D1")?.type, "diamond");
assert.equal(flowS.get("I1")?.backgroundColor, "#e5e7eb", "io shaded gray");
const flowLabel = (flowS.get("P1")?.label as { text?: string } | undefined)?.text;
assert.equal(flowLabel, "Execute Algorithm", "flow node label bound");
assert.equal(flowS.get("P1")?.fontFamily, 2, "formal sans-serif font");

// --- BPMN mapping (bpmn-js fidelity)
const bpmn = computeLayout(parseDSL(BPMN_TEMPLATE));
const bpmnS = byId(buildSkeletons(bpmn));
const all = indexByPrefix(buildSkeletons(bpmn));

// events are circles with the right stroke widths
assert.equal(bpmnS.get("S1")?.type, "ellipse");
assert.equal(bpmnS.get("S1")?.strokeWidth, 2, "start event 2px");
assert.equal(bpmnS.get("E1")?.strokeWidth, 4, "end event 4px");
assert.equal(bpmnS.get("S1")?.backgroundColor, "#ffffff", "white fill");

// tasks: rounded rect with bound label
assert.equal(bpmnS.get("A1")?.type, "rectangle");
const taskRoundness = bpmnS.get("A1")?.roundness as { type: number; value?: number } | null;
assert.ok(taskRoundness && taskRoundness.type === 3, "task roundness type 3");
assert.equal(taskRoundness?.value, 10, "task rx 10");
const taskLabel = (bpmnS.get("A1")?.label as { text?: string; fontSize?: number } | undefined);
assert.equal(taskLabel?.text, "Fill vacation form", "task label bound");
assert.equal(taskLabel?.fontSize, 12, "task label 12px");

// send task: filled envelope marker
const sendIcons = all.filter((s) => String(s.id ?? "").startsWith("A2-send"));
assert.ok(sendIcons.length >= 1, "send-task envelope icon");
assert.equal(sendIcons[0].backgroundColor, "#1e1e1e", "send envelope filled black");

// gateways: diamond + markers
assert.equal(bpmnS.get("G1")?.type, "diamond");
const xorIcons = all.filter((s) => String(s.id ?? "").startsWith("G1-xor"));
assert.ok(xorIcons.length === 1, "gw-ex X icon (single closed path)");
assert.equal(xorIcons[0].backgroundColor, "#1e1e1e", "gw-ex X filled");

// external labels under events/gateways
const g1Label = bpmnS.get("G1-label") as Skel | undefined;
assert.ok(g1Label && g1Label.type === "text", "gateway external label");
assert.equal(g1Label?.fontSize, 11, "external label 11px");
assert.equal(g1Label?.text, "Approved?", "gateway label text");
const s1Label = bpmnS.get("S1-label") as Skel | undefined;
assert.ok(s1Label && s1Label.text === "Submit request", "event external label");

// data object: folded-corner outline via DATA_OBJECT_PATH
const dataLines = all.filter((s) => String(s.id ?? "").startsWith("D1-doc"));
assert.ok(dataLines.length >= 1, "data object outline");
assert.equal(dataLines[0].type, "line");
assert.equal(dataLines[0].strokeWidth, 2, "data object 2px");
const dataLabel = bpmnS.get("D1-label") as Skel | undefined;
assert.equal(dataLabel?.text, "Request log", "data object label");

// icon + label share group with container so dragging moves everything
const taskGroups = bpmnS.get("A1")?.groupIds as string[] | undefined;
assert.ok(taskGroups?.includes("bpmn-A1"), "task grouped");
const sendGroups = sendIcons[0].groupIds as string[];
assert.ok(sendGroups.includes("bpmn-A2"), "icon grouped with task");

// pool + lane chrome: one pool box, split lines between lanes, header bands
const poolRect = bpmnS.get("pool-P1");
assert.ok(poolRect && poolRect.type === "rectangle", "pool rectangle");
assert.equal(bpmnS.get("pool-P1-divider")?.type, "line", "pool header divider");
assert.ok(!bpmnS.has("lane-L1-split"), "first lane reuses the pool border");
for (const id of ["lane-L2-split", "lane-L3-split"]) {
  assert.equal(bpmnS.get(id)?.type, "line", `${id} splits the pool`);
}
for (const id of ["lane-L1-divider", "lane-L2-divider", "lane-L3-divider"]) {
  assert.equal(bpmnS.get(id)?.type, "line", `${id} header divider`);
}
const poolLabel = bpmnS.get("pool-P1-label") as Skel | undefined;
assert.ok(poolLabel && poolLabel.type === "text" && poolLabel.text === "Request", "pool label");
const laneLabel = bpmnS.get("lane-L1-label") as Skel | undefined;
assert.ok(laneLabel && laneLabel.text === "Employee", "lane label");
const ordered = indexByPrefix(buildSkeletons(bpmn));
const idxOf = (id: string) => ordered.findIndex((s) => s.id === id);
assert.ok(idxOf("pool-P1") >= 0 && idxOf("pool-P1") < idxOf("S1"), "pool drawn before nodes");
assert.ok(idxOf("lane-L2-split") < idxOf("G1"), "lane chrome drawn before nodes");

// conditional flows carry their own caption next to the gateway
const yes = bpmnS.get("edge-3-label") as Skel | undefined;
assert.equal(yes?.text, "Yes", "conditional flow caption");
assert.equal(yes?.fontSize, 11, "edge caption 11px");
assert.equal(bpmnS.get("edge-5-label")?.text, "No", "second conditional caption");
assert.ok(!bpmnS.has("edge-0-label"), "unlabelled flows have no caption");

// extended event/task marker mapping (not in the default template)
const ext = computeLayout(
  parseDSL(
    'bpmn "Ext" {\n  msg-start S "s"\n  timer T "t"\n  script-task W "w"\n  user-task U "u"\n  recv-task R "r"\n  msg-end E "e"\n  S -> T -> W\n  U -> R -> E\n}',
  ),
);
const extS = byId(buildSkeletons(ext));
const extAll = indexByPrefix(buildSkeletons(ext));
assert.equal(extS.get("S")?.type, "ellipse");
assert.equal(extS.get("S")?.strokeWidth, 2, "msg-start 2px");
assert.equal(extS.get("E")?.strokeWidth, 4, "msg-end 4px");
assert.equal(extS.get("T")?.strokeWidth, 1.5, "timer outer 1.5px");
const ticks = extAll.filter((s) => /T-tick-\d+-/.test(String(s.id ?? "")));
assert.equal(ticks.length, 12, "12 timer ticks");
const msgIcons = extAll.filter((s) => String(s.id ?? "").startsWith("S-msg"));
assert.ok(msgIcons.length >= 1, "msg-start envelope icon");
assert.equal(msgIcons[0].backgroundColor, "#ffffff", "catch envelope white");

// accent override
const accented = byId(buildSkeletons(bpmn, "#1e3a8a"));
assert.equal(accented.get("A1")?.strokeColor, "#1e3a8a");
const accentedXor = buildSkeletons(bpmn, "#1e3a8a").filter(
  (s) => String((s as Skel).id ?? "").startsWith("G1-xor"),
);
assert.equal(
  (accentedXor[0] as Skel).backgroundColor,
  "#1e3a8a",
  "gateway marker follows accent",
);

// --- every piece of an element is stamped for the one-shape rule
const marked = indexByPrefix(buildSkeletons(bpmn));
for (const skeleton of marked) {
  const mark = unitOf(skeleton as { customData?: Record<string, unknown> });
  const id = String(skeleton.id ?? "");
  if (id === "diagram-title") {
    continue; // the sheet title stands on its own
  }
  assert.ok(mark, `${id} carries a unit mark`);
  const groupIds = (skeleton.groupIds ?? []) as string[];
  assert.equal(groupIds[0], mark.unit, `${id} sits in its unit group`);
}
// marker strokes ride along; they are never a selection of their own
const xorMark = unitOf(
  marked.find((s) => String(s.id ?? "").startsWith("G1-xor")) as never,
);
assert.equal(xorMark?.unit, "bpmn-G1", "gateway marker belongs to its gateway");
assert.ok(!xorMark?.core, "gateway marker is not selectable on its own");
assert.ok(unitOf(bpmnS.get("A1") as never)?.core, "task box is selectable");

// --- pool boxes carry the band widths later edits need
const poolBox = marked.find(
  (s) => s.type === "rectangle" && String(s.id ?? "").startsWith("pool-"),
);
const poolMark = unitOf(poolBox as never);
assert.equal(poolMark?.kind, "pool", "pool box marked as a pool");
assert.equal(typeof poolMark?.band, "number", "pool records its header band");
assert.equal(typeof poolMark?.laneBand, "number", "pool records its lane band");

// --- a pool added on the canvas draws box, rule and rotated caption
const fresh = indexByPrefix(
  buildPoolSkeletons({
    id: "new",
    label: "Pool 4",
    x: 0,
    y: 0,
    width: 400,
    height: 110,
    headerWidth: 30,
    lanes: [],
  }),
);
assert.deepEqual(
  fresh.map((s) => s.type),
  ["rectangle", "line", "text"],
  "new pool: box, header rule, caption",
);
assert.ok(
  fresh.every((s) => unitOf(s as never)?.unit === "pool-new"),
  "new pool is one unit",
);

// --- a lane added on the canvas draws its split, rule and caption
const lane = indexByPrefix(
  buildLaneSkeletons({
    id: "new",
    label: "Lane 2",
    x: 30,
    y: 110,
    width: 370,
    height: 110,
    headerWidth: 30,
  }),
);
assert.deepEqual(
  lane.map((s) => s.type),
  ["line", "line", "text"],
  "new lane: split, header rule, caption",
);
assert.equal(lane[0].y, 110, "split sits on the lane top edge");

console.log("mapper self-check: all assertions passed");
