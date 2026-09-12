"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ElementDrawerProps } from "@/components/editor/element-drawer";
import type { DSLNode } from "@/lib/types";
import { IconButton, Picker, TextField } from "@/components/editor/figure-fields";
import { SlabButton, Tick } from "@/components/editor/ui";

/**
 * A use case diagram, as a list.
 *
 * The one thing a use case diagram has that nothing else on the sheet does is
 * the boundary: the box that says where the system ends. It is chrome rather
 * than an element — nothing is joined to it — so it has never had anywhere to
 * be set from. It does now, here and on its own rail beside the box.
 *
 * Which boundary a use case belongs to stays a matter of where it sits, the
 * way everything else on a graph sheet does. The panel says so rather than
 * offering a setting that would fight the reader's own hand.
 */

const SIDES = [
  { value: "", label: "Auto" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

function Row({
  spec,
  onChange,
  onRemove,
  onSelect,
  children,
}: {
  spec: DSLNode;
  onChange: (spec: DSLNode) => void;
  onRemove: () => void;
  onSelect: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 border-2 border-edge bg-white p-1.5">
      <button
        type="button"
        onClick={onSelect}
        title="Find it on the sheet"
        aria-label="Find it on the sheet"
        className="h-[26px] w-[18px] shrink-0 font-mono text-[11px] text-ink-faint transition-colors hover:text-ink"
      >
        ◎
      </button>
      <TextField
        value={spec.label}
        title="What it is called"
        onCommit={(value) => onChange({ ...spec, label: value.trim() || spec.label })}
      />
      {children}
      <IconButton label="Delete it" danger onClick={onRemove}>
        <Trash2 size={12} />
      </IconButton>
    </div>
  );
}

export default function UseCaseDrawer({
  elements,
  frames,
  onChange,
  onAdd,
  onRemove,
  onFrame,
  onAddFrame,
  onRemoveFrame,
  onSelect,
}: ElementDrawerProps) {
  const actors = elements.filter((entry) => entry.spec.type === "actor");
  const cases = elements.filter((entry) => entry.spec.type !== "actor");
  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      <Tick className="block">System boundary</Tick>
      {frames.length === 0 && (
        <p className="text-[12px] leading-relaxed text-ink-soft">
          No boundary on the sheet. Add one and drag the use cases it holds
          inside it.
        </p>
      )}
      {frames.map((frame) => (
        <div
          key={frame.unit}
          className="flex items-center gap-1.5 border-2 border-edge bg-white p-1.5"
        >
          <TextField
            value={frame.label}
            title="The name written along the top of the boundary"
            placeholder="System"
            onCommit={(value) => onFrame(frame.unit, { label: value })}
          />
          <IconButton
            label="Delete this boundary and leave what is in it"
            danger
            onClick={() => onRemoveFrame(frame.unit)}
          >
            <Trash2 size={12} />
          </IconButton>
        </div>
      ))}
      <SlabButton className="w-full" onClick={onAddFrame}>
        <Plus size={12} />
        Add a boundary
      </SlabButton>
      <p className="text-[11px] leading-relaxed text-ink-faint">
        A use case is inside the boundary when it is drawn inside it, so move
        one in or out by dragging it. Deleting the boundary leaves them alone.
      </p>

      <Tick className="block pt-2">Use cases</Tick>
      {cases.map((entry) => (
        <Row
          key={entry.unit}
          spec={entry.spec}
          onChange={(spec) => onChange(entry.unit, spec)}
          onRemove={() => onRemove(entry.unit)}
          onSelect={() => onSelect(entry.unit)}
        />
      ))}
      <SlabButton className="w-full" onClick={() => onAdd("usecase")}>
        <Plus size={12} />
        Add a use case
      </SlabButton>

      <Tick className="block pt-2">Actors</Tick>
      {actors.map((entry) => (
        <Row
          key={entry.unit}
          spec={entry.spec}
          onChange={(spec) => onChange(entry.unit, spec)}
          onRemove={() => onRemove(entry.unit)}
          onSelect={() => onSelect(entry.unit)}
        >
          <Picker
            value={entry.spec.side ?? ""}
            options={SIDES}
            title="Which side of the boundary it stands on when the source is drawn again"
            className="w-[78px] shrink-0"
            onChange={(value) =>
              onChange(entry.unit, {
                ...entry.spec,
                side: (value || undefined) as DSLNode["side"],
              })
            }
          />
        </Row>
      ))}
      <SlabButton className="w-full" onClick={() => onAdd("actor")}>
        <Plus size={12} />
        Add an actor
      </SlabButton>
      <p className="text-[11px] leading-relaxed text-ink-faint">
        An actor with no side takes the left when it starts something and the
        right when it only answers.
      </p>
    </div>
  );
}
