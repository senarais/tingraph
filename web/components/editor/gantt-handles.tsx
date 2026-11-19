"use client";

import { useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { planGantt } from "@/lib/gantt/build-gantt";
import { dropTask, freshTaskId, ganttRows, withRows, type GanttSpec } from "@/lib/gantt/spec";
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
 * A Gantt chart on the sheet.
 *
 * A bar is moved by dragging it, and lengthened or shortened by its right
 * end; both snap to whole units, and both write the spec, so the panel and
 * the source say the same numbers. A task that starts after another is placed
 * by that, so it has an end to drag but no body: dragging it would contradict
 * the dependency. Every name — the title, a section, a task — is renamed
 * where it is read, and the `+` under the chart adds a task after the last.
 */

interface GanttHandlesProps {
  api: ExcalidrawImperativeAPI;
  spec: GanttSpec;
  box: Rect;
  view: CanvasView;
  picked: string | null;
  onPick: (id: string | null) => void;
  onChange: (spec: GanttSpec, settled: boolean) => void;
}

type Hold = { index: number; mode: "move" | "length"; from: number; start: number; length: number };

export default function GanttHandles({ api, spec, box, view, picked, onPick, onChange }: GanttHandlesProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [held, setHeld] = useState<Hold | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const sceneAt = useSceneAt(api, svgRef);
  const plan = planGantt(spec, box);
  const rows = ganttRows(spec);
  const scale = view.zoom;
  const [kind, key] = (picked ?? "").split(":");

  const drag = (hold: Hold, x: number, settled: boolean) => {
    const units = Math.round((x - hold.from) / plan.unit);
    const task = spec.tasks[hold.index];
    const patch =
      hold.mode === "move"
        ? { start: Math.max(1, hold.start + units) }
        : { length: Math.max(1, hold.length + units) };
    onChange({ ...spec, tasks: spec.tasks.map((t, i) => (i === hold.index ? { ...task, ...patch } : t)) }, settled);
  };

  const grab = (index: number, mode: Hold["mode"]) => (event: React.PointerEvent) => {
    event.stopPropagation();
    try {
      (event.target as Element).setPointerCapture(event.pointerId);
    } catch {
      // a pointer that has already gone; the drag still reads fine
    }
    onPick(`task:${index}`);
    const task = spec.tasks[index];
    setHeld({ index, mode, from: sceneAt(event).x, start: task.start ?? 1, length: task.length });
  };
  const follow = (event: React.PointerEvent) => {
    if (held) drag(held, sceneAt(event).x, false);
  };
  const release = (event: React.PointerEvent) => {
    if (held) {
      drag(held, sceneAt(event).x, true);
      setHeld(null);
    }
  };

  const rowOf = (match: (row: (typeof rows)[number]) => boolean) => rows.findIndex(match);
  const chosen: { box: Rect; label: string; rename: (value: string) => void; task?: number } | null =
    kind === "title"
      ? { box: plan.title, label: spec.title, rename: (value) => onChange({ ...spec, title: value }, true) }
      : kind === "section" && spec.sections[Number(key)] !== undefined
        ? {
            box: plan.rows[rowOf((row) => row.kind === "section" && row.index === Number(key))].label,
            label: spec.sections[Number(key)],
            rename: (value) =>
              onChange({ ...spec, sections: spec.sections.map((s, i) => (i === Number(key) ? value : s)) }, true),
          }
        : kind === "task" && spec.tasks[Number(key)]
          ? {
              box: plan.rows[rowOf((row) => row.kind === "task" && row.index === Number(key))].label,
              label: spec.tasks[Number(key)].label,
              task: Number(key),
              rename: (value) =>
                onChange(
                  { ...spec, tasks: spec.tasks.map((t, i) => (i === Number(key) ? { ...t, label: value } : t)) },
                  true,
                ),
            }
          : null;

  const addTask = () => {
    const last = spec.tasks[spec.tasks.length - 1];
    onChange(
      withRows(spec, {
        ...spec,
        tasks: [
          ...spec.tasks,
          {
            id: freshTaskId(spec, false),
            label: `Task ${spec.tasks.length + 1}`,
            section: spec.sections.length - 1,
            start: last ? null : 1,
            after: last ? [last.id] : [],
            length: 2,
            done: 0,
          },
        ],
      }),
      true,
    );
  };

  return (
    <>
      <svg ref={svgRef} className="absolute inset-0 z-20 h-full w-full" style={{ pointerEvents: "none", touchAction: "none" }}>
        <g transform={`translate(${view.scrollX * scale} ${view.scrollY * scale}) scale(${scale})`}>
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
          {rows.map((row, index) => {
            const id = `${row.kind}:${row.index}`;
            return (
              <HitBox
                key={id}
                box={plan.rows[index].label}
                held={picked === id}
                label={row.kind === "section" ? `Section ${spec.sections[row.index]}` : `Task ${spec.tasks[row.index].label}`}
                onPick={() => onPick(id)}
                onRename={() => {
                  onPick(id);
                  setNaming(id);
                }}
              />
            );
          })}
          {spec.tasks.map((task, index) => {
            const bar = plan.bars[index].box;
            if (task.length === 0) return null;
            const free = task.after.length === 0;
            const grip = Math.max(6, 8 / scale);
            return (
              <g key={task.id}>
                {free && (
                  <rect
                    x={bar.x}
                    y={bar.y}
                    width={Math.max(1, bar.width - grip)}
                    height={bar.height}
                    fill="transparent"
                    stroke={picked === `task:${index}` ? ACCENT : "transparent"}
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                    aria-label={`Move ${task.label}`}
                    style={{ pointerEvents: "auto", cursor: "grab" }}
                    onPointerDown={grab(index, "move")}
                    onPointerMove={follow}
                    onPointerUp={release}
                  />
                )}
                <rect
                  x={bar.x + bar.width - grip}
                  y={bar.y}
                  width={grip * 2}
                  height={bar.height}
                  fill="transparent"
                  aria-label={`Change how long ${task.label} lasts`}
                  style={{ pointerEvents: "auto", cursor: "ew-resize" }}
                  onPointerDown={grab(index, "length")}
                  onPointerMove={follow}
                  onPointerUp={release}
                />
              </g>
            );
          })}
        </g>
      </svg>

      <HandleLayer>
        <SheetKey view={view} at={{ x: plan.field.x + plan.field.width / 2, y: box.y + box.height - 6 }} label="Add a task after the last" onClick={addTask}>
          <Plus size={12} />
        </SheetKey>

        {chosen && !held && naming !== picked && (
          <PartBar view={view} at={{ x: chosen.box.x + chosen.box.width / 2, y: chosen.box.y - 6 }}>
            <BarKey label="Write here" onClick={() => setNaming(picked)} last={chosen.task === undefined}>
              <Pencil size={13} />
            </BarKey>
            {chosen.task !== undefined && (
              <BarKey
                label="Remove this task"
                danger
                onClick={() => {
                  onPick(null);
                  onChange(dropTask(spec, chosen.task as number), true);
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
            width={chosen.box.width}
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
