import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { Ink } from "@/lib/ink";
import type { SheetStyle } from "@/lib/sheet";
import type { DiagramCategory } from "@/lib/types";
import type { FigureSpec } from "@/lib/figures/spec";

import { buildChartSkeletons } from "@/lib/chart/build-chart";
import { defaultOptions, type ChartKind, type ChartSpec } from "@/lib/chart/spec";
import { buildMindSkeletons } from "@/lib/mind/build-mind";
import { blankMind } from "@/lib/mind/spec";
import { buildMatrixSkeletons } from "@/lib/matrix/build-matrix";
import { blankMatrix } from "@/lib/matrix/spec";
import { buildVennSkeletons } from "@/lib/venn/build-venn";
import { blankVenn } from "@/lib/venn/spec";
import { buildFishboneSkeletons } from "@/lib/fishbone/build-fishbone";
import { blankFishbone } from "@/lib/fishbone/spec";
import { buildSequenceSkeletons } from "@/lib/sequence/build-sequence";
import { blankSequence } from "@/lib/sequence/spec";
import { buildPrismaSkeletons } from "@/lib/prisma/build-prisma";
import { blankPrisma } from "@/lib/prisma/spec";
import { buildQuadrantSkeletons } from "@/lib/quadrant/build-quadrant";
import { blankQuadrant } from "@/lib/quadrant/spec";
import { buildGanttSkeletons } from "@/lib/gantt/build-gantt";
import { blankGantt } from "@/lib/gantt/spec";
import { buildTimelineSkeletons } from "@/lib/timeline/build-timeline";
import { blankTimeline } from "@/lib/timeline/spec";
import { buildSankeySkeletons } from "@/lib/sankey/build-sankey";
import { blankSankey } from "@/lib/sankey/spec";

/**
 * The one place that knows which figure is which.
 *
 * Everything else — the canvas, the rail, the drawer, redrawing, resizing,
 * copies — asks this and gets on with it, which is what lets a figure's own
 * geometry, language and controls be entirely its own. Adding a figure is a
 * row here plus its own folder; it is not a change to the editor.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FigureDef {
  /** what the rail calls this figure's panel */
  label: string;
  /** the shapes it is drawn as */
  build: (
    spec: never,
    at: Rect,
    ink: Ink,
    sheet: SheetStyle,
    unit: string,
  ) => ExcalidrawElementSkeleton[];
  /** one with nothing in it, for a sheet that has none */
  blank: () => FigureSpec;
}

const CHART: Record<ChartKind, FigureDef> = {
  bar: chartDef("bar"),
  line: chartDef("line"),
  pie: chartDef("pie"),
  scatter: chartDef("scatter"),
  histogram: chartDef("histogram"),
  area: chartDef("area"),
  waterfall: chartDef("waterfall"),
  funnel: chartDef("funnel"),
  radar: chartDef("radar"),
};

/** What an empty chart of each kind starts with: enough to show what it is. */
function blankChart(kind: ChartKind): ChartSpec {
  const options = defaultOptions(kind);
  switch (kind) {
    case "waterfall":
      return {
        kind,
        title: "Chart",
        categories: ["Start", "Gain", "Loss", "End"],
        series: [{ label: "Value", values: [10, 4, -3, 0] }],
        steps: ["start", "change", "change", "total"],
        options,
      };
    case "funnel":
      return {
        kind,
        title: "Chart",
        categories: ["First", "Second", "Third"],
        series: [{ label: "Value", values: [100, 60, 25] }],
        options,
      };
    case "radar":
      return {
        kind,
        title: "Chart",
        categories: ["One", "Two", "Three", "Four", "Five"],
        series: [{ label: "Value", values: [4, 3, 5, 2, 4] }],
        options,
      };
    default:
      return {
        kind,
        title: "Chart",
        categories: ["One", "Two", "Three"],
        series: [{ label: "Value", values: [3, 5, 4] }],
        options,
      };
  }
}

function chartDef(kind: ChartKind): FigureDef {
  return {
    label: "Chart",
    build: buildChartSkeletons as FigureDef["build"],
    blank: () => blankChart(kind),
  };
}

export const FIGURES: Partial<Record<DiagramCategory, FigureDef>> = {
  ...CHART,
  mind: {
    label: "Mind map",
    build: buildMindSkeletons as FigureDef["build"],
    blank: blankMind,
  },
  matrix: {
    label: "Matrix",
    build: buildMatrixSkeletons as FigureDef["build"],
    blank: blankMatrix,
  },
  venn: {
    label: "Venn diagram",
    build: buildVennSkeletons as FigureDef["build"],
    blank: blankVenn,
  },
  fishbone: {
    label: "Fishbone",
    build: buildFishboneSkeletons as FigureDef["build"],
    blank: blankFishbone,
  },
  sequence: {
    label: "Sequence diagram",
    build: buildSequenceSkeletons as FigureDef["build"],
    blank: blankSequence,
  },
  prisma: {
    label: "PRISMA diagram",
    build: buildPrismaSkeletons as FigureDef["build"],
    blank: blankPrisma,
  },
  quadrant: {
    label: "Quadrant",
    build: buildQuadrantSkeletons as FigureDef["build"],
    blank: blankQuadrant,
  },
  gantt: {
    label: "Gantt chart",
    build: buildGanttSkeletons as FigureDef["build"],
    blank: blankGantt,
  },
  timeline: {
    label: "Timeline",
    build: buildTimelineSkeletons as FigureDef["build"],
    blank: blankTimeline,
  },
  sankey: {
    label: "Sankey diagram",
    build: buildSankeySkeletons as FigureDef["build"],
    blank: blankSankey,
  },
};

export function figureDef(kind: DiagramCategory): FigureDef | null {
  return FIGURES[kind] ?? null;
}

/** Every shape one figure is made of, whichever figure it is. */
export function buildFigure(
  spec: FigureSpec,
  at: Rect,
  ink: Ink,
  sheet: SheetStyle,
  unit: string,
): ExcalidrawElementSkeleton[] {
  const def = FIGURES[spec.kind];
  return def ? def.build(spec as never, at, ink, sheet, unit) : [];
}
