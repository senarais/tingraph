import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { marked } from "@/lib/canvas/units";
import { MONOCHROME, type Ink } from "@/lib/ink";
import { FORMAL, type SheetStyle } from "@/lib/sheet";
import { softRoundness, themeFor } from "@/lib/excalidraw-mapper/theme";
import { textWidth, wrapByWidth } from "@/lib/layout/compute-layout";
import {
  prismaStyle,
  type PrismaBox,
  type PrismaSpec,
} from "@/lib/prisma/spec";

/**
 * A PRISMA flow, laid out and drawn.
 *
 * Two columns and four bands. The main column carries the records that stayed
 * in the review, the column beside it carries the ones that left at that step,
 * and the bands on the left name the phase. Every box is measured from its own
 * words before anything is placed, so the two columns of one row are as tall as
 * the longer of them and no caption is ever cut off.
 *
 * The rows are the flow. There is no third column and no diagonal: a reader
 * follows the arrows down the page, which is the order the review happened in.
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

export interface PrismaTextBoxPlan {
  box: Rect;
  /** where the box's own caption is written */
  title: Rect;
  /** where its total is written, when it has one */
  count: Rect | null;
  /** one box per line under the caption */
  items: Rect[];
  titleText: string;
  countText: string;
  itemTexts: string[];
}

export interface PrismaRowPlan extends PrismaTextBoxPlan {
  index: number;
  band: string;
  /** the box of records that left the flow at this row */
  side: PrismaTextBoxPlan | null;
}

export interface PrismaBandPlan {
  label: string;
  box: Rect;
  /** the caption's anchor: the middle of the band, turned a quarter */
  text: Rect;
  /** the size its name is set at, shrunk when the band is short */
  size: number;
}

export interface PrismaPlan {
  title: Rect;
  titleText: string;
  rows: PrismaRowPlan[];
  bands: PrismaBandPlan[];
  /** every vertical hop and every step out to a side box */
  arrows: Array<{ from: Pt; to: Pt }>;
  /** where the pair that adds and removes a row sits, under the last one */
  add: Pt;
  remove: Pt;
}

const BASE = {
  fillStyle: "solid",
  strokeStyle: "solid",
  opacity: 100,
  roundness: null,
  angle: 0,
} as const;

const PAD = 18;
const TITLE_SIZE = 17;
const TITLE_GAP = 12;
/** the width of the strip that carries a phase's name */
const BAND_WIDTH = 26;
const BAND_GAP = 14;
const BOX_PAD_X = 12;
const BOX_PAD_Y = 10;
const COUNT_GAP = 2;
const ITEM_GAP = 5;
/** the channel a downward arrow runs in */
const ROW_GAP = 34;
const COL_GAP = 18;
const MIN_MAIN = 120;

export function prismaLineHeight(size: number): number {
  return Math.max(9, Math.round(size * 1.3));
}

interface Measured {
  titleLines: string[];
  titleText: string;
  countText: string;
  itemTexts: string[];
  height: number;
}

function measure(
  box: PrismaBox,
  width: number,
  size: number,
  lineH: number,
): Measured {
  const inner = Math.max(24, width - BOX_PAD_X * 2);
  const titleLines = wrapByWidth(box.title, inner, size);
  const count = box.count.trim();
  const countText = count ? `(n = ${count})` : "";
  const itemTexts = box.items.map((item) => {
    const value = item.count.trim();
    const words = value ? `${item.label} (n = ${value})` : item.label;
    return wrapByWidth(words, inner, size).join("\n");
  });
  // a line whose caption has been cleared keeps its row, so it can be written
  // again from the sheet rather than disappearing under the reader
  const itemLines = itemTexts.reduce(
    (sum, text) => sum + Math.max(1, text ? text.split("\n").length : 0),
    0,
  );
  const height = Math.round(
    BOX_PAD_Y * 2 +
      Math.max(1, titleLines.length) * lineH +
      (countText ? COUNT_GAP + lineH : 0) +
      (itemTexts.length > 0 ? ITEM_GAP + itemLines * lineH : 0),
  );
  return { titleLines, titleText: titleLines.join("\n"), countText, itemTexts, height };
}

