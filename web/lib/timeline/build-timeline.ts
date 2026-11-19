import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { marked } from "@/lib/canvas/units";
import { niceScale, tickLabel } from "@/lib/chart/layout-chart";
import { MONOCHROME, type Ink } from "@/lib/ink";
import { textWidth, wrapByWidth } from "@/lib/layout/text";
import { FORMAL, type SheetStyle } from "@/lib/sheet";
import { scaleOf, type TimelineSpec } from "@/lib/timeline/spec";

/**
 * A timeline, laid out and drawn.
 *
 * One rule with an arrowhead, a dot on it for every event, and each event's
 * caption at the end of a stem: when, what, and the note under it. Captions
 * take turns either side of the rule, and one that would run into an earlier
 * caption on its side is stood a level further out, so nothing is ever
 * written over anything else. To scale, the rule is ticked at round values.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Rect extends Pt {
  width: number;
  height: number;
}

interface Line {
  text: string;
  size: number;
  color: string;
}

export interface PlannedEvent {
  dot: Pt;
  /** from the dot to the caption */
  stem: [Pt, Pt];
  /** the caption, as a box, and where its first line starts */
  block: Rect;
  lines: Line[];
  /** which side of the rule: above or left is -1 */
  side: 1 | -1;
}

export interface TimelinePlan {
  title: Rect;
  axis: [Pt, Pt];
  ticks: Array<{ at: Pt; label: string }>;
  events: PlannedEvent[];
  /** where the next event would go, for the `+` on the sheet */
  next: Pt;
  /** the scale the rule is drawn to, when it is to scale */
  range: { min: number; max: number; step: number } | null;
}

const PAD = 18;
const TITLE = 16;
/** the widest a caption is set before it wraps */
const CAPTION = 150;
/** how far the nearest caption stands off the rule */
const STEM = 30;
/** between two levels of captions on one side */
const LEVEL_GAP = 12;
/** between two captions side by side */
const NEIGHBOUR = 10;
export const DOT = 5;
const GREY = "#6b7280";

const round = (value: number) => Math.round(value * 100) / 100;

function linesOf(spec: TimelineSpec, index: number): Line[] {
  const event = spec.events[index];
  const size = spec.options.fontSize;
  const out: Line[] = [];
  if (event.when) out.push({ text: event.when, size, color: spec.options.color });
  for (const line of wrapByWidth(event.label, CAPTION, size)) out.push({ text: line, size, color: "" });
  if (event.note) {
    for (const line of wrapByWidth(event.note, CAPTION, size - 1)) out.push({ text: line, size: size - 1, color: GREY });
  }
  return out;
}

const heightOf = (lines: Line[]) => lines.reduce((sum, line) => sum + line.size * 1.25, 0);
const widthOf = (lines: Line[]) => Math.max(8, ...lines.map((line) => textWidth(line.text, line.size)));

/**
 * Which level out each caption stands at, on its own side: the nearest level
 * where it overlaps nothing already placed there.
 */
function levels(spans: Array<{ side: 1 | -1; low: number; high: number }>): number[] {
  const taken: Array<Array<{ side: number; low: number; high: number }>> = [];
  return spans.map((span) => {
    for (let level = 0; ; level++) {
      const here = (taken[level] ??= []);
      const clash = here.some(
        (other) => other.side === span.side && span.low < other.high + NEIGHBOUR && other.low < span.high + NEIGHBOUR,
      );
      if (!clash) {
        here.push(span);
        return level;
      }
    }
  });
}

