import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { marked } from "@/lib/canvas/units";
import { MONOCHROME, type Ink } from "@/lib/ink";
import { FORMAL, type SheetStyle } from "@/lib/sheet";
import { chartStyle, isEmptyChart, type ChartSpec } from "@/lib/chart/spec";
import {
  AXIS_SIZE,
  layoutChart,
  type Caption,
  type ChartDrawing,
  type Pt,
  type Rect,
} from "@/lib/chart/layout-chart";

/**
 * A chart, as shapes on the sheet.
 *
 * Excalidraw draws the marks and nothing else: every rectangle, run, slice and
 * caption is placed by `layout-chart.ts`, and none of Excalidraw's own chart,
 * binding or routing behaviour is involved — it has none, and that is the
 * point. The sheet is paper.
 *
 * One element carries the whole chart: the frame, an invisible rectangle round
 * the outside, holds the spec in its mark. Everything else is drawn from it,
 * so redrawing a chart is a matter of throwing the marks away and building
 * them again from the frame.
 */

/** A rule the eye is not meant to notice, one step off the paper. */
const GRID = "#e5e7eb";
/** the wash under a line, light enough to read the rules through */
const AREA_OPACITY = 16;

const BASE = {
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeStyle: "solid",
  opacity: 100,
  roundness: null,
  angle: 0,
} as const;

interface Paper {
  ink: string;
  font: number;
  lineHeight: number;
  roughness: number;
}

function caption(
  id: string,
  entry: Caption,
  paper: Paper,
  unit: string,
  weight?: "bold",
): ExcalidrawElementSkeleton {
  return {
    type: "text",
    id,
    text: entry.text,
    x: Math.round(entry.at.x),
    y: Math.round(entry.at.y),
    ...BASE,
    strokeColor: entry.color ?? paper.ink,
    fontFamily: paper.font,
    fontSize: entry.size,
    lineHeight: paper.lineHeight,
    textAlign: entry.align,
    verticalAlign: entry.middle ? "middle" : "top",
    ...(entry.turned ? { angle: -Math.PI / 2 } : {}),
    groupIds: [unit],
    ...marked({ unit, kind: "figure" }),
    ...(weight ? {} : {}),
  } as unknown as ExcalidrawElementSkeleton;
}

