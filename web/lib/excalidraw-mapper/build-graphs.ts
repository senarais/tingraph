import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { marked, nodeUnit } from "@/lib/canvas/units";
import type { PositionedNode } from "@/lib/types";
import {
  CHROME_STROKE_WIDTH,
  softRoundness,
  type Theme,
} from "@/lib/excalidraw-mapper/theme";
import { caption, maker, shape, stroke } from "@/lib/excalidraw-mapper/build-uml";
import {
  CLASS_NAME_FONT_SIZE,
  CLASS_PAD_X,
  CLASS_ROW_FONT_SIZE,
  CLASS_ROW_HEIGHT,
  CLASS_STEREOTYPE_FONT_SIZE,
  classBoxLayout,
} from "@/lib/layout/layout-class";
import {
  DFD_BAND,
  DFD_CODE_FONT_SIZE,
  DFD_FONT_SIZE,
  DFD_LINE_HEIGHT,
  dfdCellWidth,
  wrapDfdLabel,
} from "@/lib/layout/layout-dfd";
import {
  STATE_FONT_SIZE,
  STATE_LINE_HEIGHT,
  STATE_PAD_X,
  STATE_ROW_FONT_SIZE,
  STATE_ROW_HEIGHT,
  stateBoxLayout,
} from "@/lib/layout/layout-state";
import { TREE_FONT_SIZE, wrapTreeLabel } from "@/lib/layout/layout-tree";

/**
 * The four graphs that came after the first seven: the UML class diagram, the
 * data flow diagram, the UML state machine and the tree.
 *
 * Like the three in `build-uml.ts`, each draws a handful of shapes the others
 * do not have, and shares with them only the unit mark and the pieces a shape
 * is put together from. Every caption that is not the one name of a plain box
 * is a text element of its own, so a member of a class or an activity of a
 * state can be double-clicked and retyped on the sheet.
 */

const PROCESS_ROUNDNESS = { type: 3, value: 12 } as const;
const STATE_ROUNDNESS = { type: 3, value: 14 } as const;

/** Where a caption of `rows` lines starts so that it sits in the middle of a band. */
function centred(top: number, height: number, rows: number, lineHeight: number): number {
  return top + (height - Math.max(1, rows) * lineHeight) / 2;
}

// -------------------------------------------------------------------- class

/**
 * One classifier: its name, a rule, its attributes, a rule, its operations.
 * Both lists are always drawn, empty or not, because a missing compartment
 * says "not shown here" and an empty one says "there are none".
 */
