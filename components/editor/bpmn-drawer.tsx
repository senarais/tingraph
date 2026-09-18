"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import type { ElementDrawerProps } from "@/components/editor/element-drawer";
import { IconButton, Picker, TextField } from "@/components/editor/figure-fields";
import { SlabButton, Tick } from "@/components/editor/ui";
import type { DSLNode } from "@/lib/types";

const ELEMENT_TYPES: Array<{ value: string; label: string }> = [
  { value: "start", label: "Start" },
  { value: "end", label: "End" },
  { value: "msg-start", label: "Message start" },
  { value: "msg-end", label: "Message end" },
  { value: "timer", label: "Timer" },
  { value: "task", label: "Task" },
  { value: "send-task", label: "Send task" },
  { value: "recv-task", label: "Receive task" },
  { value: "script-task", label: "Script task" },
  { value: "user-task", label: "User task" },
  { value: "gw-ex", label: "Exclusive gateway" },
  { value: "gw-para", label: "Parallel gateway" },
  { value: "gw-inc", label: "Inclusive gateway" },
  { value: "data", label: "Data object" },
];

const FLOW_TYPES = [
  { value: "sequence", label: "Sequence" },
  { value: "message", label: "Message" },
  { value: "association", label: "Association" },
];

/** BPMN structure edited as pools containing ordered lanes. */
export default function BpmnDrawer({
  pools,
  elements,
  links,
  onSelect,
  onChange,
  onAdd,
  onRemove,
  onLink,
  onLabelLink,
  onRemoveLink,
  onRenamePoolPart,
  onAddPool,
  onRemovePool,
  onAddPoolLane,
  onRemovePoolLane,
}: ElementDrawerProps) {
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <Tick className="block">Pools & lanes</Tick>
      {pools.length === 0 && (
        <p className="text-[12px] leading-relaxed text-ink-soft">
          No pool on the sheet. Add one in the source and press Generate.
        </p>
      )}
      {pools.map((pool, poolIndex) => (
        <section key={pool.unit} className="border-2 border-edge bg-white">
          <div className="flex items-center gap-1.5 border-b-2 border-edge bg-bone p-1.5">
            <TextField
              value={pool.label}
              title="Pool name"
              placeholder={`Pool ${poolIndex + 1}`}
              onCommit={(value) => onRenamePoolPart(pool.unit, value)}
            />
            <IconButton label="Delete this pool" danger onClick={() => onRemovePool(pool)}>
              <Trash2 size={12} />
            </IconButton>
          </div>
          <div className="space-y-1.5 p-2">
            {pool.lanes.map((lane, laneIndex) => (
              <div key={lane.unit ?? `${pool.unit}-${laneIndex}`} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-right text-[10px] text-ink-faint">
                  {laneIndex + 1}
                </span>
                {lane.unit ? (
                  <TextField
                    value={lane.label}
                    title={`Lane ${laneIndex + 1} name`}
                    placeholder={`Lane ${laneIndex + 1}`}
                    onCommit={(value) => onRenamePoolPart(lane.unit as string, value)}
                  />
                ) : (
                  <span className="w-full border-2 border-edge bg-bone px-1.5 py-1 text-[11.5px] text-ink-faint">
                    Unnamed lane
                  </span>
                )}
              </div>
            ))}
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <SlabButton onClick={() => onAddPoolLane(pool)}>
                <Plus size={12} />
                Add lane
              </SlabButton>
              <SlabButton
                disabled={pool.lanes.length < 2}
                title="Remove the bottom lane and everything standing in it"
                onClick={() => onRemovePoolLane(pool)}
              >
                <Minus size={12} />
                Last lane
              </SlabButton>
            </div>
            <SlabButton className="w-full" onClick={() => onAddPool(pool)}>
              <Plus size={12} />
              Add pool below
            </SlabButton>
          </div>
        </section>
      ))}

      <Tick className="block pt-2">Elements</Tick>
      {elements.map((entry) => (
        <div key={entry.unit} className="flex items-center gap-1.5 border-2 border-edge bg-white p-1.5">
          <button
            type="button"
            onClick={() => onSelect(entry.unit)}
            title="Find it on the sheet"
            aria-label="Find it on the sheet"
            className="h-[26px] w-[18px] shrink-0 text-[11px] text-ink-faint hover:text-ink"
          >
            ◎
          </button>
          <TextField
            value={entry.spec.label}
            title="Element name"
            placeholder="Element"
            onCommit={(value) => onChange(entry.unit, { ...entry.spec, label: value })}
          />
          <Picker
            value={entry.spec.type}
            options={ELEMENT_TYPES}
            title="BPMN element type"
            className="w-[112px] shrink-0"
            onChange={(value) =>
              onChange(entry.unit, { ...entry.spec, type: value as DSLNode["type"] })
            }
          />
          <IconButton label="Delete this element" danger onClick={() => onRemove(entry.unit)}>
            <Trash2 size={12} />
          </IconButton>
        </div>
      ))}
      <SlabButton className="w-full" onClick={() => onAdd("task")}>
        <Plus size={12} />
        Add a task
      </SlabButton>

      {links.length > 0 && (
        <>
          <Tick className="block pt-2">Flows</Tick>
          {links.map((link) => (
            <div key={link.id} className="flex items-center gap-1.5 border-2 border-edge bg-white p-1.5">
              <TextField
                value={link.label}
                title="Flow label"
                placeholder="Label"
                onCommit={(value) => onLabelLink(link.id, value)}
              />
              <Picker
                value={link.link.line}
                options={FLOW_TYPES}
                title="Flow type"
                className="w-[102px] shrink-0"
                onChange={(value) => onLink(link.id, { line: value })}
              />
              <IconButton label="Delete this flow" danger onClick={() => onRemoveLink(link.id)}>
                <Trash2 size={12} />
              </IconButton>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
