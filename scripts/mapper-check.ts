import assert from "node:assert";
import { parseDSL } from "../lib/parser/parse-dsl";
import { computeLayout } from "../lib/layout/compute-layout";
import {
  buildLaneSkeletons,
  buildPoolSkeletons,
  buildSkeletons,
} from "../lib/excalidraw-mapper/build-skeletons";
import { nodeUnit } from "../lib/excalidraw-mapper/build-skeletons";
import { unitOf } from "../lib/canvas/units";
import { inkFor } from "../lib/ink";
import {
  FLOWCHART_TEMPLATE,
  BPMN_TEMPLATE,
  ORG_TEMPLATE,
  BAR_TEMPLATE,
  LINE_TEMPLATE,
  PIE_TEMPLATE,
  SCATTER_TEMPLATE,
  MATRIX_TEMPLATE,
  USECASE_TEMPLATE,
  ACTIVITY_TEMPLATE,
  ERD_TEMPLATE,
  SEQUENCE_TEMPLATE,
} from "../lib/templates";

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
  const skeletons = byId(buildSkeletons(positioned, inkFor("mono")));
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
  positioned.edges.forEach((edge, i) => {
    const arrow = skeletons.get(`edge-${i}`);
    assert.ok(arrow && arrow.type === "arrow", `edge-${i} is arrow`);
    // a connector names the two elements it joins; nothing is bound
    const link = (arrow.customData as { tingraph?: { link?: Record<string, { unit: string }> } })
      ?.tingraph?.link;
    assert.ok(link, `edge-${i} carries a link`);
    assert.equal(link!.from.unit, nodeUnit(positioned.category, edge.from), `edge-${i} from`);
    assert.equal(link!.to.unit, nodeUnit(positioned.category, edge.to), `edge-${i} to`);
    assert.ok(!arrow.start && !arrow.end, `edge-${i} is not bound`);
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
const accented = byId(buildSkeletons(bpmn, inkFor("blue")));
assert.equal(accented.get("A1")?.strokeColor, "#1e3a8a");
const accentedXor = buildSkeletons(bpmn, inkFor("blue")).filter(
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
const poolLanes = marked.filter(
  (skeleton) => unitOf(skeleton as never)?.kind === "lane",
);
assert.ok(poolLanes.length > 0, "the pool has lane chrome");
for (const skeleton of poolLanes) {
  const laneMark = unitOf(skeleton as never)!;
  const groups = skeleton.groupIds as string[];
  assert.equal(laneMark.parent, poolMark?.unit, "each lane belongs to its pool");
  assert.equal(groups[groups.length - 1], poolMark?.unit, "pool is the lane's outer group");
}

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
    poolId: "pool-P1",
  }),
);
assert.deepEqual(
  lane.map((s) => s.type),
  ["line", "line", "text"],
  "new lane: split, header rule, caption",
);
assert.equal(lane[0].y, 110, "split sits on the lane top edge");
assert.ok(
  lane.every((piece) => (piece.groupIds as string[]).includes("pool-P1")),
  "a lane added on the canvas joins the pool group",
);

// ------------------------------------------------------------------ org chart

const orgPositioned = computeLayout(parseDSL(ORG_TEMPLATE));
const orgAll = indexByPrefix(buildSkeletons(orgPositioned, inkFor("blue")));
const orgById = byId(buildSkeletons(orgPositioned, inkFor("blue")));
const ORG_BLACK = "#111827";
const BLUE_WASH = "#7dd3fc";
const PILL_EDGE = "#d1d5db";

// the chart stays black on white; the ink shows up only as the band wash
for (const skeleton of orgAll) {
  const id = String(skeleton.id ?? "");
  if (id === "diagram-title") {
    continue;
  }
  const mark = unitOf(skeleton as { customData?: Record<string, unknown> });
  assert.ok(mark, `${id} carries a unit mark`);
  assert.equal((skeleton.groupIds as string[])[0], mark.unit, `${id} grouped`);
  assert.ok(
    skeleton.strokeColor === ORG_BLACK || skeleton.strokeColor === PILL_EDGE,
    `${id} is drawn in black or in the pill hairline, never in the ink`,
  );
}
assert.equal(orgById.get("diagram-title")?.strokeColor, ORG_BLACK, "title in black");

// role plus name: a washed band over a white body, both captioned
const band = orgById.get("DEAN") as Skel & { label?: { text: string } };
assert.equal(band.type, "rectangle");
assert.equal(band.backgroundColor, BLUE_WASH, "band carries the wash");
assert.equal(band.label?.text, "DEAN");
const body = orgById.get("DEAN-body") as Skel & { label?: { text: string } };
assert.equal(body.backgroundColor, "#ffffff", "body stays white");
assert.equal(
  body.label?.text.replace(/\n/g, " "),
  "Dr. Marion Hale",
  "the name is wrapped to the box",
);

