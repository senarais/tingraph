import assert from "node:assert";
import { parseDSL } from "../lib/parser/parse-dsl";
import { computeLayout } from "../lib/layout/compute-layout";
import { buildSkeletons } from "../lib/excalidraw-mapper/build-skeletons";
import { shapeFamily } from "../lib/layout/compute-layout";
import { controlsFor, held } from "../lib/canvas/inspect";
import { unitOf } from "../lib/canvas/units";
import Module from "node:module";
import { createRequire } from "node:module";
import type { PoolBox } from "../lib/canvas/scene";
import type { FrameBox } from "../lib/canvas/frames";
import { jpegToPdf } from "../lib/export/pdf";
import { promptFor, GUIDE_SECTIONS } from "../lib/guide";
import { refuses, systemPrompt, unfence } from "../lib/ai/chat";
import { avatarProblem, otpType, readProfile, safeNext } from "../lib/auth";
import { customInk, inkFor, washFor } from "../lib/ink";
import { isPlanTier, PLAN_LIMITS, planName } from "../lib/plans";
import { styleFor } from "../lib/sheet";
import { diagramTitle, readSavedDiagram } from "../lib/saved-diagrams";
import type { Json } from "../lib/supabase/database.types";
import {
  FLOWCHART_TEMPLATE,
  BPMN_TEMPLATE,
  ORG_TEMPLATE,
  TEMPLATES,
} from "../lib/templates";
import { isSettable, type DiagramCategory, type DSLNode } from "../lib/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

type Skel = Record<string, unknown> & { id?: string; type: string };

/**
 * The scene rules, without a browser.
 *
 * `lib/canvas/scene.ts` keeps the sheet honest — it re-forms groups, decides
 * what a double click may reach, and edits pools — and all of that is ordinary
 * logic worth asserting. It only touches Excalidraw for two helpers that need
 * a DOM to import, so those two are stood in for here and the rules underneath
 * are checked directly.
 */
const loader = Module as unknown as {
  _load: (request: string, parent: unknown, main: boolean) => unknown;
};
const loadModule = loader._load;
loader._load = function (request: string, parent: unknown, main: boolean) {
  if (request === "@excalidraw/excalidraw") {
    return {
      newElementWith: (element: object, patch: object) => ({ ...element, ...patch }),
      convertToExcalidrawElements: (skeletons: unknown[]) => skeletons,
    };
  }
  return loadModule.call(this, request, parent, main);
};
const require_ = createRequire(__filename);
const scene = require_("../lib/canvas/scene") as typeof import("../lib/canvas/scene");
const { linkTargets, normalizeUnits, removeLane, resizePoolLane } = scene;
const elements = require_("../lib/canvas/elements") as typeof import("../lib/canvas/elements");
const erd = require_("../lib/canvas/erd") as typeof import("../lib/canvas/erd");
const frames = require_("../lib/canvas/frames") as typeof import("../lib/canvas/frames");

const byId = (skeletons: unknown[]) =>
  new Map(skeletons.map((s) => [String((s as Skel).id ?? ""), s as Skel]));

// ------------------------------------------------------- the drawing styles

const flow = computeLayout(parseDSL(FLOWCHART_TEMPLATE));
const formal = byId(buildSkeletons(flow, inkFor("mono"), styleFor("formal")));
const playful = byId(buildSkeletons(flow, inkFor("mono"), styleFor("playful")));

assert.equal(formal.get("P1")?.roughness, 0, "formal draws true lines");
assert.equal(formal.get("P1")?.fontFamily, 2, "formal sets in the formal sans");
assert.equal(formal.get("P1")?.roundness, null, "formal keeps a step square");

assert.equal(playful.get("P1")?.roughness, 1, "playful wobbles the line");
assert.equal(playful.get("P1")?.fontFamily, 5, "playful writes by hand");
assert.deepEqual(
  playful.get("P1")?.roundness,
  { type: 3, value: 14 },
  "playful rounds a step",
);
// the notation still owns the shapes it defines
assert.equal(playful.get("S1")?.type, "ellipse", "a terminator stays an ellipse");
assert.equal(playful.get("S1")?.roundness, null, "an ellipse has no corners");
assert.equal(
  (playful.get("edge-0") as Skel).endArrowhead,
  "triangle",
  "the arrowhead is the notation's, in either style",
);

const bpmnPlayful = byId(
  buildSkeletons(computeLayout(parseDSL(BPMN_TEMPLATE)), inkFor("mono"), styleFor("playful")),
);
assert.deepEqual(
  bpmnPlayful.get("A1")?.roundness,
  { type: 3, value: 10 },
  "a BPMN task keeps its own 10px outline whatever the style",
);
assert.equal(bpmnPlayful.get("E1")?.strokeWidth, 4, "an end event keeps its ring");

// a style change reaches only the boxes the notation leaves free
const org = buildSkeletons(
  computeLayout(parseDSL(ORG_TEMPLATE)),
  inkFor("mono"),
  styleFor("playful"),
) as Skel[];
const soft = org.filter(
  (s) => (s.customData as { tingraph?: { soft?: true } })?.tingraph?.soft,
);
assert.ok(soft.length > 0, "an org box is a box a style may round");
for (const piece of soft) {
  assert.deepEqual(piece.roundness, { type: 3, value: 14 }, `${piece.id} rounded`);
}

