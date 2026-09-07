import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { PositionedNode } from "@/lib/types";
import { rawPathToPolylines } from "@/lib/bpmn-icons/scale-path";

// BPMN icon package: Excalidraw `line`/`ellipse` skeletons drawing canonical
// bpmn.io markers inside events, tasks, and gateways. Scale parameters ported
// 1:1 from bpmn-js BpmnRenderer.js; raw path data from PathMap.js.

export interface IconTheme {
  strokeColor: string;
  /** fill for throw-style (inverted) markers, per bpmn-js: fill = stroke */
  throwFill: string;
}

const WHITE = "#ffffff";

const ICON_BASE = {
  roughness: 0,
  fillStyle: "solid",
  strokeStyle: "solid",
  fontFamily: 2,
  fontSize: 11,
  textAlign: "center",
  verticalAlign: "middle",
  opacity: 100,
  roundness: null,
} as const;

/**
 * Converts raw-path subpaths (node-local coordinates) into `line` skeletons
 * positioned in scene coordinates.
 */
function subpathLines(
  idPrefix: string,
  node: PositionedNode,
  pathId: string,
  param: {
    xScaleFactor?: number;
    yScaleFactor?: number;
    position?: { mx: number; my: number };
    abspos?: { x: number; y: number };
  },
  opts: { fillColor?: string; strokeWidth?: number },
  theme: IconTheme,
  groupIds: string[],
): ExcalidrawElementSkeleton[] {
  const subpaths = rawPathToPolylines(pathId, {
    containerWidth: node.width,
    containerHeight: node.height,
    ...param,
  });
  const skeletons: ExcalidrawElementSkeleton[] = [];
  subpaths.forEach((pts, i) => {
    if (pts.length < 2) {
      return;
    }
    const first = pts[0];
    const local = pts.map(
      (p) => [p.x - first.x, p.y - first.y] as [number, number],
    );
    const xs = local.map((p) => p[0]);
    const ys = local.map((p) => p[1]);
    skeletons.push({
      type: "line",
      id: `${idPrefix}-${i}`,
      x: node.x + first.x,
      y: node.y + first.y,
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      points: local,
      groupIds,
      strokeColor: theme.strokeColor,
      strokeWidth: opts.strokeWidth ?? 1,
      backgroundColor: opts.fillColor ?? "transparent",
      ...ICON_BASE,
    } as ExcalidrawElementSkeleton);
  });
  return skeletons;
}

/**
 * bpmn-js drawCircle radius rule: r = round((w + h) / 4 - offset).
 */
function circleRadius(width: number, height: number, offset: number): number {
  return Math.round((width + height) / 4 - offset);
}

/**
 * Builds icon skeletons for a BPMN node. `containerShapeId` is the parent
 * shape; icons share its group so they move together on the canvas.
 */
