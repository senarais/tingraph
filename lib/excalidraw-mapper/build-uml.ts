import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { marked, nodeUnit } from "@/lib/canvas/units";
import type { PositionedLane, PositionedNode, PositionedPool } from "@/lib/types";
import {
  ACADEMIC_MONOCHROME_THEME,
  CHROME_STROKE_WIDTH,
  WHITE,
  softRoundness,
  type Theme,
} from "@/lib/excalidraw-mapper/theme";
import { ACTOR_ICON, USECASE_FONT_SIZE } from "@/lib/layout/layout-usecase";
import {
  ACTIVITY_FONT_SIZE,
  ACTIVITY_LABEL_FONT_SIZE,
  ACTIVITY_LINE_HEIGHT,
  activityHasExternalLabel,
  wrapActivityLabel,
} from "@/lib/layout/layout-activity";
import {
  ERD_NAME_FONT_SIZE,
  ERD_PAD_X,
  ERD_ROW_FONT_SIZE,
  erdBoxLayout,
} from "@/lib/layout/layout-erd";
import { wrapByWidth } from "@/lib/layout/text";

/**
 * The three UML notations that are drawn as boxes and lines: the use case
 * diagram, the activity diagram and the entity relationship diagram.
 *
 * They share a file because they share nothing but this: each one draws a
 * handful of shapes the others do not have, and none of it belongs in the
 * dispatcher. What they do share with every other notation is the unit mark —
 * an actor is a stick figure made of five shapes that must read as one, the
 * same way a BPMN task and its marker do.
 */

const ACTION_ROUNDNESS = { type: 3, value: 14 } as const;

interface Piece {
  unit: string;
  theme: Theme;
  id: (part: string) => string;
}

function shape(piece: Piece, body: Record<string, unknown>): ExcalidrawElementSkeleton {
  return {
    ...ACADEMIC_MONOCHROME_THEME,
    roughness: piece.theme.roughness,
    strokeColor: piece.theme.strokeColor,
    backgroundColor: WHITE,
    roundness: null,
    groupIds: [piece.unit],
    ...marked({ unit: piece.unit, kind: "node" }),
    ...body,
  } as unknown as ExcalidrawElementSkeleton;
}

/** A caption written on the paper rather than bound inside a shape. */
function caption(
  piece: Piece,
  lines: string[],
  at: { x: number; y: number },
  fontSize: number,
  align: "left" | "center" | "right" = "center",
  /** which piece of the element's spec this caption carries, if it carries one */
  part?: string,
): ExcalidrawElementSkeleton {
  return shape(piece, {
    type: "text",
    id: piece.id("text"),
    text: lines.join("\n"),
    x: Math.round(at.x),
    y: Math.round(at.y),
    backgroundColor: "transparent",
    fontSize,
    fontFamily: piece.theme.fontFamily,
    textAlign: align,
    verticalAlign: "top",
    ...marked({ unit: piece.unit, kind: "node", core: true, ...(part ? { part } : {}) }),
  });
}

/**
 * A rule, written in sheet coordinates. Excalidraw holds a line as an origin
 * and corners measured from it, so the first point becomes the origin — a line
 * left at 0,0 with its corners out in the drawing would carry a bounding box
 * reaching back to the origin, and everything that reads an element's box
 * would read it wrong.
 */
function stroke(
  piece: Piece,
  points: Array<[number, number]>,
  options: { width?: number; mark?: "lane" | "frame" } = {},
): ExcalidrawElementSkeleton {
  const [first] = points;
  const local = points.map((point) => [point[0] - first[0], point[1] - first[1]]);
  const xs = local.map((point) => point[0]);
  const ys = local.map((point) => point[1]);
  return shape(piece, {
    type: "line",
    id: piece.id("line"),
    x: Math.round(first[0]),
    y: Math.round(first[1]),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    points: local,
    backgroundColor: "transparent",
    strokeWidth: options.width ?? CHROME_STROKE_WIDTH,
    ...(options.mark ? marked({ unit: piece.unit, kind: options.mark }) : {}),
  });
}

function maker(unit: string, theme: Theme): Piece {
  let n = 0;
  return { unit, theme, id: (part) => `${unit}-${part}-${n++}` };
}