// ----------------------------------------- BPMN lane boundaries share space
{
  const pool: PoolBox = {
    unit: "pool-R",
    label: "Pool",
    x: 0,
    y: 0,
    width: 600,
    height: 200,
    band: 30,
    laneBand: 24,
    lanes: [
      { unit: "lane-A", label: "A", top: 0, bottom: 100 },
      { unit: "lane-B", label: "B", top: 100, bottom: 200 },
    ],
  };
  const pieces = [
    fake("rectangle", { unit: pool.unit, kind: "pool", core: true }, {
      id: "body", x: 0, y: 0, width: 600, height: 200,
    }),
    fake("line", { unit: pool.unit, kind: "pool" }, {
      id: "pool-rule", x: 30, y: 0, width: 0, height: 200,
    }),
    fake("text", { unit: pool.unit, kind: "pool", core: true }, {
      id: "pool-name", x: 10, y: 90, width: 20, height: 20,
      text: "Request", originalText: "Request",
    }),
    fake("line", { unit: "lane-A", kind: "lane", parent: pool.unit }, {
      id: "a-rule", x: 54, y: 0, width: 0, height: 100,
    }),
    fake("text", { unit: "lane-A", kind: "lane", parent: pool.unit, core: true }, {
      id: "a-name", x: 35, y: 40, width: 20, height: 20,
      text: "Employee", originalText: "Employee",
    }),
    fake("line", { unit: "lane-B", kind: "lane", parent: pool.unit }, {
      id: "split", x: 30, y: 100, width: 570, height: 0,
    }),
    fake("line", { unit: "lane-B", kind: "lane", parent: pool.unit }, {
      id: "b-rule", x: 54, y: 100, width: 0, height: 100,
    }),
    fake("text", { unit: "lane-B", kind: "lane", parent: pool.unit, core: true }, {
      id: "b-name", x: 35, y: 140, width: 20, height: 20,
      text: "Manager", originalText: "Manager",
    }),
    fake("rectangle", undefined, { id: "below", x: 0, y: 260, width: 40, height: 40 }),
  ];
  const described = scene.poolBoxes(pieces)[0];
  assert.equal(described.label, "Request", "the BPMN panel reads the pool name");
  assert.deepEqual(
    described.lanes.map((lane) => lane.label),
    ["Employee", "Manager"],
    "and reads every lane name in order",
  );
  const renamed = scene.renamePoolPart(pieces, "lane-A", "Operations");
  assert.equal(
    (renamed.find((element) => element.id === "a-name") as { text?: string }).text,
    "Operations",
    "a lane name can be rewritten without opening its group",
  );
  const traded = resizePoolLane(pieces, pool, 0, 130);
  const find = (all: ExcalidrawElement[], id: string) => all.find((element) => element.id === id)!;
  assert.equal(find(traded, "body").height, 200, "an internal divider keeps pool height");
  assert.equal(find(traded, "split").y, 130, "the divider follows the hand");
  assert.equal(find(traded, "a-rule").height, 130, "the upper lane grows");
  assert.equal(find(traded, "b-rule").y, 130, "the lower lane starts at the divider");
  assert.equal(find(traded, "b-rule").height, 70, "and gives that space to its neighbour");

  const resizedPool = scene.poolBoxes(traded)[0];
  const grown = resizePoolLane(traded, resizedPool, 1, 250);
  assert.equal(find(grown, "body").height, 250, "the outer edge grows the pool");
  assert.equal(find(grown, "pool-rule").height, 250, "its header rule grows too");
  assert.equal(find(grown, "b-rule").height, 120, "the last lane takes the new space");
  assert.equal(find(grown, "below").y, 310, "content below makes room");
}

// ------------------------------------- activity partitions share frame width
{
  const frame: FrameBox = {
    unit: "frame-R",
    label: "",
    x: 0,
    y: 0,
    width: 380,
    height: 240,
    head: 32,
    lanes: [
      { unit: "lane-A", label: "A", x: 0, width: 190 },
      { unit: "lane-B", label: "B", x: 190, width: 190 },
    ],
  };
  const pieces = [
    fake("rectangle", { unit: frame.unit, kind: "frame", core: true }, {
      id: "frame", x: 0, y: 0, width: 380, height: 240,
    }),
    fake("line", { unit: frame.unit, kind: "frame" }, {
      id: "head", x: 0, y: 32, width: 380, height: 0,
    }),
    fake("text", { unit: "lane-A", kind: "lane", parent: frame.unit, core: true }, {
      id: "a", x: 85, y: 8, width: 20, height: 16,
    }),
    fake("line", { unit: "lane-B", kind: "lane", parent: frame.unit }, {
      id: "divider", x: 190, y: 0, width: 0, height: 240,
    }),
    fake("text", { unit: "lane-B", kind: "lane", parent: frame.unit, core: true }, {
      id: "b", x: 275, y: 8, width: 20, height: 16,
    }),
    fake("rectangle", undefined, { id: "right", x: 440, y: 0, width: 40, height: 40 }),
  ];
  const traded = frames.resizeColumn(pieces, frame, 0, 240);
  const find = (all: ExcalidrawElement[], id: string) => all.find((element) => element.id === id)!;
  assert.equal(find(traded, "frame").width, 380, "an internal rule keeps frame width");
  assert.equal(find(traded, "divider").x, 240, "the partition rule follows the hand");
  const resizedFrame = frames.partitionFrames(traded)[0];
  assert.deepEqual(
    resizedFrame.lanes.map((lane) => lane.width),
    [240, 140],
    "one partition grows by exactly what its neighbour gives up",
  );
  const grown = frames.resizeColumn(traded, resizedFrame, 1, 450);
  assert.equal(find(grown, "frame").width, 450, "the outer edge grows the frame");
  assert.equal(find(grown, "head").width, 450, "the header follows the frame");
  assert.equal(find(grown, "right").x, 510, "content to the right makes room");
}

