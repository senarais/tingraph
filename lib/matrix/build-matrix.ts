import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { marked } from "@/lib/canvas/units";
import { MONOCHROME, type Ink } from "@/lib/ink";
import { FORMAL, type SheetStyle } from "@/lib/sheet";
import { markColor, readableOn, type PaletteId } from "@/lib/chart/spec";
import { textWidth, wrapByWidth } from "@/lib/layout/compute-layout";
import { matrixStyle, type MatrixSpec } from "@/lib/matrix/spec";

/**
 * A 2×2 matrix, laid out and drawn in one pass.
 *
 * A matrix has no scale to work out and no marks to place against one, so its
 * geometry is four rectangles and two rules, and splitting that across two
 * files would only spread four lines of arithmetic over two. What it does have
 * is a lot of writing round the outside, and most of the work here is leaving
 * room for it.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Pt {
  x: number;
  y: number;
}

const BASE = {
  fillStyle: "solid",
  strokeStyle: "solid",
  opacity: 100,
  roundness: null,
  angle: 0,
} as const;

const PAD = 16;
const TITLE = 17;
const POLE = 12;
const GAP = 10;

function toPaper(hex: string, amount: number): string {
  if (amount <= 0) {
    return hex;
  }
  const value = hex.replace("#", "");
  const full =
    value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  return `#${[0, 2, 4]
    .map((at) => parseInt(full.slice(at, at + 2), 16))
    .map((channel) => Math.round(channel + (255 - channel) * amount))
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

interface Paper {
  ink: string;
  font: number;
  lineHeight: number;
  roughness: number;
  unit: string;
  id: (part: string) => string;
}

function text(
  paper: Paper,
  content: string,
  at: Pt,
  options: {
    size: number;
    align?: "left" | "center" | "right";
    middle?: boolean;
    color?: string;
    turned?: boolean;
  },
): ExcalidrawElementSkeleton {
  return {
    type: "text",
    id: paper.id("text"),
    text: content,
    x: Math.round(at.x),
    y: Math.round(at.y),
    ...BASE,
    strokeColor: options.color ?? paper.ink,
    backgroundColor: "transparent",
    strokeWidth: 1,
    roughness: paper.roughness,
    fontFamily: paper.font,
    fontSize: options.size,
    lineHeight: paper.lineHeight,
    textAlign: options.align ?? "center",
    verticalAlign: options.middle ? "middle" : "top",
    ...(options.turned ? { angle: -Math.PI / 2 } : {}),
    groupIds: [paper.unit],
    ...marked({ unit: paper.unit, kind: "figure" }),
  } as unknown as ExcalidrawElementSkeleton;
}

function box(
  paper: Paper,
  rect: Rect,
  options: { stroke: string; fill: string; width: number; round?: number },
): ExcalidrawElementSkeleton {
  return {
    type: "rectangle",
    id: paper.id("box"),
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
    ...BASE,
    strokeColor: options.stroke,
    backgroundColor: options.fill,
    strokeWidth: options.width,
    roundness: options.round ? { type: 3, value: options.round } : null,
    roughness: paper.roughness,
    groupIds: [paper.unit],
    ...marked({ unit: paper.unit, kind: "figure" }),
  } as unknown as ExcalidrawElementSkeleton;
}

function rule(
  paper: Paper,
  from: Pt,
  to: Pt,
  options: { stroke: string; width: number; arrow?: boolean },
): ExcalidrawElementSkeleton {
  return {
    type: options.arrow ? "arrow" : "line",
    id: paper.id("rule"),
    x: Math.round(from.x),
    y: Math.round(from.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
    points: [
      [0, 0],
      [Math.round(to.x - from.x), Math.round(to.y - from.y)],
    ],
    ...BASE,
    strokeColor: options.stroke,
    strokeWidth: options.width,
    roughness: paper.roughness,
    ...(options.arrow
      ? { startArrowhead: "triangle", endArrowhead: "triangle" }
      : { startArrowhead: null, endArrowhead: null }),
    groupIds: [paper.unit],
    ...marked({ unit: paper.unit, kind: "figure" }),
  } as unknown as ExcalidrawElementSkeleton;
}

/**
 * Where the four quadrants sit.
 *
 * Every side keeps back exactly the room the writing on it needs: the ends of
 * the across rule are written beside the field, the axis's own name goes
 * outside those, and the title takes a band off the top. Guessing a fraction
 * of the width instead is what makes an axis name land on a pole label.
 */