/**
 * The same caption, but stamped as part of a lane or a boundary rather than a
 * node. It carries `part: "name"`, so the panel reads the frame's name off the
 * drawing and a rename writes to this one piece.
 */
function chromeCaption(
  piece: Piece,
  kind: "lane" | "frame",
  lines: string[],
  at: { x: number; y: number },
  fontSize: number,
): ExcalidrawElementSkeleton {
  return {
    ...caption(piece, lines, at, fontSize),
    ...marked({ unit: piece.unit, kind, core: true, part: "name" }),
  } as ExcalidrawElementSkeleton;
}

// ------------------------------------------------------------------ usecase

/**
 * One use case diagram element: the oval a goal is written in, or the stick
 * figure of whoever wants it.
 *
 * The actor is drawn inside a box with nothing on it, and that box is what a
 * line ties itself to. Without it a connector would find the head — the only
 * piece of a stick figure that is a shape at all — and every association in
 * the drawing would point at a small circle.
 */
export function usecaseNodeSkeletons(
  node: PositionedNode,
  theme: Theme,
): ExcalidrawElementSkeleton[] {
  const unit = nodeUnit("usecase", node.id);
  const piece = maker(unit, theme);

  if (node.type !== "actor") {
    return [
      shape(piece, {
        type: "ellipse",
        id: node.id,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        strokeWidth: CHROME_STROKE_WIDTH,
        ...marked({ unit, kind: "node", core: true, part: "name" }),
        label: {
          text: wrapByWidth(node.label, node.width - 34, USECASE_FONT_SIZE).join("\n"),
          fontSize: USECASE_FONT_SIZE,
          fontFamily: theme.fontFamily,
        },
      }),
    ];
  }

  const cx = node.x + node.width / 2;
  const top = node.y + 2;
  const head = 15;
  return [
    // the box a line ties itself to; it is never drawn
    shape(piece, {
      type: "rectangle",
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: ACTOR_ICON,
      strokeColor: "transparent",
      backgroundColor: "transparent",
      strokeWidth: 1,
      roughness: 0,
      ...marked({ unit, kind: "node", core: true }),
    }),
    shape(piece, {
      type: "ellipse",
      id: piece.id("head"),
      x: Math.round(cx - head / 2),
      y: top,
      width: head,
      height: head,
      strokeWidth: CHROME_STROKE_WIDTH,
    }),
    stroke(piece, [
      [cx, top + head],
      [cx, top + head + 15],
    ]),
    stroke(piece, [
      [cx - 12, top + head + 5],
      [cx + 12, top + head + 5],
    ]),
    stroke(piece, [
      [cx - 11, top + head + 31],
      [cx, top + head + 15],
      [cx + 11, top + head + 31],
    ]),
    caption(
      piece,
      wrapByWidth(node.label, node.width + 30, USECASE_FONT_SIZE),
      { x: cx, y: node.y + ACTOR_ICON + 6 },
      USECASE_FONT_SIZE,
      "center",
      "name",
    ),
  ];
}

/** The boundary a system's use cases stand inside, with its name along the top. */
export function usecaseSystemSkeletons(
  pool: PositionedPool,
  theme: Theme,
): ExcalidrawElementSkeleton[] {
  const unit = `frame-${pool.id}`;
  const piece = maker(unit, theme);
  const out: ExcalidrawElementSkeleton[] = [
    shape(piece, {
      type: "rectangle",
      id: unit,
      x: pool.x,
      y: pool.y,
      width: pool.width,
      height: pool.height,
      backgroundColor: "transparent",
      strokeWidth: CHROME_STROKE_WIDTH,
      ...marked({ unit, kind: "frame", core: true }),
    }),
  ];
  if (pool.label) {
    out.push(
      chromeCaption(piece, "frame", [pool.label], {
        x: pool.x + pool.width / 2,
        y: pool.y + 13,
      }, 15),
    );
  }
  return out;
}

// ----------------------------------------------------------------- activity

