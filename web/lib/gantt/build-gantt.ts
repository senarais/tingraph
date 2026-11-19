import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { marked } from "@/lib/canvas/units";
import { MONOCHROME, type Ink } from "@/lib/ink";
import { FORMAL, type SheetStyle } from "@/lib/sheet";
import { toPaper } from "@/lib/chart/spec";
import { textWidth } from "@/lib/layout/text";
import { ganttRows, ganttSpan, ganttStarts, type GanttSpec } from "@/lib/gantt/spec";

/**
 * A Gantt chart, laid out and drawn.
 *
 * The names down the left, the numbered units across the top with a hairline
 * down from each, and a bar per task from the unit it starts in to the last
 * unit it lasts. What is done of a task is the bar filled solid from its
 * start; the rest is washed. A milestone is a diamond at the start of its
 * unit. A dependency leaves the end of the bar it follows, runs a step to the
 * right and drops onto the top of the bar it leads to, which is how a Gantt
 * chart is read: this one cannot start until that one ends.
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
const HEADER = 30;
const MIN_LABELS = 120;
const MAX_LABELS = 260;
/** a dependency drops this far into the bar it leads to */
const INSET = 8;

export interface GanttPlan {
  title: Rect;
  /** where the bars are drawn: right of the names, under the header */
  field: Rect;
  /** how wide one unit is */
  unit: number;
  span: number;
  /** the label column's box for every row, and the row's own band */
  rows: Array<{ label: Rect; band: Rect }>;
  /** one entry per task, in the spec's order */
  bars: Array<{ box: Rect; row: number; milestone: boolean }>;
  /** the box each header number is written in */
  header: Rect[];
}