function rule(
  id: string,
  from: Pt,
  to: Pt,
  color: string,
  width: number,
  paper: Paper,
  unit: string,
): ExcalidrawElementSkeleton {
  return {
    type: "line",
    id,
    x: Math.round(from.x),
    y: Math.round(from.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
    points: [
      [0, 0],
      [Math.round(to.x - from.x), Math.round(to.y - from.y)],
    ],
    ...BASE,
    strokeColor: color,
    strokeWidth: width,
    roughness: paper.roughness,
    groupIds: [unit],
    ...marked({ unit, kind: "figure" }),
  } as unknown as ExcalidrawElementSkeleton;
}

function polyline(
  id: string,
  points: Pt[],
  options: {
    stroke: string;
    width: number;
    fill?: string;
    opacity?: number;
    dashed?: boolean;
  },
  paper: Paper,
  unit: string,
): ExcalidrawElementSkeleton {
  const [first] = points;
  const local = points.map(
    (point) => [Math.round(point.x - first.x), Math.round(point.y - first.y)] as [number, number],
  );
  const xs = local.map((p) => p[0]);
  const ys = local.map((p) => p[1]);
  return {
    type: "line",
    id,
    x: Math.round(first.x),
    y: Math.round(first.y),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    points: local,
    ...BASE,
    strokeColor: options.stroke,
    strokeWidth: options.width,
    strokeStyle: options.dashed ? "dotted" : "solid",
    backgroundColor: options.fill ?? "transparent",
    opacity: options.opacity ?? 100,
    roughness: paper.roughness,
    groupIds: [unit],
    ...marked({ unit, kind: "figure" }),
  } as unknown as ExcalidrawElementSkeleton;
}

function box(
  id: string,
  rect: Rect,
  options: { stroke: string; fill: string; width: number },
  paper: Paper,
  unit: string,
): ExcalidrawElementSkeleton {
  return {
    type: "rectangle",
    id,
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
    ...BASE,
    strokeColor: options.stroke,
    backgroundColor: options.fill,
    strokeWidth: Math.max(0.5, options.width),
    roughness: paper.roughness,
    groupIds: [unit],
    ...marked({ unit, kind: "figure" }),
  } as unknown as ExcalidrawElementSkeleton;
}

/**
 * Every shape one chart is made of. The frame comes first so it sits under the
 * marks and carries the spec; everything after it is redrawn from that spec
 * whenever a setting, a reading or the size of the chart changes.
 */
export function buildChartSkeletons(
  spec: ChartSpec,
  at: Rect,
  ink: Ink = MONOCHROME,
  sheet: SheetStyle = FORMAL,
  unit = "chart-1",
): ExcalidrawElementSkeleton[] {
  const paper: Paper = {
    ink: ink.color,
    font: sheet.fontFamily,
    lineHeight: sheet.lineHeight,
    roughness: sheet.roughness,
  };
  const style = chartStyle(spec.options.style);
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
  if (isEmptyChart(spec)) {
    return out;
  }

  const drawing = layoutChart(spec, at);
  const { plot } = drawing;
  let n = 0;
  const id = (part: string) => `${unit}-${part}-${n++}`;

  // --- the rules behind the marks
  if (spec.kind !== "pie") {
    const showValue = spec.options.grid === "value" || spec.options.grid === "both";
    const showCategory =
      spec.options.grid === "category" || spec.options.grid === "both";
    if (showValue) {
      for (const tick of drawing.ticks) {
        out.push(
          rule(
            id("grid"),
            drawing.across
              ? { x: plot.x, y: tick.at }
              : { x: tick.at, y: plot.y },
            drawing.across
              ? { x: plot.x + plot.width, y: tick.at }
              : { x: tick.at, y: plot.y + plot.height },
            GRID,
            1,
            paper,
            unit,
          ),
        );
      }
    }
    if (showCategory) {
      for (const slot of drawing.slots) {
        out.push(
          rule(
            id("grid"),
            drawing.across ? { x: slot.at, y: plot.y } : { x: plot.x, y: slot.at },
            drawing.across
              ? { x: slot.at, y: plot.y + plot.height }
              : { x: plot.x + plot.width, y: slot.at },
            GRID,
            1,
            paper,
            unit,
          ),
        );
      }
    }

    // --- the axes themselves
    if (style.frame) {
      out.push(
        box(id("frame"), plot, { stroke: paper.ink, fill: "transparent", width: style.axisWidth }, paper, unit),
      );
    } else {
      out.push(
        rule(
          id("axis"),
          { x: plot.x, y: plot.y },
          { x: plot.x, y: plot.y + plot.height },
          paper.ink,
          style.axisWidth,
          paper,
          unit,
        ),
        rule(
          id("axis"),
          { x: plot.x, y: drawing.across ? drawing.base : plot.y + plot.height },
          {
            x: plot.x + plot.width,
            y: drawing.across ? drawing.base : plot.y + plot.height,
          },
          paper.ink,
          style.axisWidth,
          paper,
          unit,
        ),
      );
    }
  }

  // --- the marks
  for (const bar of drawing.bars) {
    out.push(
      box(
        id("bar"),
        bar.rect,
        {
          stroke: style.markWidth > 0 ? paper.ink : bar.color,
          fill: bar.color,
          width: style.markWidth > 0 ? style.markWidth : 0.5,
        },
        paper,
        unit,
      ),
    );
  }
  for (const run of drawing.runs) {
    if (run.area) {
      out.push(
        polyline(
          id("area"),
          run.area,
          { stroke: "transparent", width: 1, fill: run.color, opacity: AREA_OPACITY },
          paper,
          unit,
        ),
      );
    }
    out.push(
      polyline(id("run"), run.points, { stroke: run.color, width: 2 }, paper, unit),
    );
  }
  if (drawing.trend) {
    out.push(
      polyline(
        id("trend"),
        drawing.trend,
        { stroke: paper.ink, width: 1.5, dashed: true },
        paper,
        unit,
      ),
    );
  }
  for (const dot of drawing.dots) {
    out.push({
      type: "ellipse",
      id: id("dot"),
      x: Math.round(dot.at.x - dot.radius),
      y: Math.round(dot.at.y - dot.radius),
      width: Math.round(dot.radius * 2),
      height: Math.round(dot.radius * 2),
      ...BASE,
      strokeColor: dot.color,
      backgroundColor: dot.color,
      strokeWidth: 1,
      roughness: paper.roughness,
      groupIds: [unit],
      ...marked({ unit, kind: "figure" }),
    } as unknown as ExcalidrawElementSkeleton);
  }
  for (const slice of drawing.slices) {
    out.push(
      polyline(
        id("slice"),
        slice.path,
        {
          stroke: style.markWidth > 0 ? paper.ink : "#ffffff",
          width: style.markWidth > 0 ? style.markWidth : 1.5,
          fill: slice.color,
        },
        paper,
        unit,
      ),
    );
  }

  // --- the key
  for (const entry of drawing.legend) {
    out.push(
      box(
        id("key"),
        entry.swatch,
        { stroke: entry.color, fill: entry.color, width: 1 },
        paper,
        unit,
      ),
      caption(
        id("key-text"),
        { text: entry.label, at: entry.at, align: "left", size: AXIS_SIZE, middle: true },
        paper,
        unit,
      ),
    );
  }

  // --- the captions
  for (const entry of drawing.captions) {
    out.push(caption(id("text"), entry, paper, unit));
  }

  return out;
}

export type { ChartDrawing };
