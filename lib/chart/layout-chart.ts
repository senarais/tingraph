/**
 * Where every mark on a chart goes.
 *
 * This is the whole of a chart's geometry: the scale on the value axis, the
 * slots along the category axis, the rectangles, the runs, the slices, the
 * cloud, the key, and the room each caption needs. It answers in sheet units
 * and knows nothing about Excalidraw, so a chart can be worked out and checked
 * without a browser — `build-chart.ts` is the only file that turns any of it
 * into shapes.
 */

import { textWidth } from "@/lib/layout/compute-layout";
import {
  allValues,
  chartStyle,
  effectivePalette,
  legendFor,
  markColor,
  readableOn,
  type ChartSpec,
  type LegendPlace,
} from "@/lib/chart/spec";

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

export type Anchor = "left" | "center" | "right";

export interface Caption {
  text: string;
  at: Pt;
  align: Anchor;
  size: number;
  /** `at.y` is the caption's middle rather than its top */
  middle?: true;
  /** turned a quarter turn, for a value-axis caption or a long category */
  turned?: true;
  /** written in its own colour rather than in the sheet's ink */
  color?: string;
}

export interface AxisTick {
  value: number;
  /** where it sits on the sheet, along the value axis */
  at: number;
  label: string;
}

export interface Slot {
  label: string;
  /** the middle of the slot, along the category axis */
  at: number;
  size: number;
}

export interface BarMark {
  rect: Rect;
  color: string;
  value: number;
  series: number;
  category: number;
  /** the end the reader drags to change the reading */
  grip: Pt;
}

export interface RunMark {
  points: Pt[];
  color: string;
  series: number;
  /** the same run closed down to the baseline, when a wash is asked for */
  area: Pt[] | null;
}

export interface DotMark {
  at: Pt;
  color: string;
  radius: number;
  series: number;
  index: number;
  caption?: string;
}

export interface SliceMark {
  /** the closed outline of the slice, ready to fill */
  path: Pt[];
  color: string;
  value: number;
  share: number;
  index: number;
  /** the middle of the slice, at the radius its caption hangs from */
  mid: Pt;
  /** the far end of the edge this slice finishes on, which the reader drags */
  grip: Pt;
}

export interface LegendEntry {
  label: string;
  color: string;
  swatch: Rect;
  at: Pt;
}

export interface ChartDrawing {
  box: Rect;
  plot: Rect;
  /** the value axis, running up the page on a column chart */
  ticks: AxisTick[];
  slots: Slot[];
  /** where zero sits on the value axis, in sheet units */
  base: number;
  bars: BarMark[];
  runs: RunMark[];
  dots: DotMark[];
  slices: SliceMark[];
  trend: [Pt, Pt] | null;
  legend: LegendEntry[];
  captions: Caption[];
  /** true when the category axis runs across the page */
  across: boolean;
  /** the ring a donut leaves open, 0 on a full pie */
  hole: number;
  /** the value axis, so a point on the sheet can be read back as a number */
  scale: { min: number; max: number; step: number };
  /** the across axis of a scatter plot; the value axis on everything else */
  acrossScale: { min: number; max: number; step: number };
  /** pie only: where it is drawn */
  centre: Pt;
  radius: number;
}

const PAD = 14;
const TITLE_SIZE = 15;
const AXIS_SIZE = 11;
const LABEL_SIZE = 11;
const TITLE_GAP = 12;
/** paper left between two marks that would otherwise touch */
const SPACER = 2;
/** how much of a slot the bars in it may take; the rest is air */
const BAND = 0.62;
const MAX_BAND = 48;
const SWATCH = 10;
const TICK_TARGET = 5;

const round = (value: number) => Math.round(value * 100) / 100;

// --------------------------------------------------------------------- scale

/**
 * A scale a reader can read: the step is 1, 2 or 5 times a power of ten, and
 * the ends land on a step. A column always includes zero, because a bar that
 * starts anywhere else lies about its own length.
 */