// ------------------------------------------ structure is not an arrow target
{
  const pool = fake("rectangle", { unit: "pool-P", kind: "pool", core: true }, {
    id: "pool-target", x: 0, y: 0, width: 500, height: 200,
  });
  const lane = fake("text", { unit: "lane-L", kind: "lane", parent: "pool-P", core: true }, {
    id: "lane-target", x: 20, y: 80, width: 20, height: 20,
  });
  const task = fake("rectangle", { unit: "bpmn-A", kind: "node", core: true }, {
    id: "task-target", x: 100, y: 60, width: 100, height: 80,
  });
  const targets = linkTargets([
    pool,
    lane,
    task,
  ]);
  assert.deepEqual([...targets.keys()], ["bpmn-A"], "arrows target nodes, not pools or lanes");

  const invalid = fake("arrow", {
    unit: "line-lane",
    kind: "edge",
    core: true,
    link: { line: "sequence", from: { unit: "bpmn-A" }, to: { unit: "lane-L" }, at: "old" },
  }, { id: "invalid-line", x: 100, y: 100, width: 80, height: 0, points: [[0, 0], [80, 0]] });
  const cleaned = scene.syncConnectors(
    [
      pool,
      lane,
      task,
      invalid,
    ],
    { category: "bpmn", direction: "down" },
  );
  assert.equal(
    cleaned!.find((element) => element.id === invalid.id)!.isDeleted,
    true,
    "an existing connector tied to a lane is removed",
  );
}

// ----------------------------------------------- pool and lanes are one hold
{
  const body = fake(
    "rectangle",
    { unit: "pool-P1", kind: "pool", core: true },
    { id: "pool", groupIds: ["pool-P1"], x: 0, y: 0, width: 600, height: 220 },
  );
  const split = fake(
    "line",
    { unit: "lane-L2", kind: "lane" },
    { id: "split", groupIds: ["lane-L2"], x: 30, y: 110, width: 570, height: 0 },
  );
  const label = fake(
    "text",
    { unit: "lane-L2", kind: "lane", core: true },
    { id: "label", groupIds: ["lane-L2"], x: 40, y: 145, width: 18, height: 40 },
  );
  const fixed = normalizeUnits([body, split, label], {
    selectedElementIds: { label: true },
    selectedGroupIds: {},
    editingGroupId: null,
  });
  assert.deepEqual(
    Object.keys(fixed!.appState!.selectedElementIds).sort(),
    ["label", "pool", "split"],
    "taking one lane holds the whole pool",
  );
  const migrated = fixed!.elements!;
  assert.equal(
    unitOf(migrated.find((element) => element.id === "split")!)?.parent,
    "pool-P1",
    "an open scene gains the missing lane parent without regeneration",
  );
  const steppedIntoLane = normalizeUnits(migrated, {
    selectedElementIds: { label: true },
    selectedGroupIds: {},
    editingGroupId: "lane-L2",
  });
  assert.equal(steppedIntoLane!.appState!.editingGroupId, null, "a lane has no inside");
  assert.deepEqual(
    Object.keys(steppedIntoLane!.appState!.selectedElementIds).sort(),
    ["label", "pool", "split"],
    "double-clicking a lane still holds the whole pool",
  );
  assert.deepEqual(
    steppedIntoLane!.appState!.selectedGroupIds,
    { "pool-P1": true },
    "the selected group stays the outer pool",
  );

  const ungrouped = migrated.map((element) =>
    element.id === "split"
      ? ({ ...element, groupIds: ["lane-L2"] } as ExcalidrawElement)
      : element,
  );
  const repaired = normalizeUnits(ungrouped, {
    selectedElementIds: {},
    selectedGroupIds: {},
    editingGroupId: null,
  });
  assert.deepEqual(
    repaired!.elements!.find((element) => element.id === "split")!.groupIds,
    ["lane-L2", "pool-P1"],
    "ungroup cannot detach a lane from its pool",
  );
}

// ------------------------------------------------- what the panel may offer

/** A stand-in for what the canvas hands the panel. */
function fake(
  type: string,
  mark?: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): ExcalidrawElement {
  return {
    id: `${type}-1`,
    type,
    strokeColor: "#1e1e1e",
    backgroundColor: "#ffffff",
    strokeWidth: 2,
    strokeStyle: "solid",
    roundness: null,
    opacity: 100,
    ...(mark ? { customData: { tingraph: mark } } : {}),
    ...extra,
  } as unknown as ExcalidrawElement;
}