export function planGantt(spec: GanttSpec, at: Rect): GanttPlan {
  const size = spec.options.fontSize;
  const rows = ganttRows(spec);
  const starts = ganttStarts(spec);
  const span = ganttSpan(spec);
  const labels = Math.round(
    Math.min(
      MAX_LABELS,
      Math.max(
        MIN_LABELS,
        ...spec.tasks.map((task) => textWidth(task.label, size) + 28),
        ...spec.sections.map((name) => textWidth(name, size + 1) + 20),
      ),
    ),
  );
  const top = at.y + PAD + (spec.title ? TITLE + 14 : 0);
  const field: Rect = {
    x: at.x + PAD + labels,
    y: top + HEADER,
    width: Math.max(60, at.width - PAD * 2 - labels),
    height: Math.max(20, at.y + at.height - PAD - top - HEADER),
  };
  const rowHeight = field.height / Math.max(1, rows.length);
  const unit = field.width / span;
  const rowOf = new Map<number, number>();
  rows.forEach((row, index) => {
    if (row.kind === "task") rowOf.set(row.index, index);
  });

  return {
    title: { x: at.x + at.width / 2 - 160, y: at.y + PAD - (TITLE + 6) / 2, width: 320, height: TITLE + 6 },
    field,
    unit,
    span,
    rows: rows.map((row, index) => {
      const y = field.y + index * rowHeight;
      return {
        label: {
          x: at.x + PAD + (row.kind === "task" ? 14 : 0),
          y: y + rowHeight / 2 - (size + 4) / 2,
          width: labels - (row.kind === "task" ? 22 : 8),
          height: size + 4,
        },
        band: { x: at.x + PAD, y, width: at.width - PAD * 2, height: rowHeight },
      };
    }),
    bars: spec.tasks.map((task, index) => {
      const row = rowOf.get(index) ?? 0;
      const y = field.y + row * rowHeight;
      const x = field.x + (starts[index] - 1) * unit;
      if (task.length === 0) {
        const side = Math.min(rowHeight * 0.62, 16);
        return {
          box: { x: x - side / 2, y: y + (rowHeight - side) / 2, width: side, height: side },
          row,
          milestone: true,
        };
      }
      return {
        box: { x, y: y + rowHeight * 0.22, width: task.length * unit, height: rowHeight * 0.56 },
        row,
        milestone: false,
      };
    }),
    header: Array.from({ length: span }, (_, index) => ({
      x: field.x + index * unit,
      y: top,
      width: unit,
      height: HEADER,
    })),
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
  options: { size: number; align?: "left" | "center" | "right" },
): ExcalidrawElementSkeleton {
  return {
    type: "text",
    id: paper.id("text"),
    text: content,
    x: Math.round(at.x),
    y: Math.round(at.y),
    ...BASE,
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

/** A polyline in sheet coordinates; closed and filled when `fill` is given. */
function strokes(
  paper: Paper,
  points: Pt[],
  options: { width: number; fill?: string; dashed?: boolean; color?: string },
): ExcalidrawElementSkeleton {
  const [first] = points;
  const local = points.map((p) => [Math.round(p.x - first.x), Math.round(p.y - first.y)]);
  const xs = local.map((p) => p[0]);
  const ys = local.map((p) => p[1]);
  return {
    type: "line",
    id: paper.id("line"),
    x: Math.round(first.x),
    y: Math.round(first.y),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    points: local,
    ...BASE,
    strokeStyle: options.dashed ? "dashed" : "solid",
    strokeColor: options.color ?? paper.ink,
    backgroundColor: options.fill ?? "transparent",
    strokeWidth: options.width,
    opacity: 100,
    roughness: paper.roughness,
    groupIds: [paper.unit],
    ...marked({ unit: paper.unit, kind: "figure" }),
  } as unknown as ExcalidrawElementSkeleton;
}

function box(paper: Paper, rect: Rect, fill: string, width = 1): ExcalidrawElementSkeleton {
  return {
    type: "rectangle",
    id: paper.id("box"),
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
    ...BASE,
    strokeColor: width > 0 ? paper.ink : "transparent",
    backgroundColor: fill,
    strokeWidth: Math.max(width, 1),
    opacity: 100,
    roughness: paper.roughness,
    groupIds: [paper.unit],
    ...marked({ unit: paper.unit, kind: "figure" }),
  } as unknown as ExcalidrawElementSkeleton;
}

export function buildGanttSkeletons(
  spec: GanttSpec,
  at: Rect,
  ink: Ink = MONOCHROME,
  sheet: SheetStyle = FORMAL,
  unit = "gantt-1",
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
  const plan = planGantt(spec, at);
  const rows = ganttRows(spec);
  const size = spec.options.fontSize;
  const { field } = plan;
  const colour = spec.options.color;
  const bottom = field.y + field.height;

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

  // --- the section bands, washed behind their row
  rows.forEach((row, index) => {
    if (row.kind === "section") {
      out.push(box(paper, plan.rows[index].band, toPaper("#64748b", 0.88), 0));
    }
  });

  // --- the header, and a hairline down from each unit
  plan.header.forEach((cell, index) => {
    out.push(text(paper, String(index + 1), { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 }, { size: size - 1 }));
    out.push(strokes(paper, [{ x: cell.x, y: cell.y + cell.height - 4 }, { x: cell.x, y: bottom }], { width: 0.5, color: "#c4c8cf" }));
  });
  out.push(strokes(paper, [{ x: field.x + field.width, y: field.y - 4 }, { x: field.x + field.width, y: bottom }], { width: 0.5, color: "#c4c8cf" }));
  if (spec.options.unit) {
    out.push(
      text(paper, spec.options.unit, { x: field.x - 8, y: field.y - HEADER / 2 }, { size: size - 1, align: "right" }),
    );
  }
  // the rule under the header and the one closing the chart
  out.push(strokes(paper, [{ x: at.x + PAD, y: field.y }, { x: field.x + field.width, y: field.y }], { width: 1.5 }));
  out.push(strokes(paper, [{ x: at.x + PAD, y: bottom }, { x: field.x + field.width, y: bottom }], { width: 1.5 }));

  // --- the names down the left
  rows.forEach((row, index) => {
    const label = plan.rows[index].label;
    const words = row.kind === "section" ? spec.sections[row.index] : spec.tasks[row.index].label;
    out.push(
      text(paper, words, { x: label.x, y: label.y + label.height / 2 }, {
        size: row.kind === "section" ? size + 1 : size,
        align: "left",
      }),
    );
  });

  // --- what is due, under the bars so a bar is never cut by it
  const today = spec.options.today;
  if (today !== null && today >= 1 && today <= plan.span) {
    const x = field.x + (today - 0.5) * plan.unit;
    out.push(strokes(paper, [{ x, y: field.y }, { x, y: bottom }], { width: 1.5, dashed: true, color: "#e34948" }));
    out.push(text(paper, "Today", { x, y: bottom + 10 }, { size: size - 1 }));
  }

  // --- the dependencies, before the bars so a bar sits over the arrow's end
  const byId = new Map(spec.tasks.map((task, index) => [task.id, index]));
  spec.tasks.forEach((task, index) => {
    const to = plan.bars[index];
    for (const id of task.after) {
      const from = byId.get(id);
      if (from === undefined) continue;
      const source = plan.bars[from];
      const leave = source.milestone
        ? { x: source.box.x + source.box.width, y: source.box.y + source.box.height / 2 }
        : { x: source.box.x + source.box.width, y: source.box.y + source.box.height / 2 };
      const drop = to.milestone
        ? { x: to.box.x + to.box.width / 2, y: to.box.y }
        : { x: to.box.x + Math.min(INSET, to.box.width / 3), y: to.box.y };
      const turn = Math.max(drop.x, leave.x + 4);
      const goingUp = drop.y < leave.y;
      const meet = goingUp ? to.box.y + to.box.height : drop.y;
      out.push(strokes(paper, [leave, { x: turn, y: leave.y }, { x: turn, y: meet }], { width: 1 }));
      const head = goingUp ? 1 : -1;
      out.push(
        strokes(
          paper,
          [
            { x: turn, y: meet },
            { x: turn - 3.5, y: meet + head * 6 },
            { x: turn + 3.5, y: meet + head * 6 },
            { x: turn, y: meet },
          ],
          { width: 1, fill: paper.ink },
        ),
      );
    }
  });

  // --- the bars, each filled solid as far as it is done
  spec.tasks.forEach((task, index) => {
    const bar = plan.bars[index];
    if (bar.milestone) {
      const cx = bar.box.x + bar.box.width / 2;
      const cy = bar.box.y + bar.box.height / 2;
      const r = bar.box.width / 2;
      out.push(
        strokes(
          paper,
          [
            { x: cx, y: cy - r },
            { x: cx + r, y: cy },
            { x: cx, y: cy + r },
            { x: cx - r, y: cy },
            { x: cx, y: cy - r },
          ],
          { width: 1, fill: paper.ink },
        ),
      );
      return;
    }
    out.push(box(paper, bar.box, toPaper(colour, 0.7), 0));
    const done = Math.min(100, Math.max(0, task.done));
    if (done > 0) {
      out.push(box(paper, { ...bar.box, width: (bar.box.width * done) / 100 }, colour, 0));
    }
    out.push(box(paper, bar.box, "transparent", 1));
  });

  return out;
}