export function niceScale(
  low: number,
  high: number,
  fromZero: boolean,
): { min: number; max: number; step: number } {
  const min = fromZero ? Math.min(0, low) : low;
  let max = fromZero ? Math.max(0, high) : high;
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1, step: 1 };
  }
  if (min === max) {
    max = min + (min === 0 ? 1 : Math.abs(min) * 0.5);
  }
  const raw = (max - min) / Math.max(1, TICK_TARGET - 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normal = raw / magnitude;
  // 2.5 earns its place on the ladder: without it a reading of 85 is ruled at
  // 0, 50, 100 and the chart loses two thirds of its grid
  const step =
    (normal <= 1 ? 1 : normal <= 2 ? 2 : normal <= 2.5 ? 2.5 : normal <= 5 ? 5 : 10) *
    magnitude;
  return {
    min: Math.floor(min / step) * step,
    max: Math.ceil(max / step) * step,
    step,
  };
}

/**
 * A tick caption with no floating-point dust on the end of it: as many places
 * as the step itself has, and no more, so a step of 0.25 is written 0.25 and a
 * step of 25 is written 25.
 */
export function tickLabel(value: number, step: number): string {
  const written = step.toPrecision(12).replace(/0+$/, "");
  const dot = written.indexOf(".");
  const places = dot === -1 ? 0 : Math.min(6, written.length - dot - 1);
  const text = value.toFixed(places);
  return Number(text) === 0 ? text.replace("-", "") : text;
}

function seriesValues(spec: ChartSpec, index: number): number[] {
  return spec.series[index]?.values ?? [];
}

// ------------------------------------------------------------------ the room