const task = controlsFor(
  [fake("rectangle", { unit: "bpmn-A1", kind: "node", core: true })],
  "bpmn",
);
assert.equal(task.name, "Task");
assert.equal(task.corners, false, "a task's corners belong to BPMN 2.0");
assert.equal(task.stroke, true, "its colour is the reader's");
assert.ok(task.fixed, "and the panel says why the corners are missing");

const event = controlsFor(
  [fake("ellipse", { unit: "bpmn-E1", kind: "node", core: true })],
  "bpmn",
);
assert.equal(event.name, "Event");
assert.equal(event.weight, false, "the ring weight separates a start from an end");

const connector = controlsFor(
  [fake("arrow", { unit: "flow-0", kind: "edge", core: true })],
  "bpmn",
);
assert.equal(connector.name, "Connector");
assert.equal(connector.fill, false, "a connector has nothing to fill");
assert.equal(connector.corners, false, "nor corners to round");
assert.equal(connector.weight, false, "nor a weight to set");
assert.equal(connector.dash, true, "but a sequence flow and an association differ");

const step = controlsFor(
  [fake("rectangle", { unit: "flow-node-P1", kind: "node", core: true, soft: true })],
  "flow",
);
assert.equal(step.name, "Step");
assert.equal(step.corners, true, "a flowchart step is a box a style may round");

const terminator = controlsFor(
  [fake("ellipse", { unit: "flow-node-S1", kind: "node", core: true })],
  "flow",
);
assert.equal(terminator.name, "Terminator");
assert.equal(terminator.corners, false, "an ellipse has no corners to round");
assert.equal(terminator.weight, true, "but its stroke is the reader's");

const own = controlsFor([fake("rectangle")], "flow");
assert.equal(own.name, "Shape");
assert.equal(own.corners, true, "a shape the reader drew is entirely theirs");
assert.equal(own.dash, true);

const pool = controlsFor([fake("rectangle", { unit: "pool-P1", kind: "pool", core: true })], "bpmn");
assert.equal(pool.name, "Pool");
assert.equal(pool.fill, false, "a participant band is unfilled in BPMN 2.0");

// -------------------------------------------- what is under the reader's hand

// a connector is repaired between interactions, never during one
assert.deepEqual(
  [...held({ selectedElementIds: {} })],
  [],
  "nothing held while the pointer is idle",
);
assert.deepEqual(
  [...held({ newElement: { id: "a1" }, selectedElementIds: {} })],
  ["a1"],
  "an arrow still being drawn is left alone",
);
assert.deepEqual(
  [...held({
    selectedLinearElement: { elementId: "e2", isDragging: true },
    selectedElementIds: {},
  })],
  ["e2"],
  "and so is one being edited point by point",
);
assert.deepEqual(
  [...held({
    selectedLinearElement: { elementId: "e2", isDragging: false },
    selectedElementIds: {},
  })],
  [],
  "a connector merely selected is still repaired",
);
assert.deepEqual(
  [...held({
    selectedElementsAreBeingDragged: true,
    selectedElementIds: { e2: true, e3: false },
  })],
  ["e2"],
  "a whole connector being moved is left alone",
);
assert.deepEqual(
  [...held({ selectedElementIds: { e2: true } })],
  [],
  // this is the case that keeps a bound connector following a box that moves
  "a selection that is not being dragged holds nothing",
);

// --------------------------------------------------------- the AI tutorial

for (const category of ["flow", "bpmn", "org"] as DiagramCategory[]) {
  const prompt = promptFor(category);
  for (const section of GUIDE_SECTIONS[category]) {
    for (const entry of section.rows) {
      assert.ok(
        prompt.includes(entry.syntax),
        `${category} prompt carries \`${entry.syntax}\``,
      );
    }
  }
  // the worked example inside the prompt is real source, not an illustration
  const source = prompt
    .slice(prompt.indexOf("WORKED EXAMPLE\n") + "WORKED EXAMPLE\n".length)
    .split("\n\nOUTPUT")[0];
  const ast = parseDSL(source);
  assert.equal(ast.category, category, `${category} prompt example parses`);
  assert.ok(ast.nodes.length > 1, `${category} prompt example draws something`);
}

// ----------------------------------------------------------- Tingraph AI

/**
 * The chatbot is briefed from the same description of the language the guide
 * draws its tables from, and every answer it gives is run through the editor's
 * own parse and layout before the reader sees it. Both are asserted here: a
 * briefing that has lost a keyword, or a readiness check that has drifted from
 * the pipeline, would only show up as a chatbot writing source that will not
 * draw.
 */
for (const category of Object.keys(TEMPLATES) as DiagramCategory[]) {
  const system = systemPrompt(category, TEMPLATES[category]);
  for (const section of GUIDE_SECTIONS[category]) {
    for (const entry of section.rows) {
      assert.ok(
        system.includes(entry.syntax),
        `${category} chat briefing carries \`${entry.syntax}\``,
      );
    }
  }
  // the reader's own sheet goes into the briefing, so a change is a change to it
  assert.ok(
    system.includes(TEMPLATES[category].trim()),
    `${category} chat briefing carries the source on the sheet`,
  );
  assert.ok(
    system.includes("`message`") && system.includes("`source`"),
    `${category} chat briefing asks for both fields`,
  );

  // what the editor will draw is exactly what the server lets through
  assert.equal(
    refuses(TEMPLATES[category], "down"),
    null,
    `${category} template is ready to generate`,
  );
}

