"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import type { ElementDrawerProps } from "@/components/editor/element-drawer";
import type { DSLNode } from "@/lib/types";
import { IconButton, Picker, TextField } from "@/components/editor/figure-fields";
import { SlabButton, Tick } from "@/components/editor/ui";

/**
 * A UML activity diagram, as a list.
 *
 * Its partitions are the thing that separates it from a flowchart, and they
 * are *columns*: the diagram reads down the page while they run across it. So
 * they are added and taken off along the right-hand edge rather than the
 * bottom, and everything drawn in a column goes with it when it goes.
 */

const STEPS: Array<{ value: string; label: string }> = [
  { value: "action", label: "Action" },
  { value: "object", label: "Object" },
  { value: "decision", label: "Decision" },
  { value: "merge", label: "Merge" },
  { value: "fork", label: "Fork" },
  { value: "join", label: "Join" },
  { value: "initial", label: "Initial" },
  { value: "final", label: "Final" },
  { value: "flow-final", label: "Flow final" },
];

export default function ActivityDrawer({
  elements,
  frames,
  onChange,
  onAdd,
  onRemove,
  onSelect,
  onAddLane,
  onRemoveLane,
  onRenameLane,
}: ElementDrawerProps) {
  const frame = frames[0] ?? null;
  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      <Tick className="block">Partitions</Tick>
      {!frame && (
        <p className="text-[12px] leading-relaxed text-ink-soft">
          No partitions on the sheet. Write them in the source and press
          Generate, and they can be added and named from here afterwards.
        </p>
      )}
      {frame?.lanes.map((lane) => (
        <div
          key={lane.unit}
          className="flex items-center gap-1.5 border-2 border-edge bg-white p-1.5"
        >
          <TextField
            value={lane.label}
            title="The name written above this partition"
            placeholder="Partition"
            onCommit={(value) => onRenameLane(lane.unit, value)}
          />
        </div>
      ))}
      {frame && (
        <div className="space-y-1.5">
          <SlabButton className="w-full" onClick={() => onAddLane(frame)}>
            <Plus size={12} />
            Add a partition
          </SlabButton>
          <SlabButton
            className="w-full"
            disabled={frame.lanes.length < 2}
            title="Take the right-hand partition off, and everything standing in it"
            onClick={() => onRemoveLane(frame)}
          >
            <Minus size={12} />
            Take the last one off
          </SlabButton>
        </div>
      )}

      <Tick className="block pt-2">Steps</Tick>
      {elements.map((entry) => (
        <div
          key={entry.unit}
          className="flex items-center gap-1.5 border-2 border-edge bg-white p-1.5"
        >
          <button
            type="button"
            onClick={() => onSelect(entry.unit)}
            title="Find it on the sheet"
            aria-label="Find it on the sheet"
            className="h-[26px] w-[18px] shrink-0 font-mono text-[11px] text-ink-faint transition-colors hover:text-ink"
          >
            ◎
          </button>
          <TextField
            value={entry.spec.label}
            title="What it is called"
            placeholder="Step"
            onCommit={(value) => onChange(entry.unit, { ...entry.spec, label: value })}
          />
          <Picker
            value={entry.spec.type}
            options={STEPS}
            title="What kind of step it is"
            className="w-[96px] shrink-0"
            onChange={(value) =>
              onChange(entry.unit, { ...entry.spec, type: value as DSLNode["type"] })
            }
          />
          <IconButton label="Delete this step" danger onClick={() => onRemove(entry.unit)}>
            <Trash2 size={12} />
          </IconButton>
        </div>
      ))}
      <SlabButton className="w-full" onClick={() => onAdd("action")}>
        <Plus size={12} />
        Add a step
      </SlabButton>
      <p className="text-[11px] leading-relaxed text-ink-faint">
        A step belongs to whichever partition it is drawn in, so move one across
        by dragging it.
      </p>
    </div>
  );
}
