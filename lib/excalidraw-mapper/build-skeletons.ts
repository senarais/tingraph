import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import {
  NodeType,
  PositionedAST,
  PositionedEdge,
  PositionedNode,
} from "@/lib/types";
import {
  AVG_CHAR_WIDTH,
  BPMN_EXTERNAL_LABEL_DISTANCE,
  BPMN_LABEL_FONT_SIZE,
  BPMN_LANE_LABEL_WIDTH,
  BPMN_TASK_FONT_SIZE,
  bpmnHasExternalLabel,
} from "@/lib/layout/compute-layout";
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
const TITLE_FONT_SIZE = 22;

interface Theme {
  strokeColor: string;
  fontSize: number;
  fontFamily: number;
}

function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * AVG_CHAR_WIDTH * (fontSize / 16);
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

function externalLabelSkeleton(
  node: PositionedNode,
  theme: Theme,
): ExcalidrawElementSkeleton {
  const width = estimateTextWidth(node.label, BPMN_LABEL_FONT_SIZE);
  return {
    type: "text",
    id: `${node.id}-label`,
    text: node.label,
    x: node.x + node.width / 2 - width / 2,
    y: node.y + node.height + BPMN_EXTERNAL_LABEL_DISTANCE,
    groupIds: [`bpmn-${node.id}`],
    ...ACADEMIC_MONOCHROME_THEME,
    strokeColor: theme.strokeColor,
    fontSize: BPMN_LABEL_FONT_SIZE,
    fontFamily: theme.fontFamily,
    textAlign: "center",
    verticalAlign: "top",
  } as ExcalidrawElementSkeleton;
}