assert.ok(
  refuses('flow "Half" {\n  start A "A"', "down"),
  "an unclosed diagram is refused",
);
assert.ok(refuses("draw me a flowchart", "down"), "prose is refused");

// the model is told not to fence its source; it sometimes does anyway
assert.equal(unfence('```\nflow "A" {}\n```'), 'flow "A" {}');
assert.equal(unfence('```tingraph\nflow "A" {}\n```'), 'flow "A" {}');
assert.equal(unfence('flow "A" {}'), 'flow "A" {}');

// ------------------------------------------------ one description of a shape

// the mapper and the drag preview read the same silhouette, so what the
// pointer shows is what lands on the sheet
assert.equal(shapeFamily("start", "bpmn"), "ellipse");
assert.equal(shapeFamily("end", "bpmn"), "ellipse");
assert.equal(shapeFamily("gw-ex", "bpmn"), "diamond");
assert.equal(shapeFamily("task", "bpmn"), "task");
assert.equal(shapeFamily("send-task", "bpmn"), "task");
assert.equal(shapeFamily("data", "bpmn"), "document");
assert.equal(shapeFamily("start", "flow"), "ellipse");
assert.equal(shapeFamily("decision", "flow"), "diamond");
assert.equal(shapeFamily("process", "flow"), "box");
assert.equal(shapeFamily("io", "flow"), "box");
assert.equal(shapeFamily("role", "org"), "box");

// and the mapper draws what the description says
const bpmnShapes = byId(buildSkeletons(computeLayout(parseDSL(BPMN_TEMPLATE))));
assert.equal(bpmnShapes.get("S1")?.type, "ellipse");
assert.equal(bpmnShapes.get("G1")?.type, "diamond");
assert.equal(bpmnShapes.get("A1")?.type, "rectangle");
assert.equal(formal.get("D1")?.type, "diamond", "a flow decision is a diamond");

// ------------------------------------------------------------------- inks

const wash = washFor("#1e3a8a");
assert.ok(/^#[0-9a-f]{6}$/.test(wash), "a mixed wash is a plain hex colour");
assert.ok(
  parseInt(wash.slice(1, 3), 16) > 0x1e,
  "the wash is the paler half of the pair",
);
assert.equal(customInk("#123456").color, "#123456", "the stroke is what was picked");

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

async function checkPdf(): Promise<void> {
  // -------------------------------------------------------------------- pdf

  const jpeg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    // SOF0: 8-bit, 40 high, 60 wide, 3 components
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x28, 0x00, 0x3c, 0x03,
    0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ]);

  const pdf = jpegToPdf(jpeg, { pageWidth: 320, pageHeight: 240 });
  const text = Buffer.from(await blobBytes(pdf)).toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4"), "it says what it is");
  assert.ok(text.includes("/MediaBox [0 0 320 240]"), "the page is the drawing's size");
  assert.ok(text.includes("/Width 60 /Height 40"), "the image reports its own pixels");
  assert.ok(text.includes("/Filter /DCTDecode"), "the JPEG goes in whole");

  // every offset in the table lands on the object it claims
  const table = [...text.matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
  assert.equal(table.length, 5, "five objects");
  table.forEach((offset, index) => {
    assert.ok(
      text.startsWith(`${index + 1} 0 obj`, offset),
      `object ${index + 1} is where the table says`,
    );
  });
  const startxref = Number(/startxref\s+(\d+)/.exec(text)![1]);
  assert.ok(text.startsWith("xref", startxref), "and the table is where the trailer says");
}

// ------------------------------------------------- a figure has no inside
{
  const frame = fake(
    "rectangle",
    { unit: "venn-1", kind: "figure", core: true, figure: { kind: "venn" } },
    { id: "frame", groupIds: ["venn-1"], x: 0, y: 0, width: 400, height: 300 },
  );
  const ring = fake(
    "ellipse",
    { unit: "venn-1", kind: "figure" },
    { id: "ring", groupIds: ["venn-1"], x: 40, y: 40, width: 200, height: 200 },
  );
  // the reader double-clicked the figure, which in Excalidraw steps inside it
  const fix = normalizeUnits([frame, ring], {
    selectedElementIds: { frame: true },
    selectedGroupIds: {},
    editingGroupId: "venn-1",
  });
  assert.ok(fix?.appState, "stepping into a figure is put right");
  assert.equal(fix!.appState!.editingGroupId, null, "nobody is left inside it");
  assert.deepEqual(
    Object.keys(fix!.appState!.selectedElementIds).sort(),
    ["frame", "ring"],
    "the whole figure is held instead of the frame alone",
  );

  // a graph element still opens on its caption carrier, which is the point of it
  const box = fake(
    "rectangle",
    { unit: "bpmn-A1", kind: "node", core: true },
    { id: "box", groupIds: ["bpmn-A1"] },
  );
  const marker = fake(
    "line",
    { unit: "bpmn-A1", kind: "node" },
    { id: "marker", groupIds: ["bpmn-A1"] },
  );
  const inside = normalizeUnits([box, marker], {
    selectedElementIds: { marker: true },
    selectedGroupIds: {},
    editingGroupId: "bpmn-A1",
  });
  assert.equal(
    inside?.appState?.editingGroupId,
    "bpmn-A1",
    "a task can still be stepped into",
  );
  assert.deepEqual(
    Object.keys(inside!.appState!.selectedElementIds),
    ["box"],
    "and lands on the piece that carries its caption",
  );
}

