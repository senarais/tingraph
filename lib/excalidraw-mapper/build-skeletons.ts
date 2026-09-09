import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import {
  NodeType,
  PositionedAST,
  PositionedEdge,
  PositionedLane,
  PositionedNode,
  PositionedPool,
} from "@/lib/types";
import { marked, type UnitMark } from "@/lib/canvas/units";
import {
  BPMN_EXTERNAL_LABEL_DISTANCE,
  BPMN_LABEL_FONT_SIZE,
  BPMN_LINE_HEIGHT,
  BPMN_TASK_FONT_SIZE,
  ORG_NAME_FONT_SIZE,
  ORG_TITLE_FONT_SIZE,
  bpmnHasExternalLabel,
  orgBoxLayout,
  textWidth,
  wrapByWidth,
  wrapExternalLabel,
} from "@/lib/layout/compute-layout";
import { MONOCHROME, type Ink } from "@/lib/ink";
import {
  buildBpmnIcons,
  buildDataObjectOutline,
} from "@/lib/bpmn-icons/markers";

export const ACADEMIC_MONOCHROME_THEME = {
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 0,
  fontFamily: 2, // Helvetica — formal sans-serif for diagrams
  fontSize: 16,
  textAlign: "center",
  verticalAlign: "middle",
  opacity: 100,
} as const;

const WHITE = "#ffffff";
const ACCENT_GRAY = "#e5e7eb";
const BPMN_END_STROKE_WIDTH = 4;
const BPMN_INTERMEDIATE_STROKE_WIDTH = 1.5;
const BPMN_TASK_ROUNDNESS = { type: 3, value: 10 } as const; // rx=10px cap
const CHROME_STROKE_WIDTH = 1.5;
const CONNECTOR_STROKE_WIDTH = 1.5;
const TITLE_FONT_SIZE = 22;
const TITLE_GAP = 28;
/**
 * An org chart is drawn in plain black whatever the ink is, so that the wash
 * behind the role bands is the only colour on the sheet. The value is kept
 * apart from every ink preset on purpose: re-inking the sheet swaps ink for
 * ink and wash for wash, and these rules must sit out both swaps.
 */
const ORG_STROKE = "#111827";
const ORG_PILL_ROUNDNESS = { type: 3, value: 6 } as const;
/** Hairline around a sub-role pill, so the pill still reads on a white wash. */
const ORG_PILL_EDGE = "#d1d5db";

interface Theme {
  strokeColor: string;
  /** wash behind highlighted text — the org band and its sub-role pills */
  tint: string;
  fontSize: number;
  fontFamily: number;
}

function themeFor(ink: Ink, category: PositionedAST["category"]): Theme {
  return {
    strokeColor: category === "org" ? ORG_STROKE : ink.color,
    tint: ink.tint,
    fontFamily: ACADEMIC_MONOCHROME_THEME.fontFamily,
    fontSize: category === "bpmn" ? BPMN_LABEL_FONT_SIZE : 16,
  };
}

/**
 * How every connector on the sheet is drawn. The generated flows spread this,
 * and so does an arrow the reader draws by hand, so the two are the same line.
 */
function connectorFrom(theme: Theme) {
  return {
    strokeColor: theme.strokeColor,
    backgroundColor: "transparent",
    strokeWidth: CONNECTOR_STROKE_WIDTH,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    roundness: null,
    startArrowhead: null,
    // bpmn.io draws a sequence flow with a filled triangle head
    endArrowhead: "triangle",
  } as const;
}

export type ConnectorStyle = ReturnType<typeof connectorFrom>;

export function connectorStyle(
  ink: Ink = MONOCHROME,
  category: PositionedAST["category"] = "bpmn",
): ConnectorStyle {
  return connectorFrom(themeFor(ink, category));
}