function textLayout(
  measured: Measured,
  box: Rect,
  lineH: number,
): Omit<PrismaTextBoxPlan, "box"> {
  const left = box.x + BOX_PAD_X;
  const width = Math.max(1, box.width - BOX_PAD_X * 2);
  let y = box.y + BOX_PAD_Y;

  const titleHeight = Math.max(1, measured.titleLines.length) * lineH;
  const title = { x: left, y, width, height: titleHeight };
  y += titleHeight;

  let count: Rect | null = null;
  if (measured.countText) {
    y += COUNT_GAP;
    count = { x: left, y, width, height: lineH };
    y += lineH;
  }

  const items: Rect[] = [];
  if (measured.itemTexts.length > 0) {
    y += ITEM_GAP;
  }
  for (const text of measured.itemTexts) {
    const lines = text ? text.split("\n").length : 1;
    const height = lines * lineH;
    items.push({ x: left, y, width, height });
    y += height;
  }

  return {
    title,
    count,
    items,
    titleText: measured.titleText,
    countText: measured.countText,
    itemTexts: measured.itemTexts,
  };
}

/**
 * Where everything sits. Kept apart from the drawing so the handles on the
 * sheet can ask the same question the renderer asks.
 */
export function planPrisma(spec: PrismaSpec, at: Rect): PrismaPlan {
  const size = spec.options.fontSize;
  const lineH = prismaLineHeight(size);

  const titleLines = spec.title
    ? wrapByWidth(spec.title, Math.max(40, at.width - PAD * 2), TITLE_SIZE)
    : [];
  const titleHeight = titleLines.length
    ? titleLines.length * prismaLineHeight(TITLE_SIZE)
    : 0;
  const title: Rect = {
    x: at.x + PAD,
    y: at.y + PAD,
    width: Math.max(1, at.width - PAD * 2),
    height: titleHeight,
  };
  const contentTop =
    at.y + PAD + (titleHeight > 0 ? titleHeight + TITLE_GAP : 0);

  const bands = showBands(spec);
  const bandWidth = bands ? BAND_WIDTH : 0;
  const bandGap = bands ? BAND_GAP : 0;
  const flowX = at.x + PAD + bandWidth + bandGap;
  const flowWidth = Math.max(80, at.width - PAD * 2 - bandWidth - bandGap);

  const hasSides = spec.steps.some((step) => step.side);
  const colGap = hasSides ? Math.max(COL_GAP, Math.round(flowWidth * 0.05)) : 0;
  const sideWidth = hasSides
    ? Math.max(
        70,
        Math.min(Math.round(flowWidth * 0.38), flowWidth - colGap - MIN_MAIN),
      )
    : 0;
  const mainWidth = hasSides
    ? Math.max(MIN_MAIN, flowWidth - sideWidth - colGap)
    : flowWidth;

  const measured = spec.steps.map((step) => ({
    main: measure(step, mainWidth, size, lineH),
    side: step.side ? measure(step.side, sideWidth, size, lineH) : null,
  }));

  const rows: PrismaRowPlan[] = [];
  /** the bottom of each row, including the side box when it is the taller */
  const rowBottoms: number[] = [];
  let cursor = contentTop;
  spec.steps.forEach((step, index) => {
    const main = measured[index].main;
    const side = measured[index].side;
    const rowHeight = Math.max(main.height, side?.height ?? 0);
    const mainBox: Rect = {
      x: flowX,
      y: cursor,
      width: mainWidth,
      height: main.height,
    };
    const sideBox: Rect | null = side
      ? {
          x: flowX + mainWidth + colGap,
          y: cursor,
          width: sideWidth,
          height: side.height,
        }
      : null;

    rows.push({
      index,
      band: step.band,
      box: mainBox,
      ...textLayout(main, mainBox, lineH),
      side:
        side && sideBox
          ? { box: sideBox, ...textLayout(side, sideBox, lineH) }
          : null,
    });
    rowBottoms.push(cursor + rowHeight);
    cursor += rowHeight + ROW_GAP;
  });

  const arrows: Array<{ from: Pt; to: Pt }> = [];
  for (let index = 0; index < rows.length - 1; index += 1) {
    const from = rows[index].box;
    const to = rows[index + 1].box;
    arrows.push({
      from: {
        x: Math.round(from.x + from.width / 2),
        y: Math.round(from.y + from.height),
      },
      to: { x: Math.round(to.x + to.width / 2), y: Math.round(to.y) },
    });
  }
  for (const row of rows) {
    if (!row.side) {
      continue;
    }
    // the step out meets the side box level with the main box's middle, pulled
    // inside it when the side box is the shorter of the two
    const middle = row.box.y + row.box.height / 2;
    const y = Math.round(
      Math.min(
        Math.max(middle, row.side.box.y + 8),
        row.side.box.y + row.side.box.height - 8,
      ),
    );
    arrows.push({
      from: { x: Math.round(row.box.x + row.box.width), y },
      to: { x: Math.round(row.side.box.x), y },
    });
  }

  const bandPlans: PrismaBandPlan[] = [];
  if (bands) {
    let index = 0;
    while (index < rows.length) {
      const label = spec.steps[index].band.trim();
      if (!label) {
        index += 1;
        continue;
      }
      let end = index;
      while (
        end + 1 < rows.length &&
        spec.steps[end + 1].band.trim() === label
      ) {
        end += 1;
      }
      const first = rows[index].box;
      const last = rowBottoms[end];
      // neighbouring bands meet in the middle of the channel between rows, so
      // the four strips read as one ruled column rather than four boxes
      const top = index === 0 ? first.y : first.y - ROW_GAP / 2;
      const bottom = end === rows.length - 1 ? last : last + ROW_GAP / 2;
      const box: Rect = {
        x: at.x + PAD,
        y: Math.round(top),
        width: BAND_WIDTH,
        height: Math.round(bottom - top),
      };
      // a band's name is turned on its side, so its length is what has to fit
      // the strip; a short band takes a smaller face rather than spilling over
      const ratio = Math.max(0.1, textWidth(label, 1));
      const size = Math.max(
        7,
        Math.min(spec.options.fontSize, Math.floor((box.height - 6) / ratio)),
      );
      bandPlans.push({ label, box, text: { ...box }, size });
      index = end + 1;
    }
  }

  const last = rows[rows.length - 1];
  const under = last
    ? {
        x: Math.round(last.box.x + last.box.width / 2),
        y: Math.round(
          Math.min(
            last.box.y + last.box.height + 18,
            at.y + at.height - 14,
          ),
        ),
      }
    : { x: Math.round(at.x + at.width / 2), y: Math.round(at.y + at.height / 2) };

  return {
    title,
    titleText: titleLines.join("\n"),
    rows,
    bands: bandPlans,
    arrows,
    add: { x: under.x - 14, y: under.y },
    remove: { x: under.x + 14, y: under.y },
  };
}