export function activityNodeSkeletons(
  node: PositionedNode,
  theme: Theme,
): ExcalidrawElementSkeleton[] {
  const unit = nodeUnit("activity", node.id);
  const piece = maker(unit, theme);
  const out: ExcalidrawElementSkeleton[] = [];
  const cx = node.x + node.width / 2;

  switch (node.type) {
    case "initial":
      out.push(
        shape(piece, {
          type: "ellipse",
          id: node.id,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          backgroundColor: theme.strokeColor,
          strokeWidth: CHROME_STROKE_WIDTH,
          ...marked({ unit, kind: "node", core: true }),
        }),
      );
      break;
    case "final":
      out.push(
        shape(piece, {
          type: "ellipse",
          id: node.id,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          strokeWidth: CHROME_STROKE_WIDTH,
          ...marked({ unit, kind: "node", core: true }),
        }),
        shape(piece, {
          type: "ellipse",
          id: piece.id("dot"),
          x: node.x + 6,
          y: node.y + 6,
          width: node.width - 12,
          height: node.height - 12,
          backgroundColor: theme.strokeColor,
          strokeWidth: 1,
        }),
      );
      break;
    case "flow-final":
      out.push(
        shape(piece, {
          type: "ellipse",
          id: node.id,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          strokeWidth: CHROME_STROKE_WIDTH,
          ...marked({ unit, kind: "node", core: true }),
        }),
        stroke(piece, [
          [node.x + 6, node.y + 6],
          [node.x + node.width - 6, node.y + node.height - 6],
        ]),
        stroke(piece, [
          [node.x + node.width - 6, node.y + 6],
          [node.x + 6, node.y + node.height - 6],
        ]),
      );
      break;
    case "decision":
    case "merge":
      out.push(
        shape(piece, {
          type: "diamond",
          id: node.id,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          strokeWidth: CHROME_STROKE_WIDTH,
          ...marked({ unit, kind: "node", core: true }),
        }),
      );
      break;
    case "fork":
    case "join":
      out.push(
        shape(piece, {
          type: "rectangle",
          id: node.id,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          backgroundColor: theme.strokeColor,
          strokeWidth: 1,
          ...marked({ unit, kind: "node", core: true }),
        }),
      );
      break;
    default:
      out.push(
        shape(piece, {
          type: "rectangle",
          id: node.id,
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
          strokeWidth: CHROME_STROKE_WIDTH,
          // an action is a rounded box; an object node is a square one
          roundness: node.type === "object" ? softRoundness(theme) : ACTION_ROUNDNESS,
          ...marked({
            unit,
            kind: "node",
            core: true,
            part: "name",
            ...(node.type === "object" ? { soft: true } : {}),
          }),
          label: {
            text: node.label,
            fontSize: ACTIVITY_FONT_SIZE,
            fontFamily: theme.fontFamily,
          },
        }),
      );
      break;
  }

  if (activityHasExternalLabel(node.type) && node.label && node.label !== node.id) {
    const lines = wrapActivityLabel(node.label);
    out.push(
      caption(
        piece,
        lines,
        { x: cx, y: node.y + node.height + 6 },
        ACTIVITY_LABEL_FONT_SIZE,
        "center",
        "name",
      ),
    );
  }
  return out;
}

/**
 * The partitions: one frame with the names written above the columns. A UML
 * activity reads down the page while its partitions run across it, which is
 * exactly the other way round from a BPMN pool — so the band is along the top
 * and the captions are upright rather than turned on their side.
 */
export function activityChromeSkeletons(
  pool: PositionedPool,
  theme: Theme,
): ExcalidrawElementSkeleton[] {
  const band = pool.headerHeight ?? 0;
  const out: ExcalidrawElementSkeleton[] = [];
  const unit = `frame-${pool.id}`;
  const frame = maker(unit, theme);
  out.push(
    shape(frame, {
      type: "rectangle",
      id: unit,
      x: pool.x,
      y: pool.y,
      width: pool.width,
      height: pool.height,
      backgroundColor: "transparent",
      strokeWidth: CHROME_STROKE_WIDTH,
      ...marked({ unit, kind: "frame", core: true }),
    }),
  );
  if (band > 0) {
    out.push(
      stroke(
        frame,
        [
          [pool.x, pool.y + band],
          [pool.x + pool.width, pool.y + band],
        ],
        { mark: "frame" },
      ),
    );
  }

  pool.lanes.forEach((lane: PositionedLane, index: number) => {
    out.push(...activityColumnSkeletons(lane, theme, index > 0));
  });
  return out;
}