function bpmnEventStrokeWidth(type: NodeType): number {
  if (type === "end" || type === "msg-end") {
    return BPMN_END_STROKE_WIDTH;
  }
  if (type === "timer") {
    return BPMN_INTERMEDIATE_STROKE_WIDTH;
  }
  return ACADEMIC_MONOCHROME_THEME.strokeWidth;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where the caption under an event / gateway / data object lands. */
function externalLabelBox(node: PositionedNode): Box | null {
  const lines = wrapExternalLabel(node.label);
  if (lines.length === 0) {
    return null;
  }
  const width = Math.max(...lines.map((l) => textWidth(l, BPMN_LABEL_FONT_SIZE)));
  return {
    x: node.x + node.width / 2 - width / 2,
    y: node.y + node.height + BPMN_EXTERNAL_LABEL_DISTANCE,
    width,
    height: lines.length * BPMN_LINE_HEIGHT,
  };
}

/** A caption placed under an event / gateway / data object. */
function externalLabelSkeleton(
  node: PositionedNode,
  theme: Theme,
): ExcalidrawElementSkeleton | null {
  const lines = wrapExternalLabel(node.label);
  if (lines.length === 0) {
    return null;
  }
  return {
    type: "text",
    id: `${node.id}-label`,
    text: lines.join("\n"),
    // Excalidraw anchors centre-aligned text on x, and top-aligned text on y
    x: Math.round(node.x + node.width / 2),
    y: Math.round(node.y + node.height + BPMN_EXTERNAL_LABEL_DISTANCE),
    groupIds: [`bpmn-${node.id}`],
    ...marked({ unit: `bpmn-${node.id}`, kind: "node", core: true }),
    ...ACADEMIC_MONOCHROME_THEME,
    strokeColor: theme.strokeColor,
    fontSize: BPMN_LABEL_FONT_SIZE,
    fontFamily: theme.fontFamily,
    textAlign: "center",
    verticalAlign: "top",
  } as ExcalidrawElementSkeleton;
}

export function bpmnNodeSkeletons(
  node: PositionedNode,
  theme: Theme,
): ExcalidrawElementSkeleton[] {
  const skeletons: ExcalidrawElementSkeleton[] = [];
  const unit = `bpmn-${node.id}`;
  const groupIds = [unit];
  // marker strokes ride along with the shape and are never picked on their own
  const asPart = (parts: ExcalidrawElementSkeleton[]) =>
    parts.map(
      (part) =>
        ({ ...part, ...marked({ unit, kind: "node" }) }) as ExcalidrawElementSkeleton,
    );
  const base = {
    ...ACADEMIC_MONOCHROME_THEME,
    strokeColor: theme.strokeColor,
    backgroundColor: WHITE,
    roundness: null,
    groupIds,
    ...marked({ unit, kind: "node", core: true }),
  } as const;

  if (node.type === "data") {
    // data object reference: folded-corner document outline (bpmn-js path)
    skeletons.push(
      ...asPart(
        buildDataObjectOutline(node, {
          strokeColor: theme.strokeColor,
          throwFill: theme.strokeColor,
        }),
      ),
    );
    const label = externalLabelSkeleton(node, theme);
    if (label) {
      skeletons.push(label);
    }
    return skeletons;
  }

  const isTask = !bpmnHasExternalLabel(node.type);
  const isEvent =
    node.type === "start" ||
    node.type === "end" ||
    node.type === "msg-start" ||
    node.type === "msg-end" ||
    node.type === "timer";
  const isGateway =
    node.type === "gw-ex" || node.type === "gw-para" || node.type === "gw-inc";

  skeletons.push({
    type: isEvent ? "ellipse" : isGateway ? "diamond" : "rectangle",
    id: node.id,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    ...base,
    ...(isEvent ? { strokeWidth: bpmnEventStrokeWidth(node.type) } : {}),
    ...(isTask ? { roundness: BPMN_TASK_ROUNDNESS } : {}),
    ...(isTask && node.label
      ? {
          label: {
            text: node.label,
            fontSize: BPMN_TASK_FONT_SIZE,
            fontFamily: theme.fontFamily,
          },
        }
      : {}),
  } as ExcalidrawElementSkeleton);

  skeletons.push(
    ...asPart(
      buildBpmnIcons(node, {
        strokeColor: theme.strokeColor,
        throwFill: theme.strokeColor,
      }),
    ),
  );

  if (bpmnHasExternalLabel(node.type)) {
    const label = externalLabelSkeleton(node, theme);
    if (label) {
      skeletons.push(label);
    }
  }
  return skeletons;
}

function flowNodeSkeletons(
  node: PositionedNode,
  theme: Theme,
): ExcalidrawElementSkeleton[] {
  const shape =
    node.type === "start" || node.type === "end"
      ? "ellipse"
      : node.type === "decision"
        ? "diamond"
        : "rectangle";
  const style =
    node.type === "io"
      ? { backgroundColor: ACCENT_GRAY, roundness: null }
      : { backgroundColor: WHITE, roundness: null };
  return [
    {
      type: shape,
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      ...ACADEMIC_MONOCHROME_THEME,
      strokeColor: theme.strokeColor,
      fontFamily: theme.fontFamily,
      ...style,
      label: {
        text: node.label,
        fontSize: theme.fontSize,
        fontFamily: theme.fontFamily,
      },
    } as ExcalidrawElementSkeleton,
  ];
}

/**
 * One org box: a washed band carrying the role, and — when the source gives
 * one — a white body carrying the name. A box that lists sub-roles fills that
 * body with a washed pill per sub-role and the name underneath it.
 *
 * Every caption is a real Excalidraw label, so a reader can double click any
 * of them and retype it.
 */
function orgNodeSkeletons(
  node: PositionedNode,
  theme: Theme,
): ExcalidrawElementSkeleton[] {
  const box = orgBoxLayout(node);
  const unit = `org-${node.id}`;
  const rule = {
    ...ACADEMIC_MONOCHROME_THEME,
    strokeColor: theme.strokeColor,
    strokeWidth: CHROME_STROKE_WIDTH,
    roundness: null,
    groupIds: [unit],
    ...marked({ unit, kind: "node", core: true }),
  } as const;
  const caption = (text: string[], fontSize: number) => ({
    label: {
      text: text.join("\n"),
      fontSize,
      fontFamily: theme.fontFamily,
      strokeColor: theme.strokeColor,
    },
  });

  const out: ExcalidrawElementSkeleton[] = [
    {
      type: "rectangle",
      id: node.id,
      x: node.x,
      y: node.y,
      width: box.width,
      height: box.bandHeight,
      ...rule,
      backgroundColor: theme.tint,
      ...marked({ unit, kind: "node", core: true, wash: true }),
      ...caption(box.title, ORG_TITLE_FONT_SIZE),
    } as ExcalidrawElementSkeleton,
  ];

  const bodyHeight = box.height - box.bandHeight;
  if (bodyHeight > 0) {
    out.push({
      type: "rectangle",
      id: `${node.id}-body`,
      x: node.x,
      y: node.y + box.bandHeight,
      width: box.width,
      height: bodyHeight,
      ...rule,
      backgroundColor: WHITE,
      ...(box.name.length > 0 ? caption(box.name, ORG_NAME_FONT_SIZE) : {}),
    } as ExcalidrawElementSkeleton);
  }

  box.rows.forEach((row, index) => {
    out.push({
      type: "rectangle",
      id: `${node.id}-unit-${index}`,
      x: Math.round(node.x + (box.width - row.pillWidth) / 2),
      y: node.y + row.pillTop,
      width: row.pillWidth,
      height: row.pillHeight,
      ...ACADEMIC_MONOCHROME_THEME,
      // a wash with a hairline, so the pill survives a white wash too
      strokeColor: ORG_PILL_EDGE,
      backgroundColor: theme.tint,
      strokeWidth: 1,
      roundness: ORG_PILL_ROUNDNESS,
      groupIds: [unit],
      ...marked({ unit, kind: "node", core: true, wash: true }),
      ...caption(row.label, ORG_TITLE_FONT_SIZE),
    } as ExcalidrawElementSkeleton);
    if (row.name.length === 0) {
      return;
    }
    out.push({
      type: "text",
      id: `${node.id}-unit-${index}-name`,
      text: row.name.join("\n"),
      // centre alignment: Excalidraw reads x as the anchor, y as the top
      x: Math.round(node.x + box.width / 2),
      y: node.y + row.nameTop,
      ...ACADEMIC_MONOCHROME_THEME,
      strokeColor: theme.strokeColor,
      fontSize: ORG_NAME_FONT_SIZE,
      fontFamily: theme.fontFamily,
      textAlign: "center",
      verticalAlign: "top",
      groupIds: [unit],
      ...marked({ unit, kind: "node", core: true }),
    } as ExcalidrawElementSkeleton);
  });
  return out;
}

/**
 * Sequence flows and associations. Endpoints are bound to their shapes so the
 * arrow keeps up when the reader drags a node around on the canvas; shapes
 * drawn as raw outlines (data objects) have no bindable container, so those
 * ends stay unbound.
 */
function edgeSkeleton(
  edge: PositionedEdge,
  index: number,
  theme: Theme,
  bindable: Set<string>,
): ExcalidrawElementSkeleton | null {
  if (edge.points.length < 2) {
    return null;
  }
  const first = edge.points[0];
  const points = edge.points.map(
    (p) => [p.x - first.x, p.y - first.y] as [number, number],
  );
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const isAssociation = edge.kind === "association";
  return {
    type: "arrow",
    id: `edge-${index}`,
    x: first.x,
    y: first.y,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    points,
    groupIds: [`flow-${index}`],
    ...marked({ unit: `flow-${index}`, kind: "edge", core: true }),
    ...(bindable.has(edge.from) ? { start: { id: edge.from } } : {}),
    ...(bindable.has(edge.to) ? { end: { id: edge.to } } : {}),
    ...ACADEMIC_MONOCHROME_THEME,
    ...connectorFrom(theme),
    // an association is the same line, dotted, with an open head
    ...(isAssociation
      ? {
          strokeStyle: "dotted",
          endArrowhead: "triangle_outline",
        }
      : { endArrowhead: "triangle" }),
  } as unknown as ExcalidrawElementSkeleton;
}

/** Edge caption, riding the longest leg of its route the way bpmn.io places it. */
function edgeLabelBox(edge: PositionedEdge): Box | null {
  if (!edge.label || edge.points.length < 2) {
    return null;
  }
  // the longest leg keeps the two branches of a gateway from printing on top
  // of each other
  let leg = 0;
  let legLength = -1;
  for (let i = 1; i < edge.points.length; i++) {
    const length =
      Math.abs(edge.points[i].x - edge.points[i - 1].x) +
      Math.abs(edge.points[i].y - edge.points[i - 1].y);
    if (length > legLength) {
      legLength = length;
      leg = i - 1;
    }
  }
  const from = edge.points[leg];
  const next = edge.points[leg + 1];
  const width = textWidth(edge.label, BPMN_LABEL_FONT_SIZE);
  const vertical = Math.abs(next.x - from.x) < Math.abs(next.y - from.y);
  return {
    x: vertical ? from.x + 7 : (from.x + next.x) / 2 - width / 2,
    // on a vertical leg the caption hugs the turn, next to the source
    y: vertical
      ? next.y > from.y
        ? from.y + 10
        : from.y - BPMN_LINE_HEIGHT - 10
      : from.y - BPMN_LINE_HEIGHT - 4,
    width,
    height: BPMN_LINE_HEIGHT,
  };
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

/**
 * Edge captions, nudged off anything already on the sheet. Two branches out of
 * one gateway otherwise land on the same spot.
 */
function edgeLabelSkeletons(
  positioned: PositionedAST,
  theme: Theme,
): ExcalidrawElementSkeleton[] {
  const taken: Box[] = [];
  for (const node of positioned.nodes) {
    taken.push({ x: node.x - 3, y: node.y - 3, width: node.width + 6, height: node.height + 6 });
    const label =
      positioned.category === "bpmn" ? externalLabelBox(node) : null;
    if (label) {
      taken.push(label);
    }
  }

  const out: ExcalidrawElementSkeleton[] = [];
  positioned.edges.forEach((edge, index) => {
    const box = edgeLabelBox(edge);
    if (!box) {
      return;
    }
    const step = BPMN_LINE_HEIGHT + 3;
    for (const shift of [0, -step, step, -2 * step, 2 * step]) {
      // captions need breathing room, not just non-overlap
      const candidate = {
        x: box.x - 5,
        y: box.y + shift - 2,
        width: box.width + 10,
        height: box.height + 4,
      };
      if (!taken.some((other) => overlaps(candidate, other))) {
        box.y += shift;
        break;
      }
    }
    taken.push({
      x: box.x - 5,
      y: box.y - 2,
      width: box.width + 10,
      height: box.height + 4,
    });
    out.push({
      type: "text",
      id: `edge-${index}-label`,
      text: edge.label as string,
      x: Math.round(box.x),
      y: Math.round(box.y),
      groupIds: [`flow-${index}`],
      ...marked({ unit: `flow-${index}`, kind: "edge", core: true }),
      ...ACADEMIC_MONOCHROME_THEME,
      strokeColor: theme.strokeColor,
      fontSize: BPMN_LABEL_FONT_SIZE,
      fontFamily: theme.fontFamily,
      textAlign: "left",
      verticalAlign: "top",
    } as ExcalidrawElementSkeleton);
  });
  return out;
}

/**
 * Org connectors. A reporting line is a filled arrow bound to the two boxes it
 * joins, so it keeps up when either is dragged; anything else is a plain
 * dashed rule, the way a chart marks an advisory tie.
 */
function orgEdgeSkeleton(
  edge: PositionedEdge,
  index: number,
  theme: Theme,
  bottomOf: (id: string) => string,
): ExcalidrawElementSkeleton | null {
  const skeleton = edgeSkeleton(edge, index, theme, new Set());
  if (!skeleton) {
    return null;
  }
  const dashed = edge.kind === "association";
  return {
    ...skeleton,
    ...(edge.reporting
      ? { start: { id: bottomOf(edge.from) }, end: { id: edge.to } }
      : {}),
    strokeStyle: dashed ? "dashed" : "solid",
    endArrowhead: dashed ? null : "triangle",
  } as unknown as ExcalidrawElementSkeleton;
}

function flowEdgeSkeleton(
  edge: PositionedEdge,
  index: number,
  theme: Theme,
): ExcalidrawElementSkeleton | null {
  const skeleton = edgeSkeleton(edge, index, theme, new Set([edge.from, edge.to]));
  if (!skeleton || !edge.label) {
    return skeleton;
  }
  return {
    ...skeleton,
    label: {
      text: edge.label,
      fontSize: theme.fontSize,
      fontFamily: theme.fontFamily,
    },
  } as ExcalidrawElementSkeleton;
}

function diagramBounds(positioned: PositionedAST): {
  minX: number;
  maxX: number;
  minY: number;
} {
  const pools = positioned.pools ?? [];
  const xs = [
    ...positioned.nodes.map((n) => n.x),
    ...pools.map((p) => p.x),
  ];
  const rights = [
    ...positioned.nodes.map((n) => n.x + n.width),
    ...pools.map((p) => p.x + p.width),
  ];
  const ys = [...positioned.nodes.map((n) => n.y), ...pools.map((p) => p.y)];
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...rights),
    minY: Math.min(...ys),
  };
}