// role only: a band and nothing else
assert.ok(orgById.has("SENATE"), "role-only box drawn");
assert.ok(!orgById.has("SENATE-body"), "role-only box has no body");

// role with sub-roles: a pill and a name for each one, inside the body
const pills = orgAll.filter((s) => /^LABS-unit-\d+$/.test(String(s.id ?? "")));
assert.equal(pills.length, 3, "one pill per sub-role");
assert.equal(
  (pills[1] as Skel & { label?: { text: string } }).label?.text,
  "Computing Lab",
);
assert.equal(pills[1].backgroundColor, BLUE_WASH, "pill carries the wash");
assert.equal(pills[1].strokeColor, PILL_EDGE, "pill keeps a hairline edge");
const subNames = orgAll.filter((s) => /^LABS-unit-\d+-name$/.test(String(s.id ?? "")));
assert.equal(subNames.length, 3, "one name per sub-role");
assert.equal(subNames[1].text, "Karel Sandvik, M.Sc");
const labBody = orgById.get("LABS-body") as Skel & { label?: unknown };
assert.ok(!labBody.label, "a box listing sub-roles carries no name of its own");

// every drawn row sits inside the box the layout reserved
const labNode = orgPositioned.nodes.find((n) => n.id === "LABS")!;
for (const piece of [...pills, ...subNames]) {
  const top = Number(piece.y);
  assert.ok(
    top >= labNode.y && top <= labNode.y + labNode.height,
    `${piece.id} stays inside its box`,
  );
}

// a reporting line names the two boxes it joins, so it is re-cut when either
// of them is dragged
type Linked = Skel & {
  customData?: { tingraph?: { link?: { line: string; from: { unit: string }; to: { unit: string } } } };
  endArrowhead?: unknown;
  strokeStyle?: string;
};
const orgArrows = orgAll.filter((s) => s.type === "arrow") as Linked[];
assert.equal(orgArrows.length, 11);
const toVd1 = orgArrows.find(
  (s) => s.customData?.tingraph?.link?.to.unit === "org-VD1",
)!;
assert.equal(
  toVd1.customData?.tingraph?.link?.from.unit,
  "org-DEAN",
  "the line names the box it reports to",
);
assert.equal(toVd1.customData?.tingraph?.link?.line, "report", "drawn as a reporting line");
assert.equal(toVd1.endArrowhead, "triangle");
assert.equal(toVd1.strokeStyle, "solid");
const tie = orgArrows.find((s) => s.strokeStyle === "dashed")!;
assert.ok(tie, "the advisory tie is dashed");
assert.equal(tie.endArrowhead, null, "an advisory tie carries no arrowhead");
assert.equal(
  tie.customData?.tingraph?.link?.line,
  "advisory",
  "and it says which line it is",
);

// the ink only moves the wash, and one preset washes the band plain white
const monochrome = byId(buildSkeletons(orgPositioned, inkFor("mono")));
assert.equal(monochrome.get("DEAN")?.backgroundColor, "#e5e7eb");
assert.equal(monochrome.get("DEAN")?.strokeColor, ORG_BLACK, "strokes ignore the ink");
const plain = byId(buildSkeletons(orgPositioned, inkFor("white")));
assert.equal(plain.get("DEAN")?.backgroundColor, "#ffffff", "white band");
assert.equal(plain.get("DEAN")?.strokeColor, ORG_BLACK, "white band keeps its rule");
assert.ok(
  unitOf(plain.get("DEAN") as never)?.wash,
  "the band says it carries the wash, so re-inking can find it",
);
assert.ok(
  !unitOf(plain.get("DEAN-body") as never)?.wash,
  "the white body is not a washed piece",
);



// ---------------------------------------------------------------------- charts

/**
 * A chart is drawn as ordinary shapes, and one of them carries the whole of it:
 * the frame holds the spec, which is what lets the settings panel, the handles
 * on the sheet and the source all be the same edit.
 */