// ------------------------------------------------------ taking a lane off
{
  const pool: PoolBox = {
    unit: "pool-P1",
    label: "Pool",
    x: 0,
    y: 0,
    width: 600,
    height: 200,
    band: 30,
    laneBand: 24,
    lanes: [
      { unit: "lane-L1", label: "Lane 1", top: 0, bottom: 100 },
      { unit: "lane-L2", label: "Lane 2", top: 100, bottom: 200 },
    ],
  };
  const body = fake(
    "rectangle",
    { unit: "pool-P1", kind: "pool", core: true },
    { id: "pool", x: 0, y: 0, width: 600, height: 200 },
  );
  const top = fake(
    "rectangle",
    { unit: "lane-L1", kind: "lane" },
    { id: "lane1", x: 30, y: 0, width: 570, height: 100 },
  );
  const low = fake(
    "rectangle",
    { unit: "lane-L2", kind: "lane" },
    { id: "lane2", x: 30, y: 100, width: 570, height: 100 },
  );
  const task = fake(
    "rectangle",
    { unit: "bpmn-T1", kind: "node", core: true },
    { id: "task", x: 120, y: 130, width: 80, height: 40 },
  );
  const below = fake("rectangle", undefined, {
    id: "after",
    x: 0,
    y: 260,
    width: 600,
    height: 40,
  });

  // a line into the lane that goes has nothing left to join
  const line = fake(
    "arrow",
    {
      unit: "line-1",
      kind: "connector",
      link: { line: "sequence", from: { unit: "bpmn-A1" }, to: { unit: "bpmn-T1" } },
    },
    { id: "line", x: 60, y: 60, width: 60, height: 70 },
  );
  const keeper = fake(
    "arrow",
    {
      unit: "line-2",
      kind: "connector",
      link: { line: "sequence", from: { unit: "lane-L1" }, to: { unit: "lane-L1" } },
    },
    { id: "keeper", x: 60, y: 20, width: 40, height: 10 },
  );

  const cut = removeLane([body, top, low, task, below, line, keeper], pool);
  const find = (id: string) => cut.find((element) => element.id === id)!;
  assert.equal(find("lane2").isDeleted, true, "the bottom lane goes");
  assert.equal(find("task").isDeleted, true, "and what was drawn in it goes with it");
  assert.equal(find("lane1").isDeleted, undefined, "the lane above stays");
  assert.equal(find("pool").height, 100, "the pool shrinks by exactly that lane");
  assert.equal(find("after").y, 160, "and the sheet below comes up by the same");
  assert.equal(find("line").isDeleted, true, "a line into it goes too");
  assert.equal(find("keeper").isDeleted, undefined, "one joining what stays is kept");

  // the last lane is the pool's own body, so it is left alone
  const alone = removeLane([body, top], { ...pool, height: 100 });
  assert.equal(
    alone.find((element) => element.id === "lane1")!.isDeleted,
    undefined,
    "a pool never loses its last lane",
  );
}

// ------------------------------------------ adding another activity pool
{
  const frame: FrameBox = {
    unit: "frame-main",
    label: "",
    x: 20,
    y: 30,
    width: 420,
    height: 260,
    head: 32,
    lanes: [],
  };
  const body = fake(
    "rectangle",
    { unit: frame.unit, kind: "frame", core: true },
    { id: "activity-frame", x: frame.x, y: frame.y, width: frame.width, height: frame.height },
  );
  const added = frames.addPartitionFrameBelow([body], frame, inkFor("mono"));
  const newFrame = added.find(
    (element) => element.id !== body.id && unitOf(element)?.kind === "frame" && unitOf(element)?.core,
  )!;
  const newLane = added.find((element) => unitOf(element)?.kind === "lane")!;
  assert.ok(newFrame, "activity can add another pool");
  assert.equal(
    unitOf(newLane)?.parent,
    unitOf(newFrame)?.unit,
    "its first partition is nested in that pool",
  );
}

// ----------------------------------------------------- the settable graphs