function titleSkeleton(
  positioned: PositionedAST,
  theme: Theme,
): ExcalidrawElementSkeleton {
  const { minX, maxX, minY } = diagramBounds(positioned);
  const lines = wrapByWidth(positioned.title, maxX - minX, TITLE_FONT_SIZE);
  const height = Math.max(1, lines.length) * TITLE_FONT_SIZE * 1.25;
  return {
    type: "text",
    id: "diagram-title",
    text: lines.join("\n") || positioned.title,
    x: Math.round((minX + maxX) / 2),
    y: Math.round(minY - height - TITLE_GAP),
    ...ACADEMIC_MONOCHROME_THEME,
    strokeColor: theme.strokeColor,
    fontSize: TITLE_FONT_SIZE,
    fontFamily: theme.fontFamily,
    textAlign: "center",
    verticalAlign: "top",
  } as ExcalidrawElementSkeleton;
}

/** A caption rotated a quarter turn, centred inside a header band. */
function bandLabelSkeleton(
  id: string,
  label: string,
  band: { x: number; y: number; width: number; height: number },
  theme: Theme,
  fontSize: number,
  mark: UnitMark,
): ExcalidrawElementSkeleton {
  return {
    type: "text",
    id,
    text: label,
    // centre/middle alignment: Excalidraw reads x and y as the anchor point
    x: Math.round(band.x + band.width / 2),
    y: Math.round(band.y + band.height / 2),
    angle: -Math.PI / 2,
    groupIds: [mark.unit],
    ...marked(mark),
    ...ACADEMIC_MONOCHROME_THEME,
    strokeColor: theme.strokeColor,
    fontSize,
    fontFamily: theme.fontFamily,
    textAlign: "center",
    verticalAlign: "middle",
  } as ExcalidrawElementSkeleton;
}

