"use client";

import { useRef, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ChartOnSheet } from "@/lib/canvas/scene";
import {
  layoutChart,
  readAcross,
  readShare,
  readValue,
  type ChartDrawing,
  type Pt,
} from "@/lib/chart/layout-chart";
import type { ChartSpec } from "@/lib/chart/spec";
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
  api: ExcalidrawImperativeAPI | null;
  chart: ChartOnSheet | null;
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
  if (spec.kind === "bar") {
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
  const value = round(readValue(drawing, at));
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
  chart,
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

  if (!api || !chart) {
    return null;
  }

  const drawing = layoutChart(chart.spec, chart.box);
  const handles = handlesOf(chart.spec, drawing);
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
      onChange(withReading(chart.spec, held.grip, sceneAt(event), held.from), false);
    }
  };
  const up = (event: React.PointerEvent) => {
    if (held) {
      onChange(withReading(chart.spec, held.grip, sceneAt(event), held.from), true);
      setHeld(null);
    }
  };

  /** One more reading, at the end, taking the shape of the ones before it. */
  const addReading = () => {
    const spec = chart.spec;
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
          values: [...entry.values, round(entry.values[entry.values.length - 1] ?? 1)],
        })),
      },
      true,
    );
  };

  const onSheet = (at: Pt) => ({
    left: (at.x + view.scrollX) * scale,
    top: (at.y + view.scrollY) * scale,
  });

  // the button sits just past the last slot, where the next reading will go
  const last = drawing.slots[drawing.slots.length - 1];
  const addAt: Pt | null =
    chart.spec.kind === "pie"
      ? { x: drawing.centre.x, y: drawing.centre.y + drawing.radius + 28 }
      : chart.spec.kind === "scatter"
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
          <button
            type="button"
            onClick={addReading}
            title="Add a reading to this chart"
            aria-label="Add a reading to this chart"
            className="slab-tight pointer-events-auto absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center bg-white text-[13px] font-semibold leading-none text-ink transition-colors hover:bg-bone"
            style={onSheet(addAt)}
          >
            +
          </button>
        </div>
      )}
    </>
  );
}