export function matrixField(spec: MatrixSpec, at: Rect): Rect {
  const poles = spec.options.axis !== "none";
  const pole = (text: string) => textWidth(text, POLE);
  const left =
    PAD +
    (spec.y.label ? POLE + 14 : 0) +
    (poles ? pole(spec.x.low) + GAP + 10 : 0);
  const right = PAD + (poles ? pole(spec.x.high) + GAP + 10 : 0);
  const top = PAD + (spec.title ? TITLE + 14 : 0) + (poles ? POLE + GAP + 8 : 0);
  const bottom =
    PAD + (poles ? POLE + GAP + 8 : 0) + (spec.x.label ? POLE + 16 : 0);
  return {
    x: at.x + left,
    y: at.y + top,
    width: Math.max(60, at.width - left - right),
    height: Math.max(60, at.height - top - bottom),
  };
}

/** The box the title is written in, which is what a reader points at to rename it. */
export function matrixTitle(at: Rect): Rect {
  const middle = at.y + PAD - 6;
  return {
    x: at.x + at.width / 2 - 110,
    y: middle - (TITLE + 6) / 2,
    width: 220,
    height: TITLE + 6,
  };
}

/** The four quadrant rectangles, in the order the spec lists them. */
export function matrixQuadrants(spec: MatrixSpec, at: Rect): Rect[] {
  const field = matrixField(spec, at);
  const style = matrixStyle(spec.options.style);
  const half = style.gap / 2;
  const w = (field.width - style.gap) / 2;
  const h = (field.height - style.gap) / 2;
  const left = field.x;
  const right = field.x + field.width / 2 + half;
  const top = field.y;
  const low = field.y + field.height / 2 + half;
  return [
    { x: left, y: top, width: w, height: h },
    { x: right, y: top, width: w, height: h },
    { x: left, y: low, width: w, height: h },
    { x: right, y: low, width: w, height: h },
  ];
}

/** Where one item sits in the field, from its share across and up. */
export function itemAt(spec: MatrixSpec, at: Rect, item: { x: number; y: number }): Pt {
  const field = matrixField(spec, at);
  return {
    x: Math.round(field.x + Math.min(1, Math.max(0, item.x)) * field.width),
    y: Math.round(field.y + (1 - Math.min(1, Math.max(0, item.y))) * field.height),
  };
}

