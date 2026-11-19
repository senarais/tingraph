"use client";

import { useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  layoutChart,
  readAcross,
  readShare,
  readValue,
  type ChartDrawing,
  type Pt,
} from "@/lib/chart/layout-chart";
import { areaBands, waterfallRuns, type ChartSpec } from "@/lib/chart/spec";
import type { CanvasView } from "@/components/editor/pool-controls";

/**
 * Editing a chart on the sheet itself.
 *
 * The panel is where a chart is set up; this is where it is adjusted. A grip
 * sits at the end of every mark, and dragging one changes the reading it
 * stands for — the bar follows the hand because the whole chart is drawn again
 * from the number the hand landed on, which is the same edit the panel makes.
 *
 * A reading is added from here too, because that is the thing a reader reaches
 * for most and the slowest to do by typing.
 */

interface ChartControlsProps {
  api: ExcalidrawImperativeAPI;
  spec: ChartSpec;
  box: { x: number; y: number; width: number; height: number };
  view: CanvasView;
  /** the whole chart again, and whether the hand has come off it */
  onChange: (spec: ChartSpec, settled: boolean) => void;
}

const ACCENT = "#6b46ff";

type Grip =
  | { kind: "value"; series: number; category: number }
  | { kind: "point"; series: number; index: number }
  | { kind: "share"; index: number };