for (const source of [BAR_TEMPLATE, LINE_TEMPLATE, PIE_TEMPLATE, SCATTER_TEMPLATE]) {
  const ast = parseDSL(source);
  const skeletons = buildSkeletons(computeLayout(ast)) as unknown as Array<
    Record<string, unknown>
  >;
  const frame = skeletons[0];
  assert.equal(frame.type, "rectangle", `${ast.category}: the frame comes first`);
  assert.equal(frame.strokeColor, "transparent", "and is not drawn");
  const mark = (frame.customData as { tingraph?: { kind?: string; figure?: unknown } })
    ?.tingraph;
  assert.equal(mark?.kind, "figure");
  assert.ok(mark?.figure, `${ast.category}: the frame carries the whole figure`);
  assert.ok(skeletons.length > 8, `${ast.category}: it has marks on it`);
  for (const piece of skeletons) {
    const own = (piece.customData as { tingraph?: { unit?: string } })?.tingraph;
    assert.equal(own?.unit, `${ast.category}-1`, "every piece belongs to the figure");
    assert.ok(
      Array.isArray(piece.groupIds) && (piece.groupIds as string[]).length === 1,
      "and moves with it",
    );
  }
  assert.ok(
    skeletons.every((piece) => piece.type !== "arrow"),
    `${ast.category}: a chart draws no connectors`,
  );
}

// a pie is drawn as closed lines, which is what Excalidraw fills
const pieParts = buildSkeletons(
  computeLayout(parseDSL(PIE_TEMPLATE)),
) as unknown as Array<Record<string, unknown>>;
const wedges = pieParts.filter(
  (piece) => piece.type === "line" && piece.backgroundColor !== "transparent",
);
assert.equal(wedges.length, 6, "one filled shape per slice");
for (const wedge of wedges) {
  const points = wedge.points as Array<[number, number]>;
  const [first] = points;
  const last = points[points.length - 1];
  assert.ok(
    Math.abs(first[0] - last[0]) < 1 && Math.abs(first[1] - last[1]) < 1,
    "a slice closes on itself, or Excalidraw will not fill it",
  );
}

// --------------------------------------------------------------- matrix table

const matrixParts = buildSkeletons(
  computeLayout(parseDSL(MATRIX_TEMPLATE)),
) as unknown as Array<Record<string, unknown>>;
const matrixFrame = matrixParts[0];
assert.equal(matrixFrame.type, "rectangle", "a matrix starts with its spec frame");
assert.equal(matrixFrame.strokeColor, "transparent", "and that frame is invisible");
assert.ok(
  matrixParts.some((piece) => piece.type === "text" && piece.text === "GENBA KAIZEN"),
  "a grouped column heading is drawn once",
);
assert.ok(
  matrixParts.some((piece) => piece.type === "text" && piece.text === "x"),
  "free-form cell text is drawn",
);
assert.ok(
  matrixParts.some((piece) => piece.type === "line"),
  "the table grid is drawn as one set of rules",
);
for (const piece of matrixParts) {
  const own = (piece.customData as { tingraph?: { unit?: string } })?.tingraph;
  assert.equal(own?.unit, "matrix-1", "every table piece belongs to the figure");
}

// ------------------------------------------------------------------ use case

const ucShapes = buildSkeletons(computeLayout(parseDSL(USECASE_TEMPLATE), "down"));
const ucById = byId(ucShapes);
const ucAll = indexByPrefix(ucShapes);
assert.equal(ucById.get("U1")?.type, "ellipse", "a use case is an oval");
assert.ok(
  (ucById.get("U1")?.label as { text?: string } | undefined)?.text?.includes("Check"),
  "with its goal written inside it",
);
const actorBox = ucById.get("CUST") as Skel | undefined;
assert.equal(actorBox?.type, "rectangle", "an actor carries a box for a line to tie to");
assert.equal(actorBox?.strokeColor, "transparent", "and that box is never drawn");
const actorPieces = ucAll.filter(
  (piece) => unitOf(piece as never)?.unit === nodeUnit("usecase", "CUST"),
);
assert.ok(actorPieces.length >= 5, "the stick figure is several shapes reading as one");
assert.ok(
  actorPieces.every((piece) => (piece.groupIds as string[]).includes("uc-CUST")),
  "so every one of them moves with it",
);
const ucFrame = ucAll.findIndex((piece) => piece.id === "frame-ATM");
assert.ok(ucFrame >= 0 && ucFrame < ucAll.findIndex((piece) => piece.id === "U1"),
  "the boundary is drawn before what stands inside it");
const includeArrow = ucAll.find(
  (piece) =>
    piece.type === "arrow" &&
    (piece.customData as { tingraph?: { link?: { line?: string } } })?.tingraph?.link
      ?.line === "include",
);
assert.ok(includeArrow, "an include is drawn as its own line");
assert.equal(includeArrow?.strokeStyle, "dashed", "dashed, the way UML draws it");

// ------------------------------------------------------------------ activity