{
  // the panel is offered to exactly the notations whose elements carry a spec
  for (const category of ["bpmn", "usecase", "activity", "erd"] as DiagramCategory[]) {
    assert.ok(isSettable(category), `${category} is set from a panel`);
  }
  for (const category of ["flow", "org", "bar", "mind"] as DiagramCategory[]) {
    assert.equal(isSettable(category), false, `${category} is not`);
  }

  // --- one table's columns, rewritten
  const table: DSLNode = {
    id: "T",
    type: "entity",
    label: "orders",
    fields: [
      { name: "id", type: "bigint", key: "pk" },
      { name: "status", type: "varchar(20)" },
    ],
  };
  assert.equal(erd.nextKey(undefined), "pk", "a column with no marker takes one");
  assert.equal(erd.nextKey("pfk"), undefined, "and comes back round to none");
  const grown = erd.addField(table, 0);
  assert.equal(grown.fields!.length, 3);
  assert.equal(grown.fields![1].name, "column_3", "a fresh column is named apart");
  assert.equal(grown.fields![2].name, "status", "and is put in where it was asked for");
  assert.equal(erd.removeField(grown, 1).fields!.length, 2, "and can be taken out again");
  assert.equal(
    erd.removeField({ ...table, fields: [table.fields![0]] }, 0).fields!.length,
    1,
    "a table keeps its last column",
  );
  assert.equal(erd.moveField(table, 1, -1).fields![0].name, "status", "a column moves");
  assert.equal(
    erd.setField(table, 1, { key: "fk" }).fields![1].key,
    "fk",
    "and takes a key marker",
  );
  assert.equal(
    "unique" in erd.setField(table, 1, { unique: false }).fields![1],
    false,
    "a flag that is off is not written at all",
  );

  // --- a caption edited on the sheet is what the panel reads back
  const shape = fake(
    "rectangle",
    { unit: "erd-T", kind: "node", core: true, spec: table },
    { id: "box", x: 10, y: 20, width: 180, height: 72 },
  );
  const band = fake(
    "rectangle",
    { unit: "erd-T", kind: "node", core: true, part: "name" },
    { id: "band", x: 10, y: 20, width: 180, height: 28 },
  );
  const name = fake(
    "text",
    { unit: "erd-T", kind: "node", core: true },
    { id: "name", containerId: "band", text: "purchase\norders", originalText: "purchase orders" },
  );
  const row = fake(
    "text",
    { unit: "erd-T", kind: "node", core: true, part: "field:1:name" },
    { id: "row", text: "state" },
  );
  const [read] = elements.elementsOn([shape, band, name, row]);
  assert.equal(read.unit, "erd-T");
  assert.equal(read.spec.label, "purchase orders", "the table's name comes off the sheet");
  assert.equal(read.spec.fields![1].name, "state", "and so does a renamed column");
  assert.deepEqual(
    read.box,
    { x: 10, y: 20, width: 180, height: 72 },
    "the box is the element's own outline, not the spec's idea of it",
  );
  const [port] = [...(erd.portsOf([shape, band, name, row]).get("erd-T") ?? [])].slice(1);
  assert.equal(port[0], "state", "a port is named by the column as it now reads");
  assert.equal(port[1], 20 + 28 + 22 + 11, "and sits in the middle of its own row");

  // --- drawn again from the spec, in the same place
  const redrawn = elements.redrawElement(
    [shape, band, name, row],
    "erd-T",
    erd.addField(table),
    { x: 10, y: 20 },
    "erd",
    inkFor("mono"),
    styleFor("formal"),
  ) as unknown as Skel[];
  assert.equal(
    redrawn.some((piece) => piece.id === "name"),
    false,
    "a bound caption goes with the shape it was bound to",
  );
  const outline = redrawn.find(
    (piece) => piece.type === "rectangle" && (piece as { height?: number }).height === 94,
  );
  assert.ok(outline, "the table is one row taller");
  assert.equal((outline as unknown as { x: number }).x, 10, "and has not moved");
  for (const piece of redrawn) {
    const mark = (piece.customData as { tingraph?: { unit: string } })?.tingraph;
    if (mark) {
      assert.equal(mark.unit, "erd-T", "every fresh piece answers to the same name");
    }
  }

  // --- an activity's partitions are columns, so the sheet opens to the right
  const frameBox = fake(
    "rectangle",
    { unit: "frame-P", kind: "frame", core: true },
    { id: "frame", x: 0, y: 0, width: 400, height: 300 },
  );
  const rule = fake(
    "line",
    { unit: "lane-L2", kind: "lane" },
    { id: "rule", x: 200, y: 0, width: 0, height: 300 },
  );
  const beyond = fake("rectangle", undefined, { id: "beyond", x: 500, y: 10, width: 20, height: 20 });
  const read2 = frames.partitionFrames([frameBox, rule, beyond]);
  assert.equal(read2.length, 1, "one frame");
  assert.equal(read2[0].lanes.length, 2, "ruled into two columns");
  assert.equal(read2[0].lanes[1].x, 200, "the second starting at the rule");
  const wider = frames.addColumn(
    [frameBox, rule, beyond],
    read2[0],
    inkFor("mono"),
    styleFor("formal"),
  ) as unknown as Skel[];
  assert.equal(
    (wider.find((piece) => piece.id === "frame") as unknown as { width: number }).width,
    400 + frames.COLUMN_WIDTH,
    "the frame widens by exactly one column",
  );
  assert.equal(
    (wider.find((piece) => piece.id === "beyond") as unknown as { x: number }).x,
    500 + frames.COLUMN_WIDTH,
    "and the sheet to the right of it moves over by the same",
  );
}

// ------------------------------------------------------------- connectors