export function classNodeSkeletons(
  node: PositionedNode,
  theme: Theme,
): ExcalidrawElementSkeleton[] {
  const unit = nodeUnit("class", node.id);
  const piece = maker(unit, theme);
  const box = classBoxLayout(node);
  const cx = node.x + node.width / 2;
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
  ];

  const nameTop = box.stereotype ? node.y + 20 : node.y + 7;
  if (box.stereotype) {
    out.push(
      caption(piece, [box.stereotype], { x: cx, y: node.y + 6 }, CLASS_STEREOTYPE_FONT_SIZE),
    );
  }
  out.push(caption(piece, [node.label], { x: cx, y: nameTop }, CLASS_NAME_FONT_SIZE));

  for (const rule of [box.headerHeight, box.split].filter((at) => at < box.height)) {
    out.push(
      stroke(piece, [
        [node.x, node.y + rule],
        [node.x + node.width, node.y + rule],
      ]),
    );
  }
  for (const row of [...box.attributes, ...box.methods]) {
    out.push(
      caption(
        piece,
        [row.text],
        {
          x: node.x + CLASS_PAD_X,
          y: node.y + row.top + (CLASS_ROW_HEIGHT - CLASS_ROW_FONT_SIZE * 1.25) / 2,
        },
        CLASS_ROW_FONT_SIZE,
        "left",
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------- dfd

/**
 * One Gane–Sarson shape.
 *
 * The data store is the one drawn as strokes — a box with its right side left
 * open — so it carries a rectangle with no outline of its own for a flow to
 * tie itself to, the way a use case actor does. The rectangle is filled, which
 * is also what keeps a line passing behind a store from showing through it.
 */
export function dfdNodeSkeletons(
  node: PositionedNode,
  theme: Theme,
): ExcalidrawElementSkeleton[] {
  const unit = nodeUnit("dfd", node.id);
  const piece = maker(unit, theme);
  const lines = wrapDfdLabel(node.label);
  const cx = node.x + node.width / 2;

  if (node.type === "process") {
    return [
      shape(piece, {
        type: "rectangle",
        id: node.id,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        strokeWidth: CHROME_STROKE_WIDTH,
        roundness: PROCESS_ROUNDNESS,
        ...marked({ unit, kind: "node", core: true }),
      }),
      stroke(piece, [
        [node.x, node.y + DFD_BAND],
        [node.x + node.width, node.y + DFD_BAND],
      ]),
      caption(
        piece,
        [node.name ?? ""],
        { x: cx, y: centred(node.y, DFD_BAND, 1, DFD_CODE_FONT_SIZE * 1.25) },
        DFD_CODE_FONT_SIZE,
      ),
      caption(
        piece,
        lines,
        {
          x: cx,
          y: centred(node.y + DFD_BAND, node.height - DFD_BAND, lines.length, DFD_LINE_HEIGHT),
        },
        DFD_FONT_SIZE,
      ),
    ];
  }

  if (node.type === "store") {
    const cell = dfdCellWidth(node);
    const right = node.x + node.width;
    const bottom = node.y + node.height;
    return [
      shape(piece, {
        type: "rectangle",
        id: node.id,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        strokeColor: "transparent",
        strokeWidth: 1,
        roughness: 0,
        ...marked({ unit, kind: "node", core: true }),
      }),
      // top, left and bottom in one stroke: the right side is the open one
      stroke(piece, [
        [right, node.y],
        [node.x, node.y],
        [node.x, bottom],
        [right, bottom],
      ]),
      stroke(piece, [
        [node.x + cell, node.y],
        [node.x + cell, bottom],
      ]),
      caption(
        piece,
        [node.name ?? ""],
        {
          x: node.x + cell / 2,
          y: centred(node.y, node.height, 1, DFD_CODE_FONT_SIZE * 1.25),
        },
        DFD_CODE_FONT_SIZE,
      ),
      caption(
        piece,
        lines,
        {
          x: node.x + cell + 10,
          y: centred(node.y, node.height, lines.length, DFD_LINE_HEIGHT),
        },
        DFD_FONT_SIZE,
        "left",
      ),
    ];
  }

  // an external entity: a plain box, square at the corners whatever the style
  return [
    shape(piece, {
      type: "rectangle",
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      strokeWidth: CHROME_STROKE_WIDTH,
      ...marked({ unit, kind: "node", core: true }),
      label: {
        text: lines.join("\n"),
        fontSize: DFD_FONT_SIZE,
        fontFamily: theme.fontFamily,
      },
    }),
  ];
}

// -------------------------------------------------------------------- state

export function stateNodeSkeletons(
  node: PositionedNode,
  theme: Theme,
): ExcalidrawElementSkeleton[] {
  const unit = nodeUnit("state", node.id);
  const piece = maker(unit, theme);
  const outline = {
    id: node.id,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    ...marked({ unit, kind: "node", core: true }),
  };

  switch (node.type) {
    case "initial":
      return [
        shape(piece, {
          type: "ellipse",
          ...outline,
          backgroundColor: theme.strokeColor,
          strokeWidth: CHROME_STROKE_WIDTH,
        }),
      ];
    case "final":
      return [
        shape(piece, { type: "ellipse", ...outline, strokeWidth: CHROME_STROKE_WIDTH }),
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
      ];
    case "choice":
      return [shape(piece, { type: "diamond", ...outline, strokeWidth: CHROME_STROKE_WIDTH })];
    case "fork":
    case "join":
      return [
        shape(piece, {
          type: "rectangle",
          ...outline,
          backgroundColor: theme.strokeColor,
          strokeWidth: 1,
        }),
      ];
    default:
      break;
  }

  const box = stateBoxLayout(node);
  if (box.band === 0) {
    return [
      shape(piece, {
        type: "rectangle",
        ...outline,
        strokeWidth: CHROME_STROKE_WIDTH,
        roundness: STATE_ROUNDNESS,
        label: {
          text: box.name.join("\n"),
          fontSize: STATE_FONT_SIZE,
          fontFamily: theme.fontFamily,
        },
      }),
    ];
  }
  return [
    shape(piece, {
      type: "rectangle",
      ...outline,
      strokeWidth: CHROME_STROKE_WIDTH,
      roundness: STATE_ROUNDNESS,
    }),
    caption(
      piece,
      box.name,
      {
        x: node.x + node.width / 2,
        y: centred(node.y, box.band, box.name.length, STATE_LINE_HEIGHT),
      },
      STATE_FONT_SIZE,
    ),
    stroke(piece, [
      [node.x, node.y + box.band],
      [node.x + node.width, node.y + box.band],
    ]),
    ...box.rows.map((row) =>
      caption(
        piece,
        [row.text],
        {
          x: node.x + STATE_PAD_X,
          y: node.y + row.top + (STATE_ROW_HEIGHT - STATE_ROW_FONT_SIZE * 1.25) / 2,
        },
        STATE_ROW_FONT_SIZE,
        "left",
      ),
    ),
  ];
}

// --------------------------------------------------------------------- tree

/** A branch is a box and a leaf a rounded one, so the ends of a tree read at a glance. */
export function treeNodeSkeletons(
  node: PositionedNode,
  theme: Theme,
): ExcalidrawElementSkeleton[] {
  const unit = nodeUnit("tree", node.id);
  const piece = maker(unit, theme);
  const leaf = node.type === "leaf";
  return [
    shape(piece, {
      type: "rectangle",
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      strokeWidth: CHROME_STROKE_WIDTH,
      roundness: leaf ? STATE_ROUNDNESS : softRoundness(theme),
      ...marked({ unit, kind: "node", core: true, ...(leaf ? {} : { soft: true }) }),
      label: {
        text: wrapTreeLabel(node.label).join("\n"),
        fontSize: TREE_FONT_SIZE,
        fontFamily: theme.fontFamily,
      },
    }),
  ];
}