/** Stroke settings shared by every pool / lane rule. */
function chromeBox(theme: Theme) {
  return {
    ...ACADEMIC_MONOCHROME_THEME,
    strokeColor: theme.strokeColor,
    backgroundColor: "transparent",
    strokeWidth: CHROME_STROKE_WIDTH,
    roundness: null,
  } as const;
}

/** One lane rule set: the split line above it and its header band. */
function laneSkeletons(
  lane: PositionedLane,
  theme: Theme,
  drawSplit: boolean,
): ExcalidrawElementSkeleton[] {
  const out: ExcalidrawElementSkeleton[] = [];
  const box = chromeBox(theme);
  const unit = `lane-${lane.id}`;
  // lanes share the pool's outer border; only the split lines are drawn
  if (drawSplit) {
    out.push({
      type: "line",
      id: `${unit}-split`,
      x: lane.x,
      y: lane.y,
      width: lane.width,
      height: 0,
      points: [
        [0, 0],
        [lane.width, 0],
      ],
      ...box,
      groupIds: [unit],
      ...marked({ unit, kind: "lane" }),
    } as ExcalidrawElementSkeleton);
  }
  if (lane.headerWidth > 0) {
    out.push({
      type: "line",
      id: `${unit}-divider`,
      x: lane.x + lane.headerWidth,
      y: lane.y,
      width: 0,
      height: lane.height,
      points: [
        [0, 0],
        [0, lane.height],
      ],
      ...box,
      groupIds: [unit],
      ...marked({ unit, kind: "lane" }),
    } as ExcalidrawElementSkeleton);
    if (lane.label) {
      out.push(
        bandLabelSkeleton(
          `${unit}-label`,
          lane.label,
          {
            x: lane.x,
            y: lane.y,
            width: lane.headerWidth,
            height: lane.height,
          },
          theme,
          BPMN_LABEL_FONT_SIZE,
          { unit, kind: "lane", core: true },
        ),
      );
    }
  }
  return out;
}