export function buildBpmnIcons(
  node: PositionedNode,
  theme: IconTheme,
): ExcalidrawElementSkeleton[] {
  const groupIds = [`bpmn-${node.id}`];
  const id = (suffix: string) => `${node.id}-${suffix}`;
  const skeletons: ExcalidrawElementSkeleton[] = [];

  switch (node.type) {
    case "msg-start": {
      // catching message: white envelope (bpmn-js MessageEventDefinition)
      skeletons.push(
        ...subpathLines(
          id("msg"),
          node,
          "EVENT_MESSAGE",
          {
            xScaleFactor: 0.9,
            yScaleFactor: 0.9,
            position: { mx: 0.235, my: 0.315 },
          },
          { fillColor: WHITE },
          theme,
          groupIds,
        ),
      );
      break;
    }
    case "msg-end": {
      // throwing message: filled envelope (fill = stroke, per bpmn-js)
      skeletons.push(
        ...subpathLines(
          id("msg"),
          node,
          "EVENT_MESSAGE",
          {
            xScaleFactor: 0.9,
            yScaleFactor: 0.9,
            position: { mx: 0.235, my: 0.315 },
          },
          { fillColor: theme.throwFill },
          theme,
          groupIds,
        ),
      );
      break;
    }
    case "timer": {
      // intermediate timer: inner ring + clock face + hands + 12 ticks
      const cx = node.x + node.width / 2;
      const cy = node.y + node.height / 2;

      // bpmn-js IntermediateEvent inner circle: drawCircle offset = 3, sw 1
      const innerR = circleRadius(node.width, node.height, 3);
      skeletons.push({
        type: "ellipse",
        id: id("inner"),
        x: cx - innerR,
        y: cy - innerR,
        width: innerR * 2,
        height: innerR * 2,
        groupIds,
        strokeColor: theme.strokeColor,
        strokeWidth: 1,
        backgroundColor: WHITE,
        ...ICON_BASE,
      } as ExcalidrawElementSkeleton);

      // clock face: drawCircle offset = 0.2 * height, sw 2 → r=11 for 36×36
      const faceR = circleRadius(
        node.width,
        node.height,
        0.2 * node.height,
      );
      skeletons.push({
        type: "ellipse",
        id: id("face"),
        x: cx - faceR,
        y: cy - faceR,
        width: faceR * 2,
        height: faceR * 2,
        groupIds,
        strokeColor: theme.strokeColor,
        strokeWidth: 2,
        backgroundColor: WHITE,
        ...ICON_BASE,
      } as ExcalidrawElementSkeleton);

      skeletons.push(
        ...subpathLines(
          id("hands"),
          node,
          "EVENT_TIMER_WH",
          {
            xScaleFactor: 0.75,
            yScaleFactor: 0.75,
            position: { mx: 0.5, my: 0.5 },
          },
          { strokeWidth: 2 },
          theme,
          groupIds,
        ),
      );

      // 12 ticks, each rotated 30° around the event centre (bpmn-js)
      for (let i = 0; i < 12; i++) {
        const subpaths = rawPathToPolylines("EVENT_TIMER_LINE", {
          containerWidth: node.width,
          containerHeight: node.height,
          position: { mx: 0.5, my: 0.5 },
          xScaleFactor: 0.75,
          yScaleFactor: 0.75,
        });
        const angle = (i * Math.PI) / 6;
        subpaths.forEach((pts, j) => {
          if (pts.length < 2) {
            return;
          }
          const rotated = pts.map((p) => {
            const dx = node.x + p.x - cx;
            const dy = node.y + p.y - cy;
            return {
              x: cx + dx * Math.cos(angle) - dy * Math.sin(angle),
              y: cy + dx * Math.sin(angle) + dy * Math.cos(angle),
            };
          });
          const first = rotated[0];
          const local = rotated.map(
            (p) => [p.x - first.x, p.y - first.y] as [number, number],
          );
          skeletons.push({
            type: "line",
            id: `${id(`tick-${i}`)}-${j}`,
            x: first.x,
            y: first.y,
            width:
              Math.max(...local.map((p) => p[0])) -
              Math.min(...local.map((p) => p[0])),
            height:
              Math.max(...local.map((p) => p[1])) -
              Math.min(...local.map((p) => p[1])),
            points: local,
            groupIds,
            strokeColor: theme.strokeColor,
            strokeWidth: 1,
            backgroundColor: "transparent",
            ...ICON_BASE,
          } as ExcalidrawElementSkeleton);
        });
      }
      break;
    }
    case "send-task": {
      // black envelope (bpmn-js SendTask: fill = stroke, drawn at mx/my)
      skeletons.push(
        ...subpathLines(
          id("send"),
          node,
          "TASK_TYPE_SEND",
          {
            xScaleFactor: 1,
            yScaleFactor: 1,
            position: { mx: 0.285, my: 0.357 },
          },
          { fillColor: theme.throwFill },
          theme,
          groupIds,
        ),
      );
      break;
    }
    case "recv-task": {
      // white envelope (bpmn-js ReceiveTask)
      skeletons.push(
        ...subpathLines(
          id("recv"),
          node,
          "TASK_TYPE_SEND",
          {
            xScaleFactor: 0.9,
            yScaleFactor: 0.9,
            position: { mx: 0.3, my: 0.4 },
          },
          { fillColor: WHITE },
          theme,
          groupIds,
        ),
      );
      break;
    }
    case "script-task": {
      skeletons.push(
        ...subpathLines(
          id("script"),
          node,
          "TASK_TYPE_SCRIPT",
          { abspos: { x: 15, y: 20 } },
          { strokeWidth: 1 },
          theme,
          groupIds,
        ),
      );
      break;
    }
    case "user-task": {
      skeletons.push(
        ...subpathLines(
          id("user1"),
          node,
          "TASK_TYPE_USER_1",
          { abspos: { x: 15, y: 12 } },
          { strokeWidth: 1 },
          theme,
          groupIds,
        ),
        ...subpathLines(
          id("user2"),
          node,
          "TASK_TYPE_USER_2",
          { abspos: { x: 15, y: 12 } },
          { strokeWidth: 1 },
          theme,
          groupIds,
        ),
        ...subpathLines(
          id("user3"),
          node,
          "TASK_TYPE_USER_3",
          { abspos: { x: 15, y: 12 } },
          { fillColor: theme.strokeColor, strokeWidth: 1 },
          theme,
          groupIds,
        ),
      );
      break;
    }
    case "gw-ex": {
      // exclusive gateway: filled X (isMarkerVisible)
      skeletons.push(
        ...subpathLines(
          id("xor"),
          node,
          "GATEWAY_EXCLUSIVE",
          {
            xScaleFactor: 0.4,
            yScaleFactor: 0.4,
            position: { mx: 0.32, my: 0.3 },
          },
          { fillColor: theme.throwFill },
          theme,
          groupIds,
        ),
      );
      break;
    }
    case "gw-para": {
      // parallel gateway: filled +
      skeletons.push(
        ...subpathLines(
          id("plus"),
          node,
          "GATEWAY_PARALLEL",
          {
            xScaleFactor: 0.6,
            yScaleFactor: 0.6,
            position: { mx: 0.46, my: 0.2 },
          },
          { fillColor: theme.throwFill },
          theme,
          groupIds,
        ),
      );
      break;
    }
    case "gw-inc": {
      // inclusive gateway: circle r = 0.24 × size, strokeWidth 2.5
      const size = Math.min(node.width, node.height);
      const r = 0.24 * size;
      skeletons.push({
        type: "ellipse",
        id: id("inc"),
        x: node.x + node.width / 2 - r,
        y: node.y + node.height / 2 - r,
        width: r * 2,
        height: r * 2,
        groupIds,
        strokeColor: theme.strokeColor,
        strokeWidth: 2.5,
        backgroundColor: WHITE,
        ...ICON_BASE,
      } as ExcalidrawElementSkeleton);
      break;
    }
    default:
      break;
  }
  return skeletons;
}

/** The data-object folded-corner outline is itself the shape (bpmn-js). */
export function buildDataObjectOutline(
  node: PositionedNode,
  theme: IconTheme,
): ExcalidrawElementSkeleton[] {
  return subpathLines(
    `${node.id}-doc`,
    node,
    "DATA_OBJECT_PATH",
    {
      xScaleFactor: 1,
      yScaleFactor: 1,
      position: { mx: 0.474, my: 0.296 },
    },
    { fillColor: WHITE, strokeWidth: 2 },
    theme,
    [`bpmn-${node.id}`],
  );
}