interface Handle {
  at: Pt;
  grip: Grip;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Where a reading may be taken hold of, on whichever kind of chart it is. */
function handlesOf(spec: ChartSpec, drawing: ChartDrawing): Handle[] {
  if (spec.kind === "pie") {
    // the far end of each slice's closing edge: dragging it moves the split
    // between that slice and the next, which is what a share actually is
    return drawing.slices
      .slice(0, Math.max(0, drawing.slices.length - 1))
      .map((slice) => ({ at: slice.grip, grip: { kind: "share", index: slice.index } }));
  }
  if (spec.kind === "scatter") {
    return drawing.dots.map((dot) => ({
      at: dot.at,
      grip: { kind: "point", series: dot.series, index: dot.index },
    }));
  }
  // the charts that say for themselves where their readings are held
  if (drawing.grips.length > 0) {
    return drawing.grips.map((grip) => ({
      at: grip.at,
      grip: { kind: "value", series: grip.series, category: grip.category },
    }));
  }
  if (spec.kind === "bar" || spec.kind === "histogram") {
    return drawing.bars.map((bar) => ({
      at: bar.grip,
      grip: { kind: "value", series: bar.series, category: bar.category },
    }));
  }
  return drawing.dots.map((dot) => ({
    at: dot.at,
    grip: { kind: "value", series: dot.series, category: dot.index },
  }));
}

/**
 * The number a value grip landed on. Most charts read it straight off the
 * value axis; a stacked area, a waterfall, a funnel and a radar each measure
 * it from somewhere else, and this is the one place that knows where.
 */
function readingAt(
  spec: ChartSpec,
  grip: { series: number; category: number },
  at: Pt,
  drawing: ChartDrawing,
): number {
  if (spec.kind === "area" && spec.options.layout === "stacked") {
    const below = areaBands(spec)[grip.series]?.low[grip.category] ?? 0;
    return readValue(drawing, at) - below;
  }
  if (spec.kind === "waterfall") {
    const run = waterfallRuns(spec)[grip.category];
    return run.step === "start" ? readValue(drawing, at) : readValue(drawing, at) - run.from;
  }
  if (spec.kind === "funnel") {
    // a stage is centred, so its reading is twice its reach from the middle
    const reach = Math.max(0, at.x - drawing.centre.x);
    return ((2 * reach) / Math.max(1, drawing.plot.width)) * drawing.scale.max;
  }
  if (spec.kind === "radar") {
    const end = drawing.spokes[grip.category];
    if (!end) return 0;
    const dx = end.x - drawing.centre.x;
    const dy = end.y - drawing.centre.y;
    const length = Math.hypot(dx, dy) || 1;
    // how far along its own spoke the hand is, whatever way it strays
    const along = ((at.x - drawing.centre.x) * dx + (at.y - drawing.centre.y) * dy) / length;
    const share = Math.max(0, Math.min(1, along / length));
    return drawing.scale.min + share * (drawing.scale.max - drawing.scale.min);
  }
  return readValue(drawing, at);
}

/** The chart the reading landed on, as a whole new spec. */
function withReading(spec: ChartSpec, grip: Grip, at: Pt, drawing: ChartDrawing): ChartSpec {
  if (grip.kind === "share") {
    const values = spec.series[0]?.values ?? [];
    const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
    if (total <= 0) {
      return spec;
    }
    const before = values
      .slice(0, grip.index)
      .reduce((sum, value) => sum + Math.max(0, value), 0);
    const pair = Math.max(0, values[grip.index]) + Math.max(0, values[grip.index + 1] ?? 0);
    const share = readShare(drawing, at);
    const taken = Math.max(0, Math.min(pair, share * total - before));
    const next = values.slice();
    next[grip.index] = round(taken);
    next[grip.index + 1] = round(pair - taken);
    return {
      ...spec,
      series: spec.series.map((entry, index) =>
        index === 0 ? { ...entry, values: next } : entry,
      ),
    };
  }
  if (grip.kind === "point") {
    return {
      ...spec,
      series: spec.series.map((entry, index) =>
        index === grip.series
          ? {
              ...entry,
              points: (entry.points ?? []).map((point, at2) =>
                at2 === grip.index
                  ? { ...point, x: round(readAcross(drawing, at)), y: round(readValue(drawing, at)) }
                  : point,
              ),
            }
          : entry,
      ),
    };
  }
  const value = round(readingAt(spec, grip, at, drawing));
  return {
    ...spec,
    series: spec.series.map((entry, index) =>
      index === grip.series
        ? {
            ...entry,
            values: entry.values.map((held, at2) => (at2 === grip.category ? value : held)),
          }
        : entry,
    ),
  };
}

export default function ChartControls({
  api,
  spec,
  box,
  view,
  onChange,
}: ChartControlsProps) {
  /**
   * The grip under the hand, and the chart as it stood when it was taken hold
   * of. The axis is read from that frozen drawing for the whole gesture: a
   * reading dragged past the top of the scale grows the scale, and reading the
   * hand against the new one would send the number chasing the pointer.
   */
  const [held, setHeld] = useState<{ grip: Grip; from: ChartDrawing } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const drawing = layoutChart(spec, box);
  const handles = handlesOf(spec, drawing);
  const scale = view.zoom;
  const size = (value: number) => value / scale;

  const sceneAt = (event: { clientX: number; clientY: number }): Pt => {
    const rect = svgRef.current?.getBoundingClientRect();
    const state = api.getAppState();
    return {
      x: (event.clientX - (rect?.left ?? 0)) / state.zoom.value - state.scrollX,
      y: (event.clientY - (rect?.top ?? 0)) / state.zoom.value - state.scrollY,
    };
  };

  const move = (event: React.PointerEvent) => {
    if (held) {
      onChange(withReading(spec, held.grip, sceneAt(event), held.from), false);
    }
  };
  const up = (event: React.PointerEvent) => {
    if (held) {
      onChange(withReading(spec, held.grip, sceneAt(event), held.from), true);
      setHeld(null);
    }
  };

  /** The last reading, taken back off. A chart with one reading keeps it. */
  const dropReading = () => {
    if (spec.kind === "scatter") {
      const points = spec.series[0]?.points ?? [];
      if (points.length <= 1) {
        return;
      }
      onChange(
        {
          ...spec,
          series: spec.series.map((entry, index) =>
            index === 0
              ? { ...entry, points: (entry.points ?? []).slice(0, -1) }
              : entry,
          ),
        },
        true,
      );
      return;
    }
    // a radar is a wheel of at least three spokes
    if (spec.categories.length <= (spec.kind === "radar" ? 3 : 1)) {
      return;
    }
    onChange(
      {
        ...spec,
        categories: spec.categories.slice(0, -1),
        series: spec.series.map((entry) => ({
          ...entry,
          values: entry.values.slice(0, -1),
        })),
        ...(spec.steps ? { steps: spec.steps.slice(0, -1) } : {}),
      },
      true,
    );
  };

  /** One more reading, at the end, taking the shape of the ones before it. */
  const addReading = () => {
    if (spec.kind === "scatter") {
      const series = spec.series[0];
      const points = series?.points ?? [];
      const last = points[points.length - 1] ?? { x: drawing.acrossScale.min, y: 0 };
      onChange(
        {
          ...spec,
          series: spec.series.map((entry, index) =>
            index === 0
              ? {
                  ...entry,
                  points: [...(entry.points ?? []), { x: round(last.x + 1), y: round(last.y) }],
                }
              : entry,
          ),
        },
        true,
      );
      return;
    }
    onChange(
      {
        ...spec,
        categories: [...spec.categories, `Item ${spec.categories.length + 1}`],
        series: spec.series.map((entry) => ({
          ...entry,
          // a funnel's next stage is narrower than the last; a waterfall's
          // next step is a small change, not a copy of a total
          values: [
            ...entry.values,
            spec.kind === "funnel"
              ? round((entry.values[entry.values.length - 1] ?? 2) / 2)
              : spec.kind === "waterfall"
                ? 1
                : round(entry.values[entry.values.length - 1] ?? 1),
          ],
        })),
        ...(spec.kind === "waterfall" ? { steps: [...(spec.steps ?? spec.categories.map(() => "change" as const)), "change" as const] } : {}),
      },
      true,
    );
  };

  const onSheet = (at: Pt) => ({
    left: (at.x + view.scrollX) * scale,
    top: (at.y + view.scrollY) * scale,
  });

  /** how many readings there are to take off, whichever kind of chart it is */
  const readings =
    spec.kind === "scatter" ? (spec.series[0]?.points?.length ?? 0) : spec.categories.length;

  // the pair sits just past the last slot, where the next reading will go
  const last = drawing.slots[drawing.slots.length - 1];
  const addAt: Pt | null =
    spec.kind === "pie" || spec.kind === "radar"
      ? { x: drawing.centre.x, y: drawing.centre.y + drawing.radius + 28 + (spec.kind === "radar" ? 14 : 0) }
      : spec.kind === "scatter"
        ? {
            x: drawing.plot.x + drawing.plot.width,
            y: drawing.plot.y + drawing.plot.height + 18,
          }
        : last
          ? drawing.across
            ? { x: last.at + last.size, y: drawing.plot.y + drawing.plot.height + 16 }
            : { x: drawing.plot.x - 26, y: last.at + last.size * 0.85 }
          : {
              x: drawing.plot.x + drawing.plot.width / 2,
              y: drawing.plot.y + drawing.plot.height + 16,
            };

  return (
    <>
      <svg
        ref={svgRef}
        className="absolute inset-0 z-20 h-full w-full"
        style={{ pointerEvents: "none", touchAction: "none" }}
        onPointerMove={held ? move : undefined}
        onPointerUp={held ? up : undefined}
      >
        <g transform={`translate(${view.scrollX * scale} ${view.scrollY * scale}) scale(${scale})`}>
          {handles.map((handle, index) => (
            <circle
              key={index}
              cx={handle.at.x}
              cy={handle.at.y}
              r={size(4.5)}
              fill="#ffffff"
              stroke={ACCENT}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: "auto", cursor: "grab" }}
              onPointerDown={(event) => {
                event.stopPropagation();
                try {
                  (event.target as Element).setPointerCapture(event.pointerId);
                } catch {
                  // a pointer that has already gone; the drag still reads fine
                }
                setHeld({ grip: handle.grip, from: drawing });
              }}
              onPointerMove={move}
              onPointerUp={up}
            />
          ))}
        </g>
      </svg>
      {addAt && (
        <div
          className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
          aria-hidden={false}
        >
          {/* the pair that grows and shrinks the chart, where the next reading goes */}
          <div
            className="slab-tight pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 items-stretch bg-white"
            style={onSheet(addAt)}
          >
            <button
              type="button"
              onClick={addReading}
              title="Add a reading to this chart"
              aria-label="Add a reading to this chart"
              className="grid h-6 w-6 place-items-center border-r-2 border-edge text-ink transition-colors hover:bg-bone"
            >
              <Plus size={13} />
            </button>
            <button
              type="button"
              onClick={dropReading}
              disabled={readings <= 1}
              title="Take the last reading off"
              aria-label="Take the last reading off"
              className="grid h-6 w-6 place-items-center text-ink transition-colors hover:bg-alert-tint hover:text-alert disabled:opacity-30"
            >
              <Minus size={13} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
