import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { marked } from "@/lib/canvas/units";
import { MONOCHROME, type Ink } from "@/lib/ink";
import { FORMAL, type SheetStyle } from "@/lib/sheet";
import { CATEGORICAL, toPaper } from "@/lib/chart/spec";
import { textWidth, wrapByWidth } from "@/lib/layout/text";
import {
  QUADRANT_CORNERS,
  type QuadrantCorner,
  type QuadrantSpec,
} from "@/lib/quadrant/spec";

/**
 * A 2×2 quadrant, laid out and drawn.
 *
 * A square-cornered field split down the middle both ways, an axis rule with
 * an arrowhead under it and up its left side, the axis's name half way along
 * and its low and high ends written at either end. A quarter's caption sits
 * in the middle of the quarter when nothing is plotted, and at the top of it
 * when something is, so a dot never lands on a caption.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Pt {
  x: number;
  y: number;
}

const BASE = { fillStyle: "solid", strokeStyle: "solid", roundness: null, angle: 0 } as const;
const PAD = 18;
const TITLE = 17;
/** room on the left for the up axis, its name turned and its ends */
const LEFT = 52;
/** room underneath for the across axis, its name and its ends */
const BOTTOM = 52;
/** how far the axis rules stand off the field */
const OFF = 12;
export const ITEM_RADIUS = 5;

export interface QuadrantPlan {
  field: Rect;
  title: Rect;
  /** each quarter's box, and where its caption goes */
  quarters: Record<QuadrantCorner, { box: Rect; at: Pt; width: number }>;
  /** the three captions along each axis: low end, name, high end */
  xLabels: { low: Rect; name: Rect; high: Rect };
  yLabels: { low: Rect; name: Rect; high: Rect };
  /** each item's dot, and the box its name is written in; `align` is the text's, so "right" runs left of the dot */
  items: Array<{ at: Pt; label: Rect; align: "left" | "right" }>;
}

/** Where a share of each axis lands on the field. */
export function quadrantPoint(field: Rect, x: number, y: number): Pt {
  return {
    x: field.x + (field.width * x) / 100,
    y: field.y + field.height - (field.height * y) / 100,
  };
}

/** The other way: the shares of each axis a point on the sheet stands at. */
export function quadrantShare(field: Rect, at: Pt): { x: number; y: number } {
  return {
    x: ((at.x - field.x) / Math.max(1, field.width)) * 100,
    y: ((field.y + field.height - at.y) / Math.max(1, field.height)) * 100,
  };
}

export function planQuadrant(spec: QuadrantSpec, at: Rect): QuadrantPlan {
  const size = spec.options.fontSize;
  const top = at.y + PAD + (spec.title ? TITLE + 14 : 0);
  const field: Rect = {
    x: at.x + PAD + LEFT,
    y: top,
    width: Math.max(80, at.width - PAD * 2 - LEFT),
    height: Math.max(80, at.y + at.height - PAD - BOTTOM - top),
  };
  const halfW = field.width / 2;
  const halfH = field.height / 2;
  const plotted = spec.items.length > 0;
  const quarter = (corner: QuadrantCorner) => {
    const right = corner.endsWith("right");
    const lower = corner.startsWith("bottom");
    const box = {
      x: field.x + (right ? halfW : 0),
      y: field.y + (lower ? halfH : 0),
      width: halfW,
      height: halfH,
    };
    return {
      box,
      at: { x: box.x + halfW / 2, y: plotted ? box.y + 12 + size / 2 : box.y + halfH / 2 },
      width: halfW - 16,
    };
  };
  const line = size + 4;
  const xRule = field.y + field.height + OFF;
  const yRule = field.x - OFF;
  const caption = (centre: Pt, text: string): Rect => {
    const width = Math.max(24, textWidth(text, size) + 8);
    return { x: centre.x - width / 2, y: centre.y - line / 2, width, height: line };
  };
  const turned = (centre: Pt, text: string): Rect => {
    const length = Math.max(24, textWidth(text, size) + 8);
    return { x: centre.x - line / 2, y: centre.y - length / 2, width: line, height: length };
  };

  return {
    field,
    title: {
      x: at.x + at.width / 2 - 140,
      y: at.y + PAD - (TITLE + 6) / 2,
      width: 280,
      height: TITLE + 6,
    },
    quarters: Object.fromEntries(QUADRANT_CORNERS.map((corner) => [corner, quarter(corner)])) as QuadrantPlan["quarters"],
    xLabels: {
      low: caption({ x: field.x + 14, y: xRule + 14 }, spec.x.low),
      name: caption({ x: field.x + halfW, y: xRule + 14 }, spec.x.label),
      high: caption({ x: field.x + field.width - 14, y: xRule + 14 }, spec.x.high),
    },
    yLabels: {
      low: turned({ x: yRule - 14, y: field.y + field.height - 14 }, spec.y.low),
      name: turned({ x: yRule - 14, y: field.y + halfH }, spec.y.label),
      high: turned({ x: yRule - 14, y: field.y + 14 }, spec.y.high),
    },
    items: spec.items.map((item) => {
      const dot = quadrantPoint(field, item.x, item.y);
      const width = Math.max(20, textWidth(item.label, size - 1) + 4);
      // a name stays in its own quarter: it runs right of the dot when it
      // fits before the quarter's right edge, left of it otherwise
      const quarterRight = item.x < 50 ? field.x + halfW : field.x + field.width;
      const quarterLeft = item.x < 50 ? field.x : field.x + halfW;
      const fitsRight = dot.x + ITEM_RADIUS + 4 + width <= quarterRight;
      const fitsLeft = dot.x - ITEM_RADIUS - 4 - width >= quarterLeft;
      const align: "left" | "right" = fitsRight || !fitsLeft ? "left" : "right";
      return {
        at: dot,
        align,
        label: {
          x: align === "left" ? dot.x + ITEM_RADIUS + 4 : dot.x - ITEM_RADIUS - 4 - width,
          y: dot.y - (size + 2) / 2,
          width,
          height: size + 2,
        },
      };
    }),
  };
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
  options: { size: number; align?: "left" | "center" | "right"; turned?: boolean },
): ExcalidrawElementSkeleton {
  return {
    type: "text",
    id: paper.id("text"),
    text: content,
    x: Math.round(at.x),
    y: Math.round(at.y),
    ...BASE,
    angle: options.turned ? -Math.PI / 2 : 0,
    strokeColor: paper.ink,
    backgroundColor: "transparent",
    strokeWidth: 1,
    opacity: 100,
    roughness: paper.roughness,
    fontFamily: paper.font,
    fontSize: options.size,
    lineHeight: paper.lineHeight,
    textAlign: options.align ?? "center",
    verticalAlign: "middle",
    groupIds: [paper.unit],
    ...marked({ unit: paper.unit, kind: "figure" }),
  } as unknown as ExcalidrawElementSkeleton;
}