function showBands(spec: PrismaSpec): boolean {
  return (
    spec.options.bands &&
    spec.steps.some((step) => step.band.trim() !== "")
  );
}

/**
 * The same flow on a sheet tall enough to hold it.
 *
 * A row added, a line that wraps at the chosen width, or a larger face all make
 * the flow taller, and a figure is drawn inside its own frame. Growing the
 * height is the notation's own answer to that; it never shrinks one, because
 * the reader may have made the sheet bigger on purpose.
 */
export function grownPrisma(spec: PrismaSpec): PrismaSpec {
  const plan = planPrisma(spec, { x: 0, y: 0, ...spec.options });
  const bottom = plan.rows.reduce((most, row) => {
    const side = row.side ? row.side.box.y + row.side.box.height : 0;
    return Math.max(most, row.box.y + row.box.height, side);
  }, 0);
  const needed = Math.ceil(bottom + 40);
  if (needed <= spec.options.height) {
    return spec;
  }
  return { ...spec, options: { ...spec.options, height: needed } };
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
  rect: Rect,
  options: { size: number; color?: string; vertical?: boolean },
): ExcalidrawElementSkeleton {
  return {
    type: "text",
    id: paper.id("text"),
    text: content,
    // centre/middle alignment: Excalidraw reads x and y as the anchor point
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height / 2),
    ...BASE,
    ...(options.vertical ? { angle: -Math.PI / 2 } : {}),
    strokeColor: options.color ?? paper.ink,
    backgroundColor: "transparent",
    strokeWidth: 1,
    roughness: paper.roughness,
    fontFamily: paper.font,
    fontSize: options.size,
    lineHeight: paper.lineHeight,
    textAlign: "center",
    verticalAlign: "middle",
    groupIds: [paper.unit],
    ...marked({ unit: paper.unit, kind: "figure" }),
  } as unknown as ExcalidrawElementSkeleton;
}