/**
 * One partition: the rule down its left side and the name above it. The
 * leftmost column is ruled by the frame itself, so it is drawn without one;
 * everything else in the sheet is the same whether the column came from the
 * source or was added on the canvas.
 */
export function activityColumnSkeletons(
  lane: PositionedLane,
  theme: Theme,
  rule: boolean,
): ExcalidrawElementSkeleton[] {
  const out: ExcalidrawElementSkeleton[] = [];
  const piece = maker(`lane-${lane.id}`, theme);
  const band = lane.headerHeight ?? 0;
  if (rule) {
    out.push(
      stroke(
        piece,
        [
          [lane.x, lane.y],
          [lane.x, lane.y + lane.height],
        ],
        { mark: "lane" },
      ),
    );
  }
  if (lane.label) {
    out.push(
      chromeCaption(piece, "lane", [lane.label], {
        x: lane.x + lane.width / 2,
        y: lane.y + (band - ACTIVITY_LINE_HEIGHT) / 2,
      }, ACTIVITY_FONT_SIZE),
    );
  }
  return out;
}

// ---------------------------------------------------------------------- erd

/**
 * One entity: a band with its name, and a row per attribute under it. The key
 * markers sit in a gutter of their own on the left, which is what lets a
 * reader find the primary key of every table at a glance rather than reading
 * each row.
 */
export function erdNodeSkeletons(
  node: PositionedNode,
  theme: Theme,
): ExcalidrawElementSkeleton[] {
  const unit = nodeUnit("erd", node.id);
  const piece = maker(unit, theme);
  const box = erdBoxLayout(node);
  const out: ExcalidrawElementSkeleton[] = [
    shape(piece, {
      type: "rectangle",
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      strokeWidth: CHROME_STROKE_WIDTH,
      ...marked({ unit, kind: "node", core: true }),
    }),
    shape(piece, {
      type: "rectangle",
      id: piece.id("band"),
      x: node.x,
      y: node.y,
      width: node.width,
      height: box.headerHeight,
      backgroundColor: theme.tint,
      strokeWidth: CHROME_STROKE_WIDTH,
      // the band holds the table's name, so it is the piece the panel reads
      // that name back off when the reader edits it on the sheet
      ...marked({ unit, kind: "node", core: true, wash: true, part: "name" }),
      label: {
        text: node.label,
        fontSize: ERD_NAME_FONT_SIZE,
        fontFamily: theme.fontFamily,
      },
    }),
  ];

  // a weak entity carries a second outline, the way the notation says
  if (node.type === "weak") {
    out.push(
      shape(piece, {
        type: "rectangle",
        id: piece.id("weak"),
        x: node.x + 4,
        y: node.y + 4,
        width: node.width - 8,
        height: node.height - 8,
        backgroundColor: "transparent",
        strokeWidth: 1,
      }),
    );
  }

  if (box.gutter > 0 && box.rows.length > 0) {
    out.push(
      stroke(piece, [
        [node.x + box.gutter, node.y + box.headerHeight],
        [node.x + box.gutter, node.y + node.height],
      ]),
    );
  }

  box.rows.forEach((row, index) => {
    const top = node.y + row.top + (box.rowHeight - ERD_ROW_FONT_SIZE * 1.25) / 2;
    if (index > 0) {
      out.push(
        stroke(
          piece,
          [
            [node.x, node.y + row.top],
            [node.x + node.width, node.y + row.top],
          ],
          { width: 1 },
        ),
      );
    }
    if (row.mark) {
      out.push(
        caption(piece, [row.mark], { x: node.x + box.gutter / 2, y: top }, ERD_ROW_FONT_SIZE),
      );
    }
    out.push(
      caption(
        piece,
        [row.name],
        { x: node.x + box.gutter + ERD_PAD_X, y: top },
        ERD_ROW_FONT_SIZE,
        "left",
        `field:${index}:name`,
      ),
    );
    if (row.type) {
      out.push(
        caption(
          piece,
          [row.type],
          { x: node.x + node.width - ERD_PAD_X, y: top },
          ERD_ROW_FONT_SIZE,
          "right",
          `field:${index}:type`,
        ),
      );
    }
  });
  return out;
}