export function planTimeline(spec: TimelineSpec, at: Rect): TimelinePlan {
  const horizontal = spec.options.orientation === "horizontal";
  const top = at.y + PAD + (spec.title ? TITLE + 12 : 0);
  const room: Rect = { x: at.x + PAD, y: top, width: Math.max(80, at.width - 2 * PAD), height: Math.max(80, at.y + at.height - PAD - top) };
  const scale = scaleOf(spec);
  const times = spec.events.map((event) => event.at ?? 0);
  const range = scale === "time" ? niceScale(Math.min(...times), Math.max(...times), false) : null;
  const count = Math.max(1, spec.events.length);
  // the rule runs the length of the room, less an arrowhead's worth at the end
  const start = horizontal ? room.x + 6 : room.y + 6;
  const length = (horizontal ? room.width : room.height) - 24;
  const along = (index: number) =>
    range
      ? start + ((times[index] - range.min) / ((range.max - range.min) || 1)) * length
      : start + (length * (index + 0.5)) / count;

  const blocks = spec.events.map((_, index) => {
    const lines = linesOf(spec, index);
    return { lines, width: widthOf(lines), height: heightOf(lines) };
  });
  const sides = spec.events.map((_, index) => (index % 2 === 0 ? -1 : 1) as 1 | -1);
  const spans = spec.events.map((_, index) => {
    const centre = along(index);
    const extent = horizontal ? blocks[index].width : blocks[index].height;
    return { side: sides[index], low: centre - extent / 2, high: centre + extent / 2 };
  });
  const level = levels(spans);
  const deepest = Math.max(1, ...blocks.map((block) => (horizontal ? block.height : block.width)));
  const out = (index: number) => STEM + level[index] * (deepest + LEVEL_GAP);

  const axisAt = horizontal ? room.y + room.height / 2 : room.x + room.width / 2;
  const axis: [Pt, Pt] = horizontal
    ? [{ x: room.x, y: axisAt }, { x: room.x + room.width, y: axisAt }]
    : [{ x: axisAt, y: room.y }, { x: axisAt, y: room.y + room.height }];

  const events: PlannedEvent[] = spec.events.map((_, index) => {
    const centre = along(index);
    const dot = horizontal ? { x: round(centre), y: axisAt } : { x: axisAt, y: round(centre) };
    const { width, height } = blocks[index];
    const side = sides[index];
    const reach = out(index);
    // a caption is centred on its dot, but kept inside the figure
    const block: Rect = horizontal
      ? {
          x: round(Math.min(Math.max(centre - width / 2, at.x + 4), at.x + at.width - width - 4)),
          y: round(side < 0 ? axisAt - reach - height : axisAt + reach),
          width,
          height,
        }
      : {
          x: round(side < 0 ? axisAt - reach - width : axisAt + reach),
          y: round(Math.min(Math.max(centre - height / 2, at.y + 4), at.y + at.height - height - 4)),
          width,
          height,
        };
    const end = horizontal
      ? { x: dot.x, y: side < 0 ? block.y + height + 2 : block.y - 2 }
      : { x: side < 0 ? block.x + width + 4 : block.x - 4, y: dot.y };
    return { dot, stem: [dot, end], block, lines: blocks[index].lines, side };
  });

  const ticks: TimelinePlan["ticks"] = [];
  if (range) {
    for (let value = range.min; value <= range.max + range.step / 2; value += range.step) {
      const offset = start + ((value - range.min) / ((range.max - range.min) || 1)) * length;
      ticks.push({
        at: horizontal ? { x: round(offset), y: axisAt } : { x: axisAt, y: round(offset) },
        label: tickLabel(round(value), range.step),
      });
    }
  }

  return {
    title: { x: at.x + at.width / 2 - 140, y: at.y + PAD - (TITLE + 6) / 2, width: 280, height: TITLE + 6 },
    axis,
    ticks,
    events,
    next: horizontal ? { x: axis[1].x + 14, y: axisAt } : { x: axisAt, y: axis[1].y + 14 },
    range: range ? { ...range } : null,
  };
}

/** A point on the rule, read back as a time; null when the rule is not to scale. */
export function timeAt(spec: TimelineSpec, plan: TimelinePlan, point: Pt): number | null {
  if (!plan.range) return null;
  const horizontal = spec.options.orientation === "horizontal";
  const start = (horizontal ? plan.axis[0].x : plan.axis[0].y) + 6;
  const length = (horizontal ? plan.axis[1].x - plan.axis[0].x : plan.axis[1].y - plan.axis[0].y) - 24;
  const share = ((horizontal ? point.x : point.y) - start) / Math.max(1, length);
  return plan.range.min + Math.max(0, Math.min(1, share)) * (plan.range.max - plan.range.min);
}

/**
 * How big a timeline wants to be drawn: wide enough for its captions side by
 * side, deep enough for every level of them.
 */
export function timelineSize(spec: TimelineSpec): { width: number; height: number } {
  const horizontal = spec.options.orientation === "horizontal";
  const probe = planTimeline(spec, { x: 0, y: 0, width: spec.options.width, height: spec.options.height });
  const extent = (side: number) =>
    Math.max(
      0,
      ...probe.events
        .filter((event) => event.side === side)
        .map((event) =>
          horizontal
            ? side < 0
              ? probe.axis[0].y - event.block.y
              : event.block.y + event.block.height - probe.axis[0].y
            : side < 0
              ? probe.axis[0].x - event.block.x
              : event.block.x + event.block.width - probe.axis[0].x,
        ),
    );
  const across = Math.max(extent(-1), 40) + Math.max(extent(1), 40);
  const chrome = 2 * PAD + (spec.title ? TITLE + 12 : 0) + 24;
  return horizontal
    ? { width: spec.options.width, height: Math.round(Math.max(200, across + chrome)) }
    : { width: Math.round(Math.max(360, across + 2 * PAD + 24)), height: Math.round(Math.max(spec.options.height, spec.events.length * 64 + chrome)) };
}

