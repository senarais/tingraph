"use client";

import { Plus, Trash2 } from "lucide-react";
import { PALETTES } from "@/lib/chart/spec";
import {
  MATRIX_STYLES,
  QUADRANT_NAMES,
  type MatrixAxis,
  type MatrixSpec,
} from "@/lib/matrix/spec";
import { Field, Segmented, SlabButton, Tick } from "@/components/editor/ui";
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
 * A 2×2 matrix's settings.
 *
 * A matrix is mostly writing: two axes with a name and two ends each, and four
 * quadrants with a name and a note. All of it is here, and the things that
 * belong under the pointer — moving an item about the field — are on the sheet.
 */

interface MatrixDrawerProps {
  spec: MatrixSpec;
  onChange: (spec: MatrixSpec) => void;
}

function AxisFields({
  axis,
  lowLabel,
  highLabel,
  onChange,
}: {
  axis: MatrixAxis;
  lowLabel: string;
  highLabel: string;
  onChange: (axis: MatrixAxis) => void;
}) {
  return (
    <div className="space-y-1.5">
      <TextField
        value={axis.label}
        placeholder="what the axis is called"
        title="What the axis is called"
        onCommit={(label) => onChange({ ...axis, label })}
      />
      <div className="flex items-center gap-1.5">
        <span className="w-[46px] shrink-0 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-faint">
          {lowLabel}
        </span>
        <TextField
          value={axis.low}
          title={`The ${lowLabel} end`}
          onCommit={(low) => onChange({ ...axis, low })}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-[46px] shrink-0 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-faint">
          {highLabel}
        </span>
        <TextField
          value={axis.high}
          title={`The ${highLabel} end`}
          onCommit={(high) => onChange({ ...axis, high })}
        />
      </div>
    </div>
  );
}

