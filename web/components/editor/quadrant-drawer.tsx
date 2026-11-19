"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  QUADRANT_CORNERS,
  QUADRANT_STYLES,
  clampShare,
  type QuadrantAxis,
  type QuadrantCorner,
  type QuadrantSpec,
} from "@/lib/quadrant/spec";
import { Field, SlabButton, Tick } from "@/components/editor/ui";
import {
  Choice,
  ColourDot,
  IconButton,
  NumberField,
  SizeField,
  Slider,
  TextField,
} from "@/components/editor/figure-fields";

/**
 * A 2×2 quadrant's settings: the two axes, what each quarter is called, the
 * items plotted on the field, and how it is drawn. Every field here has a word
 * in the source and the other way round.
 */

const CORNER_NAMES: Record<QuadrantCorner, string> = {
  "top-left": "Top left",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
};

interface QuadrantDrawerProps {
  spec: QuadrantSpec;
  onChange: (spec: QuadrantSpec) => void;
}

export default function QuadrantDrawer({ spec, onChange }: QuadrantDrawerProps) {
  const { options } = spec;
  const set = <K extends keyof QuadrantSpec["options"]>(key: K, value: QuadrantSpec["options"][K]) =>
    onChange({ ...spec, options: { ...options, [key]: value } });
  const writeAxis = (which: "x" | "y", patch: Partial<QuadrantAxis>) =>
    onChange({ ...spec, [which]: { ...spec[which], ...patch } });
  const writeItem = (index: number, patch: Partial<QuadrantSpec["items"][number]>) =>
    onChange({
      ...spec,
      items: spec.items.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)),
    });

  const axis = (which: "x" | "y", name: string) => (
    <div className="space-y-1.5">
      <Tick className="block">{name}</Tick>
      <TextField
        value={spec[which].label}
        title={`What the ${name.toLowerCase()} measures`}
        onCommit={(label) => writeAxis(which, { label })}
      />
      <div className="flex items-center gap-1.5">
        <TextField
          value={spec[which].low}
          placeholder="low end"
          title={`The low end of the ${name.toLowerCase()}`}
          onCommit={(low) => writeAxis(which, { low })}
        />
        <TextField
          value={spec[which].high}
          placeholder="high end"
          title={`The high end of the ${name.toLowerCase()}`}
          onCommit={(high) => writeAxis(which, { high })}
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Field label="Title" className="border-b-2 border-edge p-3">
        <TextField
          value={spec.title}
          onCommit={(title) => onChange({ ...spec, title })}
          title="What the quadrant is called"
        />
      </Field>

      <Field label="Axes" className="border-b-2 border-edge p-3">
        <div className="space-y-3">
          {axis("x", "Across")}
          {axis("y", "Up")}
        </div>
      </Field>

      <Field label="Quarters" className="border-b-2 border-edge p-3">
        <div className="space-y-1.5">
          {QUADRANT_CORNERS.map((corner) => (
            <div key={corner}>
              <Tick className="mb-0.5 block">{CORNER_NAMES[corner]}</Tick>
              <TextField
                value={spec.quarters[corner] ?? ""}
                placeholder="what this quarter is"
                title={`${CORNER_NAMES[corner]} quarter`}
                onCommit={(value) =>
                  onChange({ ...spec, quarters: { ...spec.quarters, [corner]: value } })
                }
              />
            </div>
          ))}
        </div>
      </Field>

      <Field label="Items" className="border-b-2 border-edge p-3">
        <p className="mb-2 text-[11px] leading-relaxed text-ink-faint">
          Across and up are shares of each axis, 0 at the low end to 100 at the high. Drag a dot
          on the sheet to place it by eye.
        </p>
        <div className="space-y-1.5">
          {spec.items.map((item, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <TextField
                value={item.label}
                title={`Item ${index + 1}`}
                onCommit={(label) => writeItem(index, { label })}
              />
              <NumberField
                value={item.x}
                width="w-[52px]"
                title="Across, 0 to 100"
                onCommit={(value) => writeItem(index, { x: clampShare(value) })}
              />
              <NumberField
                value={item.y}
                width="w-[52px]"
                title="Up, 0 to 100"
                onCommit={(value) => writeItem(index, { y: clampShare(value) })}
              />
              <IconButton
                label={`Remove ${item.label}`}
                danger
                onClick={() => onChange({ ...spec, items: spec.items.filter((_, at) => at !== index) })}
              >
                <Trash2 size={12} />
              </IconButton>
            </div>
          ))}
        </div>
        <SlabButton
          className="mt-2"
          onClick={() =>
            onChange({
              ...spec,
              items: [...spec.items, { label: `Item ${spec.items.length + 1}`, x: 50, y: 50 }],
            })
          }
        >
          <Plus size={12} />
          Add an item
        </SlabButton>
      </Field>

      <Field label="Drawing" className="border-b-2 border-edge p-3">
        <Choice options={QUADRANT_STYLES} value={options.style} onChange={(value) => set("style", value)} />
        <div className="mt-2.5 flex items-center gap-2">
          <ColourDot colour={options.color} title="The colour every item takes" onPick={(value) => set("color", value)} />
          <span className="font-mono text-[11px] text-ink-faint">Every item takes this colour.</span>
        </div>
        <div className="mt-2.5">
          <Slider label="Text" value={options.fontSize} min={9} max={22} step={1} onChange={(value) => set("fontSize", value)} />
        </div>
      </Field>

      <SizeField
        width={options.width}
        height={options.height}
        onChange={(size) => onChange({ ...spec, options: { ...options, ...size } })}
      />
    </div>
  );
}