export function buildMatrixSkeletons(
  spec: MatrixSpec,
  at: Rect,
  ink: Ink = MONOCHROME,
  sheet: SheetStyle = FORMAL,
  unit = "matrix-1",
): ExcalidrawElementSkeleton[] {
  let n = 0;
  const paper: Paper = {
    ink: ink.color,
    font: sheet.fontFamily,
    lineHeight: sheet.lineHeight,
    roughness: sheet.roughness,
    unit,
    id: (part) => `${unit}-${part}-${n++}`,
  };
  const style = matrixStyle(spec.options.style);
  const palette = spec.options.palette as PaletteId;
  const field = matrixField(spec, at);
  const quads = matrixQuadrants(spec, at);
  const size = spec.options.fontSize;

  const out: ExcalidrawElementSkeleton[] = [
    {
      type: "rectangle",
      id: `${unit}-frame`,
      x: Math.round(at.x),
      y: Math.round(at.y),
      width: Math.round(at.width),
      height: Math.round(at.height),
      ...BASE,
      strokeColor: "transparent",
      backgroundColor: "transparent",
      strokeWidth: 1,
      roughness: 0,
      groupIds: [unit],
      ...marked({ unit, kind: "figure", core: true, figure: spec }),
    } as unknown as ExcalidrawElementSkeleton,
  ];

  if (spec.title) {
    out.push(
      text(paper, spec.title, { x: at.x + at.width / 2, y: at.y + PAD - 6 }, {
        size: TITLE,
      }),
    );
  }

  // --- the four quadrants
  spec.quadrants.forEach((quadrant, index) => {
    const hue = markColor(palette, spec.options, index, quadrant.color);
    const fill = style.fill ? toPaper(hue, style.wash) : "transparent";
    out.push(
      box(paper, quads[index], {
        stroke: style.fill && style.wash > 0.5 ? hue : style.fill ? "transparent" : paper.ink,
        fill,
        width: style.fill && style.wash > 0.5 ? 1 : style.fill ? 0.5 : 1.5,
      }),
    );
    if (spec.options.labels !== "inside" || !quadrant.label) {
      return;
    }
    const rect = quads[index];
    const lines = wrapByWidth(quadrant.label, rect.width - 20, size + 2);
    const note = quadrant.note ? wrapByWidth(quadrant.note, rect.width - 24, size - 1) : [];
    const colour =
      style.fill && style.wash < 0.5 ? readableOn(fill) : paper.ink;
    const block = lines.length * (size + 2) * 1.25 + (note.length ? note.length * size * 1.3 + 6 : 0);
    out.push(
      text(
        paper,
        lines.join("\n"),
        { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 - block / 2 },
        { size: size + 2, color: colour },
      ),
    );
    if (note.length) {
      out.push(
        text(
          paper,
          note.join("\n"),
          {
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2 - block / 2 + lines.length * (size + 2) * 1.25 + 6,
          },
          { size: size - 1, color: colour },
        ),
      );
    }
  });

  // --- the quadrant names written outside, when that is what was asked for
  if (spec.options.labels === "corner") {
    const corners: Array<[number, Pt, "left" | "right"]> = [
      [0, { x: field.x - 8, y: field.y + 4 }, "right"],
      [1, { x: field.x + field.width + 8, y: field.y + 4 }, "left"],
      [2, { x: field.x - 8, y: field.y + field.height - size - 4 }, "right"],
      [3, { x: field.x + field.width + 8, y: field.y + field.height - size - 4 }, "left"],
    ];
    for (const [index, where, align] of corners) {
      if (spec.quadrants[index].label) {
        out.push(text(paper, spec.quadrants[index].label, where, { size, align }));
      }
    }
  }

  // --- the two rules, and the names at their ends
  if (spec.options.axis !== "none") {
    const middleY = field.y + field.height / 2;
    const middleX = field.x + field.width / 2;
    const arrows = spec.options.axis === "arrows";
    out.push(
      rule(
        paper,
        { x: field.x - GAP, y: middleY },
        { x: field.x + field.width + GAP, y: middleY },
        { stroke: paper.ink, width: style.axisWidth, arrow: arrows },
      ),
      rule(
        paper,
        { x: middleX, y: field.y - GAP },
        { x: middleX, y: field.y + field.height + GAP },
        { stroke: paper.ink, width: style.axisWidth, arrow: arrows },
      ),
    );

    const tab = (content: string, where: Pt, turned?: boolean) => {
      if (spec.options.axis === "tabs") {
        const wide = textWidth(content, POLE) + 16;
        out.push(
          box(
            paper,
            turned
              ? { x: where.x - POLE - 6, y: where.y - wide / 2, width: POLE + 12, height: wide }
              : { x: where.x - wide / 2, y: where.y - POLE / 2 - 6, width: wide, height: POLE + 12 },
            { stroke: paper.ink, fill: "#ffffff", width: 1.5 },
          ),
        );
      }
      out.push(
        text(paper, content, where, { size: POLE, middle: true, turned }),
      );
    };

    // the ends of each rule, each in its own lane outside the field
    out.push(
      text(paper, spec.x.low, { x: field.x - GAP - 8, y: middleY }, {
        size: POLE,
        align: "right",
        middle: true,
      }),
      text(paper, spec.x.high, { x: field.x + field.width + GAP + 8, y: middleY }, {
        size: POLE,
        align: "left",
        middle: true,
      }),
      text(paper, spec.y.high, { x: middleX, y: field.y - GAP - POLE - 4 }, {
        size: POLE,
      }),
      text(paper, spec.y.low, { x: middleX, y: field.y + field.height + GAP + 4 }, {
        size: POLE,
      }),
    );
    // and the axis names further out again, clear of both
    if (spec.x.label) {
      tab(spec.x.label, {
        x: middleX,
        y: field.y + field.height + GAP + POLE + 16,
      });
    }
    if (spec.y.label) {
      tab(spec.y.label, { x: at.x + PAD + POLE / 2 + 2, y: middleY }, true);
    }
  }

  // --- anything the reader has dropped into the field
  for (const item of spec.items) {
    const where = itemAt(spec, at, item);
    const wide = Math.max(54, textWidth(item.label, size - 1) + 18);
    const tall = size * 1.3 + 14;
    out.push(
      box(
        paper,
        { x: where.x - wide / 2, y: where.y - tall / 2, width: wide, height: tall },
        { stroke: paper.ink, fill: "#ffffff", width: 1.5, round: 6 },
      ),
      text(paper, item.label, where, { size: size - 1, middle: true }),
    );
  }

  return out;
}