function bpmnNodeSkeletons(
  node: PositionedNode,
  theme: Theme,
): ExcalidrawElementSkeleton[] {
  const skeletons: ExcalidrawElementSkeleton[] = [];
  const groupIds = [`bpmn-${node.id}`];
  const base = {
    ...ACADEMIC_MONOCHROME_THEME,
    strokeColor: theme.strokeColor,
    backgroundColor: WHITE,
    roundness: null,
    groupIds,
  } as const;

  if (node.type === "data") {
    // data object reference: folded-corner document outline (bpmn-js path)
    skeletons.push(
      ...buildDataObjectOutline(node, {
        strokeColor: theme.strokeColor,
        throwFill: theme.strokeColor,
      }),
    );
    if (node.label && node.label !== node.id) {
      skeletons.push(externalLabelSkeleton(node, theme));
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
    ...(isEvent
      ? { strokeWidth: bpmnEventStrokeWidth(node.type) }
      : {}),
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
    ...buildBpmnIcons(node, {
      strokeColor: theme.strokeColor,
      throwFill: theme.strokeColor,
    }),
  );

  if (bpmnHasExternalLabel(node.type) && node.label && node.label !== node.id) {
    skeletons.push(externalLabelSkeleton(node, theme));
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

function edgeSkeleton(
  edge: PositionedEdge,
  index: number,
  theme: Theme,
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
    start: { id: edge.from },
    end: { id: edge.to },
    ...ACADEMIC_MONOCHROME_THEME,
    strokeColor: theme.strokeColor,
    roundness: null,
    // bpmn.io: sequence flow = filled triangle head; association = dotted
    // line with an open (outline) arrowhead
    ...(isAssociation
      ? {
          strokeStyle: "dotted",
          endArrowhead: "triangle_outline",
        }
      : { endArrowhead: "triangle" }),
    ...(edge.label
      ? {
          label: {
            text: edge.label,
            fontSize: BPMN_LABEL_FONT_SIZE,
            fontFamily: theme.fontFamily,
          },
        }
      : {}),
  } as unknown as ExcalidrawElementSkeleton;
}

function titleSkeleton(
  positioned: PositionedAST,
  theme: Theme,
): ExcalidrawElementSkeleton {
  const pools = positioned.pools ?? [];
  const minX = Math.min(
    ...positioned.nodes.map((n) => n.x),
    ...pools.map((p) => p.x),
  );
  const maxX = Math.max(
    ...positioned.nodes.map((n) => n.x + n.width),
    ...pools.map((p) => p.x + p.width),
  );
  const minY = Math.min(
    ...positioned.nodes.map((n) => n.y),
    ...pools.map((p) => p.y),
  );
  return {
    type: "text",
    id: "diagram-title",
    text: positioned.title,
    x:
      (minX + maxX) / 2 -
      estimateTextWidth(positioned.title, TITLE_FONT_SIZE) / 2,
    y: minY - TITLE_FONT_SIZE * 1.75 - 20,
    ...ACADEMIC_MONOCHROME_THEME,
    strokeColor: theme.strokeColor,
    fontSize: TITLE_FONT_SIZE,
    fontFamily: theme.fontFamily,
    textAlign: "center",
    verticalAlign: "top",
  } as ExcalidrawElementSkeleton;
}

/** Pool/lane chrome: rectangles + rotated header labels (bpmn-js style). */
function poolLaneSkeletons(
  positioned: PositionedAST,
  theme: Theme,
): ExcalidrawElementSkeleton[] {
  const out: ExcalidrawElementSkeleton[] = [];
  const stroke = theme.strokeColor;

  for (const pool of positioned.pools ?? []) {
    out.push({
      type: "rectangle",
      id: `pool-${pool.id}`,
      x: pool.x,
      y: pool.y,
      width: pool.width,
      height: pool.height,
      ...ACADEMIC_MONOCHROME_THEME,
      strokeColor: stroke,
      backgroundColor: "transparent",
      strokeWidth: 1.5,
      roundness: null,
      groupIds: [`pool-${pool.id}`],
    } as ExcalidrawElementSkeleton);
    // pool label: vertical text, bottom-to-top along the left header
    if (pool.label) {
      out.push({
        type: "text",
        id: `pool-${pool.id}-label`,
        text: pool.label,
        x: pool.x + 6,
        y: pool.y + pool.height / 2,
        angle: -Math.PI / 2,
        ...ACADEMIC_MONOCHROME_THEME,
        strokeColor: stroke,
        fontSize: BPMN_LABEL_FONT_SIZE + 1,
        fontFamily: theme.fontFamily,
        textAlign: "center",
        verticalAlign: "middle",
      } as ExcalidrawElementSkeleton);
    }
  }

  for (const lane of positioned.pools?.flatMap((p) => p.lanes) ?? []) {
    out.push({
      type: "rectangle",
      id: `lane-${lane.id}`,
      x: lane.x,
      y: lane.y,
      width: lane.width,
      height: lane.height,
      ...ACADEMIC_MONOCHROME_THEME,
      strokeColor: stroke,
      backgroundColor: "transparent",
      roundness: null,
      groupIds: [`lane-${lane.id}`],
    } as ExcalidrawElementSkeleton);
    if (lane.label) {
      out.push({
        type: "text",
        id: `lane-${lane.id}-label`,
        text: lane.label,
        x: lane.x + BPMN_LANE_LABEL_WIDTH - 12,
        y: lane.y + lane.height / 2,
        angle: -Math.PI / 2,
        ...ACADEMIC_MONOCHROME_THEME,
        strokeColor: stroke,
        fontSize: BPMN_LABEL_FONT_SIZE,
        fontFamily: theme.fontFamily,
        textAlign: "center",
        verticalAlign: "middle",
      } as ExcalidrawElementSkeleton);
    }
  }
  return out;
}

export function buildSkeletons(
  positioned: PositionedAST,
  accentColor: string = ACADEMIC_MONOCHROME_THEME.strokeColor,
): ExcalidrawElementSkeleton[] {
  const theme: Theme = {
    strokeColor: accentColor,
    fontFamily: ACADEMIC_MONOCHROME_THEME.fontFamily,
    fontSize: positioned.category === "bpmn" ? BPMN_LABEL_FONT_SIZE : 16,
  };
  const skeletons: ExcalidrawElementSkeleton[] = [];

  if (positioned.category === "bpmn" && positioned.pools) {
    skeletons.push(...poolLaneSkeletons(positioned, theme));
  }

  for (const node of positioned.nodes) {
    skeletons.push(
      ...(positioned.category === "bpmn"
        ? bpmnNodeSkeletons(node, theme)
        : flowNodeSkeletons(node, theme)),
    );
  }

  positioned.edges.forEach((edge, index) => {
    const skel = edgeSkeleton(edge, index, theme);
    if (skel) {
      skeletons.push(skel);
    }
  });

  skeletons.push(titleSkeleton(positioned, theme));
  return skeletons;
}