const acShapes = buildSkeletons(computeLayout(parseDSL(ACTIVITY_TEMPLATE), "down"));
const acById = byId(acShapes);
const acAll = indexByPrefix(acShapes);
assert.equal(acById.get("S1")?.type, "ellipse", "an activity starts at a dot");
assert.equal(acById.get("S1")?.backgroundColor, "#1e1e1e", "and the dot is filled");
assert.equal(acById.get("E1")?.type, "ellipse", "and stops at a bullseye");
assert.ok(
  acAll.some((piece) => String(piece.id ?? "").startsWith("act-E1-dot")),
  "which is a ring with a filled circle inside it",
);
assert.equal(acById.get("D1")?.type, "diamond", "a decision is a diamond");
assert.equal(acById.get("A1")?.type, "rectangle", "an action is a box");
assert.deepEqual(
  acById.get("A1")?.roundness,
  { type: 3, value: 14 },
  "with the corners UML rounds",
);
const partitionFrame = acAll.findIndex((piece) => String(piece.id ?? "").startsWith("frame-"));
assert.ok(
  partitionFrame >= 0 && partitionFrame < acAll.findIndex((piece) => piece.id === "S1"),
  "the partitions are ruled before anything is drawn in them",
);
const laneName = acAll.find(
  (piece) => piece.type === "text" && piece.text === "Consultant",
);
assert.ok(laneName, "a partition is named");
assert.ok(!laneName?.angle, "and its name is upright, not turned on its side");
assert.equal(
  unitOf(laneName as never)?.kind,
  "lane",
  "the name belongs to the partition",
);
const activityFrame = acAll.find(
  (piece) => unitOf(piece as never)?.kind === "frame",
);
const activityFrameUnit = unitOf(activityFrame as never)?.unit;
assert.equal(
  unitOf(laneName as never)?.parent,
  activityFrameUnit,
  "an activity partition belongs to its pool",
);
assert.equal(
  (laneName?.groupIds as string[]).slice(-1)[0],
  activityFrameUnit,
  "the activity pool is the partition's outer group",
);

// ----------------------------------------------------------------------- erd

const erdShapes = buildSkeletons(computeLayout(parseDSL(ERD_TEMPLATE), "down"));
const erdAll = indexByPrefix(erdShapes);
const erdById = byId(erdShapes);
assert.equal(erdById.get("PASSENGER")?.type, "rectangle", "an entity is a box");
const erdBand = erdAll.find((piece) => String(piece.id ?? "").startsWith("erd-PASSENGER-band"));
assert.ok(erdBand, "with a band across the top");
assert.equal(erdBand?.backgroundColor, "#e5e7eb", "washed with the sheet's own tint");
assert.ok(unitOf(erdBand as never)?.wash, "and it says so, so re-inking can find it");
assert.equal(
  (erdBand?.label as { text?: string } | undefined)?.text,
  "passengers",
  "the band carries the table's name",
);
assert.ok(
  erdAll.some((piece) => piece.type === "text" && piece.text === "PK"),
  "a primary key is marked in the gutter",
);
assert.ok(
  erdAll.some((piece) => piece.type === "text" && piece.text === "varchar(50)?"),
  "and a nullable attribute says so on its type",
);
assert.ok(
  erdAll.some((piece) => String(piece.id ?? "").startsWith("erd-BAGGAGE-weak")),
  "a weak entity carries a second outline",
);
const relation = erdAll.find((piece) => piece.type === "arrow");
assert.equal(relation?.startArrowhead, "crowfoot_one", "one at the near end");
assert.equal(relation?.endArrowhead, "crowfoot_many", "many at the far end");

// ------------------------------------------------------------------ sequence

const seqShapes = buildSkeletons(
  computeLayout(parseDSL(SEQUENCE_TEMPLATE)),
) as unknown as Array<Record<string, unknown>>;
const seqFrame = seqShapes[0];
assert.equal(seqFrame.type, "rectangle", "the frame comes first");
assert.equal(seqFrame.strokeColor, "transparent", "and is not drawn");
const seqMark = (seqFrame.customData as { tingraph?: { kind?: string; figure?: unknown } })
  ?.tingraph;
assert.equal(seqMark?.kind, "figure");
assert.ok(seqMark?.figure, "and carries the whole diagram");
for (const piece of seqShapes) {
  const own = (piece.customData as { tingraph?: { unit?: string } })?.tingraph;
  assert.equal(own?.unit, "sequence-1", "every piece belongs to the figure");
}
assert.ok(
  seqShapes.some((piece) => piece.type === "arrow"),
  "a sequence diagram is the one figure that draws arrows of its own",
);
const lifelines = seqShapes.filter(
  (piece) => piece.type === "line" && piece.strokeStyle === "dashed",
);
assert.equal(lifelines.length, 4, "one dashed lifeline per participant");
assert.ok(
  seqShapes.some((piece) => piece.type === "text" && String(piece.text).startsWith("1: ")),
  "and the messages are numbered in the order they are sent",
);

console.log("mapper self-check: all assertions passed");
