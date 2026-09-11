import assert from "node:assert";
import { parseDSL } from "../lib/parser/parse-dsl";
import { computeLayout } from "../lib/layout/compute-layout";
import { buildSkeletons } from "../lib/excalidraw-mapper/build-skeletons";
import { shapeFamily } from "../lib/layout/compute-layout";
import { controlsFor, held } from "../lib/canvas/inspect";
import { jpegToPdf } from "../lib/export/pdf";
import { promptFor, GUIDE_SECTIONS } from "../lib/guide";
import { customInk, inkFor, washFor } from "../lib/ink";
import { styleFor } from "../lib/sheet";
import { FLOWCHART_TEMPLATE, BPMN_TEMPLATE, ORG_TEMPLATE } from "../lib/templates";
import type { DiagramCategory } from "../lib/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

type Skel = Record<string, unknown> & { id?: string; type: string };

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

checkPdf().then(() => {
  console.log("editor self-check: all assertions passed");
});