interface Gutters {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Whether the category captions have to be turned on their side. They are
 * written flat whenever they fit in their slot, and turned when they do not,
 * which is what stops a row of names printing over each other.
 */
function turnedCategories(spec: ChartSpec, slot: number): boolean {
  if (spec.kind === "pie" || spec.options.orientation === "horizontal") {
    return false;
  }
  return spec.categories.some(
    (label) => textWidth(label, LABEL_SIZE) > slot - 4,
  );
}

function longestCategory(spec: ChartSpec): number {
  return spec.categories.reduce(
    (most, label) => Math.max(most, textWidth(label, LABEL_SIZE)),
    0,
  );
}

function legendSize(spec: ChartSpec, place: LegendPlace): { width: number; height: number } {
  if (place === "none") {
    return { width: 0, height: 0 };
  }
  const labels = spec.kind === "pie" ? spec.categories : spec.series.map((s) => s.label);
  const widest = labels.reduce(
    (most, label) => Math.max(most, textWidth(label, AXIS_SIZE)),
    0,
  );
  if (place === "right") {
    return { width: widest + SWATCH + 18, height: 0 };
  }
  return { width: 0, height: AXIS_SIZE + 12 };
}

// --------------------------------------------------------------------- pies

const TAU = Math.PI * 2;
/** how finely an arc is cut into straight runs */
const ARC_STEP = Math.PI / 36;

function arc(centre: Pt, radius: number, from: number, to: number): Pt[] {
  const out: Pt[] = [];
  const steps = Math.max(2, Math.ceil(Math.abs(to - from) / ARC_STEP));
  for (let i = 0; i <= steps; i++) {
    const angle = from + ((to - from) * i) / steps;
    out.push({
      x: round(centre.x + Math.cos(angle) * radius),
      y: round(centre.y + Math.sin(angle) * radius),
    });
  }
  return out;
}

function pieDrawing(spec: ChartSpec, box: Rect, place: LegendPlace): ChartDrawing {
  const palette = effectivePalette(spec);
  const captions: Caption[] = [];
  let top = box.y + PAD;
  if (spec.title) {
    captions.push({
      text: spec.title,
      at: { x: box.x + box.width / 2, y: top },
      align: "center",
      size: TITLE_SIZE,
    });
    top += TITLE_SIZE + TITLE_GAP;
  }
  const key = legendSize(spec, place);
  const bottom = box.y + box.height - PAD - key.height;
  const right = box.x + box.width - PAD - key.width;
  const plot: Rect = {
    x: box.x + PAD,
    y: top,
    width: Math.max(40, right - box.x - PAD),
    height: Math.max(40, bottom - top),
  };

  // a caption hangs outside the pie, so the pie itself keeps back the room the
  // longest one needs
  const named = place === "none";
  const gutter = named
    ? Math.min(
        plot.width / 3,
        spec.categories.reduce(
          (most, label) => Math.max(most, textWidth(label, AXIS_SIZE)),
          0,
        ) + 14,
      )
    : 6;
  const centre = { x: plot.x + plot.width / 2, y: plot.y + plot.height / 2 };
  const radius = Math.max(
    20,
    Math.min(plot.width / 2 - gutter, plot.height / 2 - (named ? 16 : 6)),
  );
  const hole = radius * Math.min(0.9, Math.max(0, spec.options.donut));

  const values = seriesValues(spec, 0);
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  const slices: SliceMark[] = [];
  let angle = -Math.PI / 2;
  spec.categories.forEach((label, index) => {
    const value = Math.max(0, values[index] ?? 0);
    const share = total > 0 ? value / total : 0;
    const sweep = share * TAU;
    const to = angle + sweep;
    const outer = arc(centre, radius, angle, to);
    const path =
      hole > 0
        ? [...outer, ...arc(centre, hole, to, angle), outer[0]]
        : [centre, ...outer, centre];
    const middle = angle + sweep / 2;
    const mid = {
      x: round(centre.x + Math.cos(middle) * radius),
      y: round(centre.y + Math.sin(middle) * radius),
    };
    slices.push({
      path,
      color: markColor(palette, spec.options, index, spec.series[0]?.color),
      value,
      share,
      index,
      mid,
      grip: {
        x: round(centre.x + Math.cos(to) * radius),
        y: round(centre.y + Math.sin(to) * radius),
      },
    });
    if (sweep > 0.0001) {
      const side: Anchor = Math.cos(middle) < -0.05 ? "right" : "left";
      const text = named
        ? spec.options.values
          ? `${label}\n${shareText(spec, value, share)}`
          : label
        : spec.options.values
          ? shareText(spec, value, share)
          : "";
      if (text) {
        captions.push({
          middle: true,
          text,
          at: named
            ? {
                x: round(centre.x + Math.cos(middle) * (radius + 8)),
                y: round(centre.y + Math.sin(middle) * (radius + 8)),
              }
            : {
                x: round(centre.x + Math.cos(middle) * (radius * 0.62 + hole * 0.38)),
                y: round(centre.y + Math.sin(middle) * (radius * 0.62 + hole * 0.38)),
              },
          align: named ? side : "center",
          size: AXIS_SIZE,
        });
      }
    }
    angle = to;
  });

  return {
    box,
    plot: {
      x: centre.x - radius,
      y: centre.y - radius,
      width: radius * 2,
      height: radius * 2,
    },
    ticks: [],
    slots: [],
    base: centre.y,
    bars: [],
    runs: [],
    dots: [],
    slices,
    trend: null,
    legend: keyEntries(spec, box, place, plot, palette),
    captions,
    across: true,
    hole,
    scale: { min: 0, max: 1, step: 1 },
    acrossScale: { min: 0, max: 1, step: 1 },
    centre,
    radius,
  };
}

function shareText(spec: ChartSpec, value: number, share: number): string {
  if (!spec.options.percent) {
    return String(round(value));
  }
  const percent = share * 100;
  const whole = Math.abs(percent - Math.round(percent)) < 0.05;
  return `${whole ? Math.round(percent) : percent.toFixed(1)}%`;
}

// -------------------------------------------------------------------- the key

function keyEntries(
  spec: ChartSpec,
  box: Rect,
  place: LegendPlace,
  plot: Rect,
  palette: ReturnType<typeof effectivePalette>,
): LegendEntry[] {
  if (place === "none") {
    return [];
  }
  const labels =
    spec.kind === "pie"
      ? spec.categories.map((label, index) => ({
          label,
          color: markColor(palette, spec.options, index, spec.series[0]?.color),
        }))
      : spec.series.map((series, index) => ({
          label: series.label,
          color: markColor(palette, spec.options, index, series.color),
        }));
  const entries: LegendEntry[] = [];
  if (place === "right") {
    const left = plot.x + plot.width + 16;
    let top = plot.y + 2;
    for (const entry of labels) {
      entries.push({
        ...entry,
        swatch: { x: left, y: top, width: SWATCH, height: SWATCH },
        at: { x: left + SWATCH + 6, y: top + SWATCH / 2 },
      });
      top += SWATCH + 8;
    }
    return entries;
  }
  const widths = labels.map(
    (entry) => SWATCH + 6 + textWidth(entry.label, AXIS_SIZE) + 14,
  );
  const total = widths.reduce((sum, width) => sum + width, 0) - 14;
  let left = box.x + box.width / 2 - total / 2;
  const top =
    place === "top" ? box.y + PAD : box.y + box.height - PAD - AXIS_SIZE;
  labels.forEach((entry, index) => {
    entries.push({
      ...entry,
      swatch: { x: left, y: top, width: SWATCH, height: SWATCH },
      at: { x: left + SWATCH + 6, y: top + SWATCH / 2 },
    });
    left += widths[index];
  });
  return entries;
}

// ----------------------------------------------------------- axes and slots

function axisDrawing(spec: ChartSpec, box: Rect, place: LegendPlace): ChartDrawing {
  const palette = effectivePalette(spec);
  const style = chartStyle(spec.options.style);
  const horizontal = spec.kind === "bar" && spec.options.orientation === "horizontal";
  const scatter = spec.kind === "scatter";
  const captions: Caption[] = [];

  // --- the value axis
  const readings = allValues(spec);
  const scale = niceScale(
    spec.options.min ?? Math.min(...readings, 0),
    spec.options.max ?? Math.max(...readings, 0),
    !scatter,
  );
  if (spec.options.min !== null) {
    scale.min = spec.options.min;
  }
  if (spec.options.max !== null) {
    scale.max = spec.options.max;
  }
  const tickValues: number[] = [];
  for (let value = scale.min; value <= scale.max + scale.step / 2; value += scale.step) {
    tickValues.push(round(value));
  }
  const tickWidth = tickValues.reduce(
    (most, value) => Math.max(most, textWidth(tickLabel(value, scale.step), AXIS_SIZE)),
    0,
  );

  // --- the across axis, which is a scale of its own on a scatter plot
  const acrossValues = scatter
    ? spec.series.flatMap((series) => (series.points ?? []).map((p) => p.x))
    : [];
  const acrossScale = scatter
    ? niceScale(Math.min(...acrossValues), Math.max(...acrossValues), false)
    : scale;
  const acrossTicks: number[] = [];
  if (scatter) {
    for (
      let value = acrossScale.min;
      value <= acrossScale.max + acrossScale.step / 2;
      value += acrossScale.step
    ) {
      acrossTicks.push(round(value));
    }
  }

  // `x` captions the category axis and `y` the value axis, whichever way round
  // the bars are drawn, so turning a bar chart on its side turns its captions
  // with it rather than leaving them naming the wrong rule
  const sideTitle = horizontal ? spec.options.xTitle : spec.options.yTitle;
  const footTitle = horizontal ? spec.options.yTitle : spec.options.xTitle;

  const key = legendSize(spec, place);
  let top = box.y + PAD + (place === "top" ? key.height : 0);
  if (spec.title) {
    captions.push({
      text: spec.title,
      at: { x: box.x + box.width / 2, y: top },
      align: "center",
      size: TITLE_SIZE,
    });
    top += TITLE_SIZE + TITLE_GAP;
  }

  const valueGutter = horizontal ? AXIS_SIZE + 10 : tickWidth + 10;
  const categoryGutter = horizontal
    ? longestCategory(spec) + 10
    : AXIS_SIZE + 10;
  const gutters: Gutters = {
    top: top - box.y,
    right: PAD + key.width + (scatter ? 8 : 0),
    bottom:
      PAD +
      (place === "bottom" ? key.height : 0) +
      (horizontal ? valueGutter : categoryGutter) +
      (footTitle ? AXIS_SIZE + 8 : 0),
    left:
      PAD +
      (horizontal ? categoryGutter : valueGutter) +
      (sideTitle ? AXIS_SIZE + 8 : 0),
  };

  let plot: Rect = {
    x: box.x + gutters.left,
    y: box.y + gutters.top,
    width: Math.max(40, box.width - gutters.left - gutters.right),
    height: Math.max(40, box.height - gutters.top - gutters.bottom),
  };

  // a long category caption is turned on its side, which needs the room back
  const slotSize = (horizontal ? plot.height : plot.width) /
    Math.max(1, spec.categories.length);
  const turned = turnedCategories(spec, slotSize);
  if (turned) {
    const extra = longestCategory(spec) - AXIS_SIZE;
    plot = { ...plot, height: Math.max(40, plot.height - Math.max(0, extra)) };
  }

  const valueAt = (value: number): number => {
    const span = scale.max - scale.min || 1;
    const ratio = (value - scale.min) / span;
    return horizontal
      ? round(plot.x + ratio * plot.width)
      : round(plot.y + plot.height - ratio * plot.height);
  };
  const acrossAt = (value: number): number => {
    const span = acrossScale.max - acrossScale.min || 1;
    const ratio = (value - acrossScale.min) / span;
    return round(plot.x + ratio * plot.width);
  };

  const ticks: AxisTick[] = tickValues.map((value) => ({
    value,
    at: valueAt(value),
    label: tickLabel(value, scale.step),
  }));

  const slots: Slot[] = scatter
    ? acrossTicks.map((value) => ({
        label: tickLabel(value, acrossScale.step),
        at: acrossAt(value),
        size: 0,
      }))
    : spec.categories.map((label, index) => {
        const size = (horizontal ? plot.height : plot.width) / spec.categories.length;
        const start = horizontal ? plot.y : plot.x;
        return { label, at: round(start + size * (index + 0.5)), size };
      });

  const base = valueAt(Math.max(scale.min, Math.min(0, scale.max)));

  const drawing: ChartDrawing = {
    box,
    plot,
    ticks,
    slots,
    base,
    bars: [],
    runs: [],
    dots: [],
    slices: [],
    trend: null,
    legend: keyEntries(spec, box, place, plot, palette),
    captions,
    across: !horizontal,
    hole: 0,
    scale,
    acrossScale,
    centre: { x: plot.x + plot.width / 2, y: plot.y + plot.height / 2 },
    radius: 0,
  };

  // --- the marks themselves
  if (spec.kind === "bar") {
    fillBars(spec, drawing, valueAt, horizontal, palette);
  } else if (spec.kind === "line") {
    fillRuns(spec, drawing, valueAt, palette);
  } else {
    fillCloud(spec, drawing, valueAt, acrossAt, palette);
  }

  // --- the captions that name the axes
  if (sideTitle) {
    captions.push({
      text: sideTitle,
      at: { x: box.x + PAD + AXIS_SIZE / 2, y: plot.y + plot.height / 2 },
      align: "center",
      size: AXIS_SIZE,
      middle: true,
      turned: true,
    });
  }
  if (footTitle) {
    captions.push({
      text: footTitle,
      at: {
        x: plot.x + plot.width / 2,
        y: box.y + box.height - PAD - (place === "bottom" ? key.height : 0) - AXIS_SIZE,
      },
      align: "center",
      size: AXIS_SIZE,
    });
  }

  // --- the captions along the category axis
  slots.forEach((slot) => {
    if (horizontal) {
      captions.push({
        text: slot.label,
        at: { x: plot.x - 8, y: slot.at },
        align: "right",
        size: LABEL_SIZE,
        middle: true,
      });
    } else {
      captions.push({
        text: slot.label,
        at: { x: slot.at, y: plot.y + plot.height + (turned ? 8 : 6) },
        align: turned ? "right" : "center",
        size: LABEL_SIZE,
        ...(turned ? { turned: true } : {}),
      });
    }
  });

  // --- the captions along the value axis
  ticks.forEach((tick) => {
    if (horizontal) {
      captions.push({
        text: tick.label,
        at: { x: tick.at, y: plot.y + plot.height + 6 },
        align: "center",
        size: AXIS_SIZE,
      });
    } else {
      captions.push({
        text: tick.label,
        at: { x: plot.x - 8, y: tick.at },
        align: "right",
        size: AXIS_SIZE,
        middle: true,
      });
    }
  });

  // --- the value written on every mark, when the reader asks for it
  if (spec.options.values && spec.kind !== "scatter") {
    const piled =
      spec.kind === "bar" && spec.options.layout === "stacked" && spec.series.length > 1;
    for (const bar of drawing.bars) {
      // a stacked reading is written inside the piece it belongs to, because
      // over the piece is inside the one above it and reads as that one's
      if (piled) {
        const room = horizontal ? bar.rect.width : bar.rect.height;
        if (room < AXIS_SIZE + 6) {
          continue;
        }
        captions.push({
          text: String(round(bar.value)),
          at: {
            x: bar.rect.x + bar.rect.width / 2,
            y: bar.rect.y + bar.rect.height / 2,
          },
          align: "center",
          size: AXIS_SIZE,
          middle: true,
          color: readableOn(bar.color),
        });
        continue;
      }
      captions.push({
        text: String(round(bar.value)),
        at: horizontal
          ? { x: bar.grip.x + 6, y: bar.rect.y + bar.rect.height / 2 }
          : { x: bar.rect.x + bar.rect.width / 2, y: bar.grip.y - 6 - AXIS_SIZE },
        align: horizontal ? "left" : "center",
        size: AXIS_SIZE,
        ...(horizontal ? { middle: true as const } : {}),
      });
    }
    for (const dot of drawing.dots) {
      const value = spec.series[dot.series]?.values[dot.index] ?? 0;
      captions.push({
        text: String(round(value)),
        at: { x: dot.at.x, y: dot.at.y - 8 - AXIS_SIZE },
        align: "center",
        size: AXIS_SIZE,
      });
    }
  }

  void style;
  return drawing;
}

function fillBars(
  spec: ChartSpec,
  drawing: ChartDrawing,
  valueAt: (value: number) => number,
  horizontal: boolean,
  palette: ReturnType<typeof effectivePalette>,
): void {
  const stacked = spec.options.layout === "stacked" && spec.series.length > 1;
  const count = stacked ? 1 : Math.max(1, spec.series.length);
  drawing.slots.forEach((slot, category) => {
    const band = Math.min(MAX_BAND * count, slot.size * BAND);
    const each = (band - SPACER * (count - 1)) / count;
    let piled = 0;
    spec.series.forEach((series, index) => {
      const value = series.values[category] ?? 0;
      const from = stacked ? valueAt(piled) : drawing.base;
      const to = stacked ? valueAt(piled + value) : valueAt(value);
      const offset = stacked
        ? slot.at - band / 2
        : slot.at - band / 2 + index * (each + SPACER);
      const gap = stacked && index > 0 ? SPACER : 0;
      const rect: Rect = horizontal
        ? {
            x: round(Math.min(from, to) + gap),
            y: round(offset),
            width: round(Math.max(1, Math.abs(to - from) - gap)),
            height: round(stacked ? band : each),
          }
        : {
            x: round(offset),
            y: round(Math.min(from, to)),
            width: round(stacked ? band : each),
            height: round(Math.max(1, Math.abs(to - from) - gap)),
          };
      drawing.bars.push({
        rect,
        color: markColor(palette, spec.options, spec.series.length > 1 ? index : category, series.color),
        value,
        series: index,
        category,
        grip: horizontal
          ? { x: round(to), y: round(rect.y + rect.height / 2) }
          : { x: round(rect.x + rect.width / 2), y: round(to) },
      });
      piled += value;
    });
  });
}

function fillRuns(
  spec: ChartSpec,
  drawing: ChartDrawing,
  valueAt: (value: number) => number,
  palette: ReturnType<typeof effectivePalette>,
): void {
  spec.series.forEach((series, index) => {
    const raw: Pt[] = drawing.slots.map((slot, category) => ({
      x: slot.at,
      y: valueAt(series.values[category] ?? 0),
    }));
    if (raw.length === 0) {
      return;
    }
    const color = markColor(palette, spec.options, index, series.color);
    const points = spec.options.curve ? smooth(raw) : raw;
    drawing.runs.push({
      points,
      color,
      series: index,
      // closed on itself, because that is the only shape Excalidraw fills
      area: spec.options.area
        ? [
            { x: points[0].x, y: drawing.base },
            ...points,
            { x: points[points.length - 1].x, y: drawing.base },
            { x: points[0].x, y: drawing.base },
          ]
        : null,
    });
    if (spec.options.markers) {
      raw.forEach((at, category) =>
        drawing.dots.push({ at, color, radius: 4, series: index, index: category }),
      );
    }
  });
}

/** A Catmull-Rom run, cut into straight pieces the sheet can hold. */
function smooth(points: Pt[]): Pt[] {
  if (points.length < 3) {
    return points;
  }
  const out: Pt[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let step = 1; step <= 10; step++) {
      const t = step / 10;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: round(
          0.5 *
            (2 * p1.x +
              (-p0.x + p2.x) * t +
              (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
              (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        ),
        y: round(
          0.5 *
            (2 * p1.y +
              (-p0.y + p2.y) * t +
              (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
              (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        ),
      });
    }
  }
  return out;
}

function fillCloud(
  spec: ChartSpec,
  drawing: ChartDrawing,
  valueAt: (value: number) => number,
  acrossAt: (value: number) => number,
  palette: ReturnType<typeof effectivePalette>,
): void {
  const cloud: Pt[] = [];
  spec.series.forEach((series, index) => {
    const color = markColor(palette, spec.options, index, series.color);
    (series.points ?? []).forEach((point, at) => {
      const dot = { x: acrossAt(point.x), y: valueAt(point.y) };
      cloud.push({ x: point.x, y: point.y });
      drawing.dots.push({
        at: dot,
        color,
        radius: 4.5,
        series: index,
        index: at,
        ...(point.label ? { caption: point.label } : {}),
      });
    });
  });
  if (spec.options.trend && cloud.length > 1) {
    const n = cloud.length;
    const sumX = cloud.reduce((sum, p) => sum + p.x, 0);
    const sumY = cloud.reduce((sum, p) => sum + p.y, 0);
    const sumXY = cloud.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumXX = cloud.reduce((sum, p) => sum + p.x * p.x, 0);
    const divisor = n * sumXX - sumX * sumX;
    if (divisor !== 0) {
      const slope = (n * sumXY - sumX * sumY) / divisor;
      const intercept = (sumY - slope * sumX) / n;
      const lowX = Math.min(...cloud.map((p) => p.x));
      const highX = Math.max(...cloud.map((p) => p.x));
      drawing.trend = [
        { x: acrossAt(lowX), y: valueAt(slope * lowX + intercept) },
        { x: acrossAt(highX), y: valueAt(slope * highX + intercept) },
      ];
    }
  }
  if (spec.options.markers) {
    for (const dot of drawing.dots) {
      if (dot.caption) {
        drawing.captions.push({
          text: dot.caption,
          at: { x: dot.at.x, y: dot.at.y - dot.radius - 4 - AXIS_SIZE },
          align: "center",
          size: AXIS_SIZE,
        });
      }
    }
  }
}

// ----------------------------------------------------------------------- api

/** Every mark of one chart, drawn into `box`. */
export function layoutChart(spec: ChartSpec, box: Rect): ChartDrawing {
  const place = legendFor(spec);
  return spec.kind === "pie"
    ? pieDrawing(spec, box, place)
    : axisDrawing(spec, box, place);
}

/**
 * A point on the sheet, read back as a number on the value axis. This is the
 * inverse of the scale the marks were placed with, so a mark dragged to a
 * place reads as exactly the number drawn there.
 */
export function readValue(drawing: ChartDrawing, at: Pt): number {
  const { plot, scale } = drawing;
  const ratio = drawing.across
    ? (plot.y + plot.height - at.y) / Math.max(1, plot.height)
    : (at.x - plot.x) / Math.max(1, plot.width);
  return scale.min + ratio * (scale.max - scale.min);
}

/** The same, for the across axis of a scatter plot. */
export function readAcross(drawing: ChartDrawing, at: Pt): number {
  const { plot, acrossScale } = drawing;
  const ratio = (at.x - plot.x) / Math.max(1, plot.width);
  return acrossScale.min + ratio * (acrossScale.max - acrossScale.min);
}

/**
 * How far round a pie a point sits, as a share of the whole, measured from
 * twelve o'clock the way the slices are laid out.
 */
export function readShare(drawing: ChartDrawing, at: Pt): number {
  const angle = Math.atan2(at.y - drawing.centre.y, at.x - drawing.centre.x);
  const turned = (angle + Math.PI / 2 + TAU) % TAU;
  return turned / TAU;
}

/** The box a chart takes when nothing on the sheet has resized it yet. */
export function chartBox(spec: ChartSpec, at: Pt = { x: 0, y: 0 }): Rect {
  return { x: at.x, y: at.y, width: spec.options.width, height: spec.options.height };
}

export { PAD, AXIS_SIZE, LABEL_SIZE, TITLE_SIZE, SPACER };