function rule(paper: Paper, from: Pt, to: Pt, width: number, head = false): ExcalidrawElementSkeleton {
  return {
    type: head ? "arrow" : "line",
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
    strokeColor: paper.ink,
    backgroundColor: "transparent",
    strokeWidth: width,
    opacity: 100,
    roughness: paper.roughness,
    ...(head ? { startArrowhead: null, endArrowhead: "triangle" } : {}),
    groupIds: [paper.unit],
    ...marked({ unit: paper.unit, kind: "figure" }),
  } as unknown as ExcalidrawElementSkeleton;
}

export function buildQuadrantSkeletons(
  spec: QuadrantSpec,
  at: Rect,
  ink: Ink = MONOCHROME,
  sheet: SheetStyle = FORMAL,
  unit = "quadrant-1",
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
  const plan = planQuadrant(spec, at);
  const { field } = plan;
  const size = spec.options.fontSize;
  const tint = spec.options.style === "tint";

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
      opacity: 100,
      roughness: 0,
      groupIds: [unit],
      ...marked({ unit, kind: "figure", core: true, figure: spec }),
    } as unknown as ExcalidrawElementSkeleton,
  ];

  if (spec.title) {
    out.push(text(paper, spec.title, { x: at.x + at.width / 2, y: at.y + PAD }, { size: TITLE }));
  }

  // --- the four quarters
  QUADRANT_CORNERS.forEach((corner, index) => {
    const { box } = plan.quarters[corner];
    out.push({
      type: "rectangle",
      id: paper.id("quarter"),
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
      ...BASE,
      strokeColor: paper.ink,
      backgroundColor: tint ? toPaper(CATEGORICAL[index], 0.86) : "transparent",
      strokeWidth: 1.5,
      opacity: 100,
      roughness: paper.roughness,
      groupIds: [unit],
      ...marked({ unit, kind: "figure" }),
    } as unknown as ExcalidrawElementSkeleton);
  });

  // --- the axes, with their names and their ends
  const xRule = field.y + field.height + 12;
  const yRule = field.x - 12;
  out.push(rule(paper, { x: field.x, y: xRule }, { x: field.x + field.width, y: xRule }, 1.5, true));
  out.push(rule(paper, { x: yRule, y: field.y + field.height }, { x: yRule, y: field.y }, 1.5, true));
  const mid = (box: Rect): Pt => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  for (const [key, box] of Object.entries(plan.xLabels)) {
    const words = key === "name" ? spec.x.label : key === "low" ? spec.x.low : spec.x.high;
    if (words) out.push(text(paper, words, mid(box), { size }));
  }
  for (const [key, box] of Object.entries(plan.yLabels)) {
    const words = key === "name" ? spec.y.label : key === "low" ? spec.y.low : spec.y.high;
    if (words) out.push(text(paper, words, mid(box), { size, turned: true }));
  }

  // --- what each quarter is called
  for (const corner of QUADRANT_CORNERS) {
    const words = spec.quarters[corner];
    if (!words) continue;
    const place = plan.quarters[corner];
    const lines = wrapByWidth(words, place.width, size + 1);
    out.push(
      text(paper, lines.join("\n"), { x: place.at.x, y: place.at.y + ((lines.length - 1) * (size + 1) * 1.25) / 2 }, { size: size + 1 }),
    );
  }

  // --- the items plotted on the field
  spec.items.forEach((item, index) => {
    const spot = plan.items[index];
    out.push({
      type: "ellipse",
      id: paper.id("item"),
      x: Math.round(spot.at.x - ITEM_RADIUS),
      y: Math.round(spot.at.y - ITEM_RADIUS),
      width: ITEM_RADIUS * 2,
      height: ITEM_RADIUS * 2,
      ...BASE,
      strokeColor: paper.ink,
      backgroundColor: spec.options.color,
      strokeWidth: 1,
      opacity: 100,
      roughness: paper.roughness,
      groupIds: [unit],
      ...marked({ unit, kind: "figure" }),
    } as unknown as ExcalidrawElementSkeleton);
    if (item.label) {
      out.push(
        text(
          paper,
          item.label,
          { x: spot.align === "left" ? spot.label.x : spot.label.x + spot.label.width, y: spot.at.y },
          { size: size - 1, align: spot.align },
        ),
      );
    }
  });

  return out;
}