/** One pool box with its vertical header band and its lane rules. */
function poolSkeletons(
  pool: PositionedPool,
  theme: Theme,
): ExcalidrawElementSkeleton[] {
  const out: ExcalidrawElementSkeleton[] = [];
  const box = chromeBox(theme);
  const unit = `pool-${pool.id}`;
  const groupIds = [unit];
  // the band widths ride on the box so later pool edits match what was drawn
  const mark = {
    unit,
    kind: "pool",
    band: pool.headerWidth,
    laneBand: Math.max(0, ...pool.lanes.map((lane) => lane.headerWidth)),
  } as const;

  out.push({
    type: "rectangle",
    id: unit,
    x: pool.x,
    y: pool.y,
    width: pool.width,
    height: pool.height,
    ...box,
    groupIds,
    ...marked({ ...mark, core: true }),
  } as ExcalidrawElementSkeleton);

  if (pool.headerWidth > 0) {
    out.push({
      type: "line",
      id: `${unit}-divider`,
      x: pool.x + pool.headerWidth,
      y: pool.y,
      width: 0,
      height: pool.height,
      points: [
        [0, 0],
        [0, pool.height],
      ],
      ...box,
      groupIds,
      ...marked(mark),
    } as ExcalidrawElementSkeleton);
    if (pool.label) {
      out.push(
        bandLabelSkeleton(
          `${unit}-label`,
          pool.label,
          { x: pool.x, y: pool.y, width: pool.headerWidth, height: pool.height },
          theme,
          BPMN_LABEL_FONT_SIZE + 1,
          { ...mark, core: true },
        ),
      );
    }
  }

  pool.lanes.forEach((lane, index) => {
    out.push(...laneSkeletons(lane, theme, index > 0));
  });
  return out;
}

