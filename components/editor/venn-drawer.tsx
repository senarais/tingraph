"use client";

import { PALETTES } from "@/lib/chart/spec";
import { VENN_STYLES, vennRegions, type VennSpec } from "@/lib/venn/spec";
import { Field, Segmented, Tick } from "@/components/editor/ui";
import {
  Choice,
  ColourDot,
  SizeField,
  Slider,
  TextField,
} from "@/components/editor/figure-fields";

/**
 * A Venn diagram's settings.
 *
 * The sets, and what is in each of the regions they make between them. The
 * regions are listed the way the language names them, so the panel and the
 * source read the same: `A` is what is only in A, `AB` what is in both, `ABC`
 * what is in all three.
 */

interface VennDrawerProps {
  spec: VennSpec;
  onChange: (spec: VennSpec) => void;
}

/** `AB` read back as the names of the sets it means. */
function regionName(key: string, spec: VennSpec): string {
  const names = key
    .split("")
    .map((letter) => spec.sets["ABC".indexOf(letter)]?.label ?? letter);
  if (names.length === 1) {
    return `${names[0]} only`;
  }
  if (names.length === spec.sets.length) {
    return "All of them";
  }
  return `${names.join(" and ")} only`;
}

export default function VennDrawer({ spec, onChange }: VennDrawerProps) {
  const { options } = spec;
  const set = <K extends keyof VennSpec["options"]>(
    key: K,
    value: VennSpec["options"][K],
  ) => onChange({ ...spec, options: { ...options, [key]: value } });

  const writeSet = (index: number, patch: Partial<VennSpec["sets"][number]>) =>
    onChange({
      ...spec,
      sets: spec.sets.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)),
    });
  const writeRegion = (key: string, value: string) =>
    onChange({ ...spec, regions: { ...spec.regions, [key]: value } });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Field label="Title" className="border-b-2 border-edge p-3">
        <TextField
          value={spec.title}
          onCommit={(title) => onChange({ ...spec, title })}
          title="What the diagram is called"
        />
      </Field>

      <Field label="Sets" className="border-b-2 border-edge p-3">
        <Segmented
          size="sm"
          value={spec.sets.length >= 3 ? "three" : "two"}
          onChange={(value) =>
            onChange({
              ...spec,
              sets:
                value === "three"
                  ? [...spec.sets, { label: "Set C" }].slice(0, 3)
                  : spec.sets.slice(0, 2),
            })
          }
          options={[
            { value: "two", label: "Two rings" },
            { value: "three", label: "Three rings" },
          ]}
        />
        <div className="mt-2.5 space-y-1.5">
          {spec.sets.map((entry, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <ColourDot
                colour={entry.color ?? options.color}
                title={`Colour of ${entry.label}`}
                onPick={(color) => writeSet(index, { color })}
              />
              <TextField
                value={entry.label}
                title={`Name of set ${"ABC".charAt(index)}`}
                onCommit={(label) => writeSet(index, { label })}
              />
            </div>
          ))}
        </div>
      </Field>

      <Field label="Regions" className="border-b-2 border-edge p-3">
        <div className="space-y-1.5">
          {vennRegions(spec.sets.length).map((key) => (
            <div key={key}>
              <Tick className="mb-0.5 block">{regionName(key, spec)}</Tick>
              <div className="flex items-center gap-1.5">
                <code className="w-8 shrink-0 border-2 border-edge bg-bone px-1 py-0.5 text-center font-mono text-[10.5px] text-ink">
                  {key}
                </code>
                <TextField
                  value={spec.regions[key] ?? ""}
                  placeholder="a count, or what is in there"
                  title={regionName(key, spec)}
                  onCommit={(value) => writeRegion(key, value)}
                />
              </div>
            </div>
          ))}
          <div>
            <Tick className="mb-0.5 block">In none of them</Tick>
            <div className="flex items-center gap-1.5">
              <code className="w-8 shrink-0 border-2 border-edge bg-bone px-1 py-0.5 text-center font-mono text-[10.5px] text-ink">
                out
              </code>
              <TextField
                value={spec.regions.out ?? ""}
                placeholder="written in the corner"
                title="What belongs to none of the sets"
                onCommit={(value) => writeRegion("out", value)}
              />
            </div>
          </div>
        </div>
        <div className="mt-2.5">
          <Segmented
            size="sm"
            value={options.zeros ? "on" : "off"}
            onChange={(value) => set("zeros", value === "on")}
            options={[
              { value: "off", label: "Leave empty regions blank" },
              { value: "on", label: "Write a nought" },
            ]}
          />
        </div>
      </Field>

      <Field label="Rings" className="border-b-2 border-edge p-3">
        <div className="space-y-2">
          <Slider
            label="Overlap"
            value={options.overlap}
            min={0.1}
            max={0.85}
            step={0.05}
            onChange={(value) => set("overlap", value)}
            format={(value) => `${Math.round(value * 100)}%`}
          />
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
              title="The one colour the rings take"
              onPick={(value) => set("color", value)}
            />
            <span className="font-mono text-[11px] text-ink-faint">
              Every ring takes this colour.
            </span>
          </div>
        )}
      </Field>

      <Field label="Drawing" className="border-b-2 border-edge p-3">
        <Choice
          options={VENN_STYLES}
          value={options.style}
          onChange={(value) => set("style", value)}
        />
        <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
          Tinted lays the fills on washed, so where two rings cross the colour
          deepens on its own — no region has to be cut out to be shaded.
        </p>
      </Field>

      <SizeField
        width={options.width}
        height={options.height}
        onChange={(size) => onChange({ ...spec, options: { ...options, ...size } })}
        note="The rings are cut from whichever side is shorter, so a square sheet draws them largest."
      />
    </div>
  );
}
