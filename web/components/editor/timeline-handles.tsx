"use client";

import { useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { DOT, planTimeline, timeAt, withFit, type TimelinePlan } from "@/lib/timeline/build-timeline";
import { scaleOf, type TimelineSpec } from "@/lib/timeline/spec";
import type { CanvasView } from "@/components/editor/pool-controls";
import {
  ACCENT,
  BarKey,
  HandleLayer,
  HitBox,
  PartBar,
  Rename,
  SheetKey,
  useSceneAt,
  type Rect,
} from "@/components/editor/figure-handles";

/**
 * A timeline on the sheet.
 *
 * On a timeline drawn to scale an event's dot is dragged along the rule, and
 * where it lands is read back as its time — in whole units when every time was
 * written as one. A timeline drawn in sequence has no time to drag to, so its
 * dots stay put. Every caption is renamed in place, and the `+` past the end
 * of the rule adds an event after the last.
 */

interface TimelineHandlesProps {
  api: ExcalidrawImperativeAPI;
  spec: TimelineSpec;
  box: Rect;
  view: CanvasView;
  picked: string | null;
  onPick: (id: string | null) => void;
  onChange: (spec: TimelineSpec, settled: boolean) => void;
}

/** A time as it is written: whole when the timeline counts in whole units. */
function written(value: number, whole: boolean): string {
  return whole ? String(Math.round(value)) : String(Math.round(value * 100) / 100);
}

export default function TimelineHandles({
  api,
  spec,
  box,
  view,
  picked,
  onPick,
  onChange,
}: TimelineHandlesProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [held, setHeld] = useState<number | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  // the rule as it stood when the dot was taken hold of: read live, the scale
  // would grow under the pointer as the event moved past the end
  const grip = useRef<TimelinePlan | null>(null);
  const sceneAt = useSceneAt(api, svgRef);
  const plan = planTimeline(spec, box);
  const scale = view.zoom;
  const toScale = scaleOf(spec) === "time";
  const whole = spec.events.every((event) => event.at === null || Number.isInteger(event.at));
  const [kind, key] = (picked ?? "").split(":");

  const move = (index: number, point: { x: number; y: number }, settled: boolean) => {
    const at = timeAt(spec, grip.current ?? plan, point);
    if (at === null) return;
    const when = written(at, whole);
    const events = spec.events.map((event, i) => (i === index ? { ...event, when, at: Number(when) } : event));
    // once let go, the events are written in time order again, so the source
    // and the captions' sides read the way the rule does
    const next = settled ? [...events].sort((a, b) => (a.at ?? 0) - (b.at ?? 0)) : events;
    onChange({ ...spec, events: next }, settled);
    if (settled) {
      onPick(`event:${next.indexOf(events[index])}`);
    }
  };

  const event = kind === "event" ? spec.events[Number(key)] : undefined;
  const chosen: { box: Rect; label: string; rename: (value: string) => void; index?: number } | null =
    kind === "title"
      ? { box: plan.title, label: spec.title, rename: (value) => onChange({ ...spec, title: value }, true) }
      : event
        ? {
            box: plan.events[Number(key)].block,
            label: event.label,
            index: Number(key),
            rename: (value: string) =>
              onChange(
                withFit({
                  ...spec,
                  events: spec.events.map((entry, i) => (i === Number(key) ? { ...entry, label: value } : entry)),
                }),
                true,
              ),
          }
        : null;

  const add = () => {
    const last = spec.events[spec.events.length - 1];
    const step = plan.range ? plan.range.step : 1;
    const at = toScale && last?.at !== null && last?.at !== undefined ? last.at + step : null;
    const when = at === null ? `Step ${spec.events.length + 1}` : written(at, whole);
    onChange(
      withFit({
        ...spec,
        events: [...spec.events, { when, at: at === null ? null : Number(when), label: "New event", note: "" }],
      }),
      true,
    );
    onPick(`event:${spec.events.length}`);
  };

  return (
    <>
      <svg ref={svgRef} className="absolute inset-0 z-20 h-full w-full" style={{ pointerEvents: "none", touchAction: "none" }}>
        <g transform={`translate(${view.scrollX * scale} ${view.scrollY * scale}) scale(${scale})`}>
          {spec.title && (
            <HitBox
              box={plan.title}
              held={picked === "title"}
              label={`Title: ${spec.title}`}
              onPick={() => onPick("title")}
              onRename={() => {
                onPick("title");
                setNaming("title");
              }}
            />
          )}
          {spec.events.map((entry, index) => (
            <HitBox
              key={`event-${index}`}
              box={plan.events[index].block}
              held={picked === `event:${index}`}
              label={`Event: ${entry.label}`}
              onPick={() => onPick(`event:${index}`)}
              onRename={() => {
                onPick(`event:${index}`);
                setNaming(`event:${index}`);
              }}
            />
          ))}
          {toScale &&
            spec.events.map((entry, index) => (
              <circle
                key={`dot-${index}`}
                cx={plan.events[index].dot.x}
                cy={plan.events[index].dot.y}
                r={Math.max(DOT + 3, 7 / scale)}
                fill="transparent"
                stroke={picked === `event:${index}` ? ACCENT : "transparent"}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                aria-label={`Move ${entry.label} along the timeline`}
                style={{ pointerEvents: "auto", cursor: spec.options.orientation === "horizontal" ? "ew-resize" : "ns-resize" }}
                onPointerDown={(pointer) => {
                  pointer.stopPropagation();
                  try {
                    (pointer.target as Element).setPointerCapture(pointer.pointerId);
                  } catch {
                    // a pointer that has already gone; the drag still reads fine
                  }
                  grip.current = plan;
                  onPick(`event:${index}`);
                  setHeld(index);
                }}
                onPointerMove={(pointer) => {
                  if (held === index) move(index, sceneAt(pointer), false);
                }}
                onPointerUp={(pointer) => {
                  if (held === index) {
                    move(index, sceneAt(pointer), true);
                    setHeld(null);
                    grip.current = null;
                  }
                }}
              />
            ))}
        </g>
      </svg>

      <HandleLayer>
        <SheetKey view={view} at={plan.next} label="Add an event after the last" onClick={add}>
          <Plus size={12} />
        </SheetKey>

        {chosen && held === null && naming !== picked && (
          // on a rule across the page an event's stem runs up or down to its
          // dot, so a bar over the caption would sit on the dot; it goes beside
          <PartBar
            view={view}
            {...(chosen.index !== undefined && spec.options.orientation === "horizontal"
              ? { align: "beside" as const, at: { x: chosen.box.x + chosen.box.width + 6, y: chosen.box.y + chosen.box.height / 2 } }
              : { at: { x: chosen.box.x + chosen.box.width / 2, y: chosen.box.y - 6 } })}
          >
            <BarKey label="Write here" onClick={() => setNaming(picked)} last={chosen.index === undefined}>
              <Pencil size={13} />
            </BarKey>
            {chosen.index !== undefined && (
              <BarKey
                label="Remove this event"
                danger
                disabled={spec.events.length <= 1}
                onClick={() => {
                  onPick(null);
                  onChange({ ...spec, events: spec.events.filter((_, i) => i !== chosen.index) }, true);
                }}
                last
              >
                <Trash2 size={13} />
              </BarKey>
            )}
          </PartBar>
        )}

        {chosen && naming === picked && (
          <Rename
            view={view}
            at={{ x: chosen.box.x + chosen.box.width / 2, y: chosen.box.y + chosen.box.height / 2 }}
            width={Math.max(120, chosen.box.width)}
            value={chosen.label}
            onCommit={(value) => {
              chosen.rename(value);
              setNaming(null);
            }}
            onCancel={() => setNaming(null)}
          />
        )}
      </HandleLayer>
    </>
  );
}