/** The spec with its size grown to fit, never shrunk below what the reader set. */
export function withFit(spec: TimelineSpec): TimelineSpec {
  const size = timelineSize(spec);
  return {
    ...spec,
    options: {
      ...spec.options,
      width: Math.max(spec.options.width, size.width),
      height: Math.max(spec.options.height, size.height),
    },
  };
}

// ------------------------------------------------------------------- shapes

const BASE = { fillStyle: "solid", strokeStyle: "solid", roundness: null, angle: 0, opacity: 100 } as const;

export function buildTimelineSkeletons(
  spec: TimelineSpec,
  at: Rect,
  ink: Ink = MONOCHROME,
  sheet: SheetStyle = FORMAL,
  unit = "timeline-1",
): ExcalidrawElementSkeleton[] {
  let n = 0;
  const id = (part: string) => `${unit}-${part}-${n++}`;
  const mark = { groupIds: [unit], ...marked({ unit, kind: "figure" }) };
  const plan = planTimeline(spec, at);
  const text = (content: string, point: Pt, size: number, color: string, align: "left" | "center" | "right" = "center", middle = false) =>
    ({
      type: "text",
      id: id("text"),
      text: content,
      x: Math.round(point.x),
      y: Math.round(point.y),
      ...BASE,
      strokeColor: color || ink.color,
      backgroundColor: "transparent",
      strokeWidth: 1,
      roughness: sheet.roughness,
      fontFamily: sheet.fontFamily,
      fontSize: size,
      lineHeight: sheet.lineHeight,
      textAlign: align,
      verticalAlign: middle ? "middle" : "top",
      ...mark,
    }) as unknown as ExcalidrawElementSkeleton;
  const line = (from: Pt, to: Pt, color: string, width: number, head = false) =>
    ({
      type: head ? "arrow" : "line",
      id: id("rule"),
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
      backgroundColor: "transparent",
      strokeWidth: width,
      roughness: sheet.roughness,
      ...(head ? { startArrowhead: null, endArrowhead: "triangle" } : {}),
      ...mark,
    }) as unknown as ExcalidrawElementSkeleton;

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
    out.push(text(spec.title, { x: at.x + at.width / 2, y: at.y + PAD }, TITLE, ink.color, "center", true));
  }
  const horizontal = spec.options.orientation === "horizontal";
  out.push(line(plan.axis[0], plan.axis[1], ink.color, 1.5, true));
  for (const tick of plan.ticks) {
    const across = horizontal ? { x: 0, y: 4 } : { x: 4, y: 0 };
    out.push(line({ x: tick.at.x - across.x, y: tick.at.y - across.y }, { x: tick.at.x + across.x, y: tick.at.y + across.y }, ink.color, 1));
    // the scale is written small and grey, tucked against the rule on the
    // side the first caption is not on, so the two never meet
    out.push(
      horizontal
        ? text(tick.label, { x: tick.at.x, y: tick.at.y + 7 }, spec.options.fontSize - 2, GREY)
        : text(tick.label, { x: tick.at.x + 8, y: tick.at.y }, spec.options.fontSize - 2, GREY, "left", true),
    );
  }
  plan.events.forEach((event) => {
    out.push(line(event.stem[0], event.stem[1], "#9ca3af", 1));
    out.push({
      type: "ellipse",
      id: id("dot"),
      x: Math.round(event.dot.x - DOT),
      y: Math.round(event.dot.y - DOT),
      width: DOT * 2,
      height: DOT * 2,
      ...BASE,
      strokeColor: ink.color,
      backgroundColor: spec.options.color,
      strokeWidth: 1.5,
      roughness: sheet.roughness,
      ...mark,
    } as unknown as ExcalidrawElementSkeleton);
    let y = event.block.y;
    const align: "left" | "center" | "right" = horizontal ? "center" : event.side < 0 ? "right" : "left";
    const x = horizontal ? event.block.x + event.block.width / 2 : event.side < 0 ? event.block.x + event.block.width : event.block.x;
    for (const caption of event.lines) {
      out.push(text(caption.text, { x, y }, caption.size, caption.color, align));
      y += caption.size * 1.25;
    }
  });
  return out;
}