{
  const arrow = fake(
    "arrow",
    {
      unit: "flow-0",
      kind: "edge",
      core: true,
      link: {
        line: "erd-one-to-many",
        from: { unit: "erd-A", port: "id" },
        to: { unit: "erd-B" },
      },
    },
    { id: "rel", x: 0, y: 0, width: 100, height: 40 },
  );

  // a change of line carries the heads it is drawn with
  const [turned] = scene.writeLink([arrow], "rel", { line: "erd-one-to-one" }, "erd") as
    unknown as Skel[];
  assert.equal(turned.endArrowhead, "crowfoot_one", "the far head follows the line");
  assert.equal(
    (turned.customData as { tingraph: { link: { at: string } } }).tingraph.link.at,
    "recut",
    "and the route is asked for again",
  );

  // a caption is written onto a line that has none, and taken off again
  const named = scene.labelLink(
    [arrow],
    "rel",
    "places",
    inkFor("mono"),
    styleFor("formal"),
    "erd",
  ) as unknown as Skel[];
  assert.equal(named.length, 2, "a fresh caption is added beside the line");
  const caption = named[1];
  assert.equal(caption.type, "text");
  assert.equal(caption.text, "places");
  assert.equal(
    (caption.customData as { tingraph: { unit: string } }).tingraph.unit,
    "flow-0",
    "and answers to the same name, so it copies and moves with the line",
  );
  const bare = scene.labelLink(
    named as unknown as ExcalidrawElement[],
    "rel",
    "   ",
    inkFor("mono"),
    styleFor("formal"),
    "erd",
  ) as unknown as Skel[];
  assert.equal(bare[1].isDeleted, true, "and an empty name takes the caption off");
}

// --------------------------------------------------------------- accounts

assert.deepEqual(
  PLAN_LIMITS.free,
  { diagrams: 2, generations: 10, aiTokens: 2_000 },
  "the Free plan keeps its published limits",
);
assert.deepEqual(
  PLAN_LIMITS.premium,
  { diagrams: 100, generations: null, aiTokens: 100_000 },
  "the Premium plan keeps its published limits",
);
assert.equal(isPlanTier("premium"), true);
assert.equal(isPlanTier("pro"), false, "only stored tier values are accepted");
assert.equal(planName("premium"), "Premium");

// a sign-in only ever comes back to a page on this site
assert.equal(safeNext("/editor?type=flow#top"), "/editor?type=flow#top");
assert.equal(safeNext("//evil.example"), "/profile", "a second slash is another host");
assert.equal(safeNext("/\\evil.example"), "/profile", "and so is a backslash");
assert.equal(safeNext("/\t/evil.example"), "/profile", "and so is a tab the browser strips");
assert.equal(safeNext("https://evil.example"), "/profile");
assert.equal(safeNext(["/a", "/b"]), "/profile", "a repeated parameter is not a path");
assert.equal(otpType("recovery"), "recovery");
assert.equal(otpType("__proto__"), null, "an email link names one of Supabase's own kinds");

const profileForm = (fields: Record<string, string>) => {
  const form = new FormData();
  Object.entries(fields).forEach(([name, value]) => form.set(name, value));
  return form;
};
const readBack = readProfile(
  profileForm({ full_name: " Ada ", username: "@Ada_L", website: "ada.dev", bio: "   " }),
);
assert.ok("profile" in readBack);
assert.equal(readBack.profile.full_name, "Ada");
assert.equal(readBack.profile.username, "ada_l", "a username is kept without its @, in lower case");
assert.equal(readBack.profile.website, "https://ada.dev/", "a bare domain is read as https");
assert.equal(readBack.profile.bio, null, "an empty field is cleared rather than stored blank");
assert.equal(readBack.profile.location, null, "and so is one the form did not send");
assert.ok(
  "error" in readProfile(profileForm({ website: "javascript:alert(1)" })),
  "a website is only ever a web address",
);
assert.ok("error" in readProfile(profileForm({ username: "ab" })), "a username has three characters");
assert.ok("error" in readProfile(profileForm({ username: "a-b-c" })), "and no dashes");
assert.ok("error" in readProfile(profileForm({ bio: "x".repeat(281) })), "a bio stops at 280");
assert.equal(avatarProblem({ type: "image/webp", size: 30_000 }), null);
assert.ok(avatarProblem({ type: "image/gif", size: 30_000 }), "a picture is PNG, JPEG or WebP");
assert.ok(avatarProblem({ type: "image/png", size: 2_000_000 }), "and small enough to send");

const savedValue = {
  version: 1,
  category: "flow",
  source: FLOWCHART_TEMPLATE,
  direction: "down",
  ink: customInk("#123456"),
  style: "formal",
  scene: { elements: [], files: {} },
};
const savedDocument = JSON.parse(JSON.stringify(savedValue)) as Json;
assert.ok(readSavedDiagram(savedDocument, "flow"), "a complete saved diagram can be reopened");
assert.equal(
  readSavedDiagram(
    JSON.parse(JSON.stringify({ ...savedValue, category: "bpmn" })) as Json,
    "bpmn",
  ),
  null,
  "saved metadata cannot claim another notation than its source",
);
const withoutFiles = readSavedDiagram(
  JSON.parse(JSON.stringify({ ...savedValue, scene: { elements: [] } })) as Json,
  "flow",
);
assert.ok(withoutFiles, "Excalidraw may omit the file map when a scene has no images");
assert.deepEqual(
  (withoutFiles.scene as { files?: Json }).files,
  {},
  "a missing image file map is restored as an empty map",
);
assert.equal(
  readSavedDiagram(
    JSON.parse(JSON.stringify({ ...savedValue, scene: { elements: [], files: null } })) as Json,
    "flow",
  ),
  null,
  "a malformed image file map is refused",
);
assert.equal(Array.from(diagramTitle(` ${"x".repeat(140)} `)).length, 120);

checkPdf().then(() => {
  console.log("editor self-check: all assertions passed");
});