function box(
  paper: Paper,
  rect: Rect,
  options: {
    stroke: string;
    fill: string;
    width: number;
    roundness: { type: number; value: number } | null;
    soft?: boolean;
    wash?: boolean;
  },
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
    roundness: options.roundness,
    roughness: paper.roughness,
    groupIds: [paper.unit],
    ...marked({
      unit: paper.unit,
      kind: "figure",
      ...(options.soft ? { soft: true } : {}),
      ...(options.wash ? { wash: true } : {}),
    }),
  } as unknown as ExcalidrawElementSkeleton;
}

function arrow(
  paper: Paper,
  from: Pt,
  to: Pt,
  stroke: string,
  width: number,
): ExcalidrawElementSkeleton {
  return {
    type: "arrow",
    id: paper.id("arrow"),
    x: from.x,
    y: from.y,
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
    points: [
      [0, 0],
      [Math.round(to.x - from.x), Math.round(to.y - from.y)],
    ],
    ...BASE,
    strokeColor: stroke,
    backgroundColor: "transparent",
    strokeWidth: width,
    roughness: paper.roughness,
    startArrowhead: null,
    endArrowhead: "triangle",
    groupIds: [paper.unit],
    ...marked({ unit: paper.unit, kind: "figure" }),
  } as unknown as ExcalidrawElementSkeleton;
}

export function buildPrismaSkeletons(
  spec: PrismaSpec,
  at: Rect,
  ink: Ink = MONOCHROME,
  sheet: SheetStyle = FORMAL,
  unit = "prisma-1",
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
  const style = prismaStyle(spec.options.style);
  const theme = themeFor(ink, "prisma", sheet);
  const plan = planPrisma(spec, at);
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

  for (const band of plan.bands) {
    out.push(
      box(paper, band.box, {
        stroke: paper.ink,
        fill: style.bandFill ? ink.tint : "transparent",
        width: style.lineWidth,
        roundness: null,
        wash: style.bandFill,
      }),
      text(paper, band.label, band.text, {
        size: band.size,
        vertical: true,
        color: paper.ink,
      }),
    );
  }

  for (const line of plan.arrows) {
    out.push(arrow(paper, line.from, line.to, paper.ink, style.lineWidth));
  }

  const drawBox = (planned: PrismaTextBoxPlan, titleSize: number) => {
    out.push(
      box(paper, planned.box, {
        stroke: paper.ink,
        fill: "#ffffff",
        width: style.lineWidth,
        roundness: softRoundness(theme),
        soft: true,
      }),
    );
    if (planned.titleText) {
      out.push(text(paper, planned.titleText, planned.title, { size: titleSize }));
    }
    if (planned.count && planned.countText) {
      out.push(text(paper, planned.countText, planned.count, { size }));
    }
    planned.itemTexts.forEach((item, index) => {
      if (!item) {
        return;
      }
      out.push(text(paper, item, planned.items[index], { size }));
    });
  };

  for (const row of plan.rows) {
    drawBox(row, size);
    if (row.side) {
      drawBox(row.side, size);
    }
  }

  if (plan.titleText) {
    out.push(text(paper, plan.titleText, plan.title, { size: TITLE_SIZE }));
  }

  return out;
}