/** Pool and lane boxes with their vertical header bands. */
function poolLaneSkeletons(
  positioned: PositionedAST,
  theme: Theme,
): ExcalidrawElementSkeleton[] {
  const out: ExcalidrawElementSkeleton[] = [];
  for (const pool of positioned.pools ?? []) {
    // elements declared outside any participant get no box, per BPMN practice
    if (!pool.label && pool.lanes.every((lane) => !lane.label)) {
      continue;
    }
    out.push(...poolSkeletons(pool, theme));
  }
  return out;
}

export function buildSkeletons(
  positioned: PositionedAST,
  ink: Ink = MONOCHROME,
): ExcalidrawElementSkeleton[] {
  const theme = themeFor(ink, positioned.category);
  const skeletons: ExcalidrawElementSkeleton[] = [];
  const isBpmn = positioned.category === "bpmn";
  const isOrg = positioned.category === "org";

  if (isBpmn && positioned.pools) {
    skeletons.push(...poolLaneSkeletons(positioned, theme));
  }

  for (const node of positioned.nodes) {
    skeletons.push(
      ...(isBpmn
        ? bpmnNodeSkeletons(node, theme)
        : isOrg
          ? orgNodeSkeletons(node, theme)
          : flowNodeSkeletons(node, theme)),
    );
  }

  const bindable = new Set(
    positioned.nodes.filter((n) => n.type !== "data").map((n) => n.id),
  );
  // a reporting line leaves the bottom of a box, which is its body when the
  // box carries a name and the band itself when it does not
  const bottomOf = (id: string): string => {
    const node = positioned.nodes.find((n) => n.id === id);
    if (!node) {
      return id;
    }
    const box = orgBoxLayout(node);
    return box.height > box.bandHeight ? `${id}-body` : id;
  };
  positioned.edges.forEach((edge, index) => {
    const skeleton = isBpmn
      ? edgeSkeleton(edge, index, theme, bindable)
      : isOrg
        ? orgEdgeSkeleton(edge, index, theme, bottomOf)
        : flowEdgeSkeleton(edge, index, theme);
    if (skeleton) {
      skeletons.push(skeleton);
    }
  });
  if (isBpmn || isOrg) {
    skeletons.push(...edgeLabelSkeletons(positioned, theme));
  }

  if (positioned.nodes.length > 0) {
    skeletons.push(titleSkeleton(positioned, theme));
  }
  return skeletons;
}

/**
 * One free-standing shape, for dropping a BPMN element straight onto the
 * canvas instead of writing it in the DSL.
 */
export function buildShapeSkeletons(
  node: PositionedNode,
  ink: Ink = MONOCHROME,
): ExcalidrawElementSkeleton[] {
  return bpmnNodeSkeletons(node, themeFor(ink, "bpmn"));
}

/** One pool box, for adding a participant straight on the canvas. */
export function buildPoolSkeletons(
  pool: PositionedPool,
  ink: Ink = MONOCHROME,
): ExcalidrawElementSkeleton[] {
  return poolSkeletons(pool, themeFor(ink, "bpmn"));
}

/** One lane rule set, for splitting a pool that is already on the canvas. */
export function buildLaneSkeletons(
  lane: PositionedLane,
  ink: Ink = MONOCHROME,
): ExcalidrawElementSkeleton[] {
  return laneSkeletons(lane, themeFor(ink, "bpmn"), true);
}

/** One free-standing org box, for dropping a role straight onto the sheet. */
export function buildOrgShapeSkeletons(
  node: PositionedNode,
  ink: Ink = MONOCHROME,
): ExcalidrawElementSkeleton[] {
  return orgNodeSkeletons(node, themeFor(ink, "org"));
}