export default function MatrixDrawer({ spec, onChange }: MatrixDrawerProps) {
  const { options } = spec;
  const set = <K extends keyof MatrixSpec["options"]>(
    key: K,
    value: MatrixSpec["options"][K],
  ) => onChange({ ...spec, options: { ...options, [key]: value } });

  const writeQuadrant = (index: number, patch: Partial<MatrixSpec["quadrants"][number]>) =>
    onChange({
      ...spec,
      quadrants: spec.quadrants.map((entry, at) =>
        at === index ? { ...entry, ...patch } : entry,
      ) as MatrixSpec["quadrants"],
    });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Field label="Title" className="border-b-2 border-edge p-3">
        <TextField
          value={spec.title}
          onCommit={(title) => onChange({ ...spec, title })}
          title="What the matrix is called"
        />
      </Field>

      <Field label="Across" className="border-b-2 border-edge p-3">
        <AxisFields
          axis={spec.x}
          lowLabel="Left"
          highLabel="Right"
          onChange={(x) => onChange({ ...spec, x })}
        />
      </Field>

      <Field label="Up" className="border-b-2 border-edge p-3">
        <AxisFields
          axis={spec.y}
          lowLabel="Bottom"
          highLabel="Top"
          onChange={(y) => onChange({ ...spec, y })}
        />
      </Field>

      <Field label="Quadrants" className="border-b-2 border-edge p-3">
        <div className="space-y-2.5">
          {spec.quadrants.map((quadrant, index) => (
            <div key={index}>
              <Tick className="mb-1 block">{QUADRANT_NAMES[index]}</Tick>
              <div className="flex items-center gap-1.5">
                <ColourDot
                  colour={quadrant.color ?? options.color}
                  title={`Colour of the ${QUADRANT_NAMES[index].toLowerCase()} quadrant`}
                  onPick={(color) => writeQuadrant(index, { color })}
                />
                <TextField
                  value={quadrant.label}
                  title={`Name of the ${QUADRANT_NAMES[index].toLowerCase()} quadrant`}
                  onCommit={(label) => writeQuadrant(index, { label })}
                />
              </div>
              <div className="mt-1">
                <TextField
                  value={quadrant.note}
                  placeholder="a second line, if it needs one"
                  title="What this quadrant means"
                  onCommit={(note) => writeQuadrant(index, { note })}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2.5">
          <Segmented
            size="sm"
            value={options.labels}
            onChange={(value) => set("labels", value)}
            options={[
              { value: "inside", label: "Names inside" },
              { value: "corner", label: "Names outside" },
            ]}
          />
        </div>
      </Field>

      <Field label="Items in the field" className="border-b-2 border-edge p-3">
        {spec.items.length === 0 && (
          <p className="mb-2 text-[11px] leading-relaxed text-ink-faint">
            Nothing placed yet. An item is a card dropped into the field, and it
            is dragged where it belongs on the sheet.
          </p>
        )}
        <div className="space-y-1.5">
          {spec.items.map((item, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <TextField
                value={item.label}
                title={`Name of item ${index + 1}`}
                onCommit={(label) =>
                  onChange({
                    ...spec,
                    items: spec.items.map((entry, at) =>
                      at === index ? { ...entry, label } : entry,
                    ),
                  })
                }
              />
              <NumberField
                value={Math.round(item.x * 100)}
                width="w-[54px]"
                title="How far across, as a percentage"
                onCommit={(value) =>
                  onChange({
                    ...spec,
                    items: spec.items.map((entry, at) =>
                      at === index ? { ...entry, x: Math.min(1, Math.max(0, value / 100)) } : entry,
                    ),
                  })
                }
              />
              <NumberField
                value={Math.round(item.y * 100)}
                width="w-[54px]"
                title="How far up, as a percentage"
                onCommit={(value) =>
                  onChange({
                    ...spec,
                    items: spec.items.map((entry, at) =>
                      at === index ? { ...entry, y: Math.min(1, Math.max(0, value / 100)) } : entry,
                    ),
                  })
                }
              />
              <IconButton
                label={`Remove ${item.label}`}
                danger
                onClick={() =>
                  onChange({
                    ...spec,
                    items: spec.items.filter((_, at) => at !== index),
                  })
                }
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
              items: [
                ...spec.items,
                { label: `Item ${spec.items.length + 1}`, x: 0.5, y: 0.5 },
              ],
            })
          }
        >
          <Plus size={12} />
          Add an item
        </SlabButton>
      </Field>

      <Field label="Axes" className="border-b-2 border-edge p-3">
        <Segmented
          size="sm"
          value={options.axis}
          onChange={(value) => set("axis", value)}
          options={[
            { value: "cross", label: "Cross" },
            { value: "arrows", label: "Arrows" },
            { value: "tabs", label: "Tabs" },
            { value: "none", label: "None" },
          ]}
        />
      </Field>

      <Field label="Colour" className="border-b-2 border-edge p-3">
        <Choice
          options={PALETTES}
          value={options.palette}
          onChange={(value) => set("palette", value)}
        />
        {options.palette === "single" && (
          <div className="mt-2 flex items-center gap-2">
            <ColourDot
              colour={options.color}
              title="The one colour the quadrants take"
              onPick={(value) => set("color", value)}
            />
            <span className="font-mono text-[11px] text-ink-faint">
              Every quadrant takes this colour.
            </span>
          </div>
        )}
      </Field>

      <Field label="Drawing" className="border-b-2 border-edge p-3">
        <Choice
          options={MATRIX_STYLES}
          value={options.style}
          onChange={(value) => set("style", value)}
        />
        <div className="mt-2.5">
          <Slider
            label="Text"
            value={options.fontSize}
            min={9}
            max={22}
            step={1}
            onChange={(value) => set("fontSize", value)}
          />
        </div>
      </Field>

      <SizeField
        width={options.width}
        height={options.height}
        onChange={(size) => onChange({ ...spec, options: { ...options, ...size } })}
        note="A square sheet keeps the four quadrants square, which is how a matrix is read."
      />
    </div>
  );
}
