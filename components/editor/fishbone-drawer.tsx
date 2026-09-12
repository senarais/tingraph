"use client";

import { Plus, Trash2 } from "lucide-react";
import { PALETTES } from "@/lib/chart/spec";
import {
  FISHBONE_STYLES,
  type FishboneBone,
  type FishboneSpec,
} from "@/lib/fishbone/spec";
import { Field, Segmented, SlabButton, Tick } from "@/components/editor/ui";
import {
  Choice,
  ColourDot,
  IconButton,
  SizeField,
  Slider,
  TextField,
} from "@/components/editor/figure-fields";

/**
 * A fishbone's settings.
 *
 * The effect at the head, the bones that lead to it, and the causes on each
 * bone. A cause may carry the causes behind it, which is the whole method —
 * so those are here too, one level down, rather than hidden away.
 */

interface FishboneDrawerProps {
  spec: FishboneSpec;
  onChange: (spec: FishboneSpec) => void;
}

export default function FishboneDrawer({ spec, onChange }: FishboneDrawerProps) {
  const { options } = spec;
  const set = <K extends keyof FishboneSpec["options"]>(
    key: K,
    value: FishboneSpec["options"][K],
  ) => onChange({ ...spec, options: { ...options, [key]: value } });

  const writeBone = (index: number, patch: Partial<FishboneBone> | null) =>
    onChange({
      ...spec,
      bones:
        patch === null
          ? spec.bones.filter((_, at) => at !== index)
          : spec.bones.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)),
    });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Field label="The effect" className="border-b-2 border-edge p-3">
        <TextField
          value={spec.title}
          onCommit={(title) => onChange({ ...spec, title })}
          title="What the whole diagram is about"
        />
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          This is written in the head, and everything else is what leads to it.
        </p>
      </Field>

      <Field label="Bones" className="border-b-2 border-edge p-3">
        <div className="space-y-3">
          {spec.bones.map((bone, index) => (
            <div key={index} className="border-2 border-edge bg-white p-2">
              <div className="flex items-center gap-1.5">
                <ColourDot
                  colour={bone.color ?? options.color}
                  title={`Colour of ${bone.label}`}
                  onPick={(color) => writeBone(index, { color })}
                />
                <TextField
                  value={bone.label}
                  title={`Name of bone ${index + 1}`}
                  onCommit={(label) => writeBone(index, { label })}
                />
                <IconButton
                  label={`Remove ${bone.label}`}
                  danger
                  onClick={() => writeBone(index, null)}
                >
                  <Trash2 size={12} />
                </IconButton>
              </div>

              <div className="mt-2 space-y-1.5">
                {bone.causes.map((cause, at) => (
                  <div key={at}>
                    <div className="flex items-center gap-1.5">
                      <TextField
                        value={cause.label}
                        title={`Cause ${at + 1} on ${bone.label}`}
                        onCommit={(label) =>
                          writeBone(index, {
                            causes: bone.causes.map((entry, i) =>
                              i === at ? { ...entry, label } : entry,
                            ),
                          })
                        }
                      />
                      <IconButton
                        label="Add what is behind this cause"
                        onClick={() =>
                          writeBone(index, {
                            causes: bone.causes.map((entry, i) =>
                              i === at
                                ? { ...entry, causes: [...entry.causes, "Behind it"] }
                                : entry,
                            ),
                          })
                        }
                      >
                        <Plus size={12} />
                      </IconButton>
                      <IconButton
                        label={`Remove ${cause.label}`}
                        danger
                        onClick={() =>
                          writeBone(index, {
                            causes: bone.causes.filter((_, i) => i !== at),
                          })
                        }
                      >
                        <Trash2 size={12} />
                      </IconButton>
                    </div>
                    {cause.causes.map((deeper, deep) => (
                      <div key={deep} className="mt-1 flex items-center gap-1.5 pl-4">
                        <span className="font-mono text-[11px] text-ink-faint">·</span>
                        <TextField
                          value={deeper}
                          title="What is behind that cause"
                          onCommit={(value) =>
                            writeBone(index, {
                              causes: bone.causes.map((entry, i) =>
                                i === at
                                  ? {
                                      ...entry,
                                      causes: entry.causes.map((held, j) =>
                                        j === deep ? value : held,
                                      ),
                                    }
                                  : entry,
                              ),
                            })
                          }
                        />
                        <IconButton
                          label="Remove this one"
                          danger
                          onClick={() =>
                            writeBone(index, {
                              causes: bone.causes.map((entry, i) =>
                                i === at
                                  ? {
                                      ...entry,
                                      causes: entry.causes.filter((_, j) => j !== deep),
                                    }
                                  : entry,
                              ),
                            })
                          }
                        >
                          <Trash2 size={11} />
                        </IconButton>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <SlabButton
                className="mt-2"
                onClick={() =>
                  writeBone(index, {
                    causes: [...bone.causes, { label: "A cause", causes: [] }],
                  })
                }
              >
                <Plus size={12} />
                Add a cause
              </SlabButton>
            </div>
          ))}
        </div>
        <SlabButton
          className="mt-2"
          onClick={() =>
            onChange({
              ...spec,
              bones: [
                ...spec.bones,
                { label: `Bone ${spec.bones.length + 1}`, causes: [] },
              ],
            })
          }
        >
          <Plus size={12} />
          Add a bone
        </SlabButton>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Bones alternate above and below the spine in the order they are listed
          here, so the two halves fill evenly.
        </p>
      </Field>

      <Field label="The head" className="border-b-2 border-edge p-3">
        <Segmented
          size="sm"
          value={options.head}
          onChange={(value) => set("head", value)}
          options={[
            { value: "arrow", label: "Arrow" },
            { value: "box", label: "Box" },
            { value: "curve", label: "Fin" },
          ]}
        />
        <Tick className="mb-1.5 mt-3 block">Arrowheads on the causes</Tick>
        <Segmented
          size="sm"
          value={options.arrows ? "on" : "off"}
          onChange={(value) => set("arrows", value === "on")}
          options={[
            { value: "off", label: "Plain rules" },
            { value: "on", label: "Pointing in" },
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
              title="The one colour the bones take"
              onPick={(value) => set("color", value)}
            />
            <span className="font-mono text-[11px] text-ink-faint">
              Every bone takes this colour.
            </span>
          </div>
        )}
      </Field>

      <Field label="Drawing" className="border-b-2 border-edge p-3">
        <Choice
          options={FISHBONE_STYLES}
          value={options.style}
          onChange={(value) => set("style", value)}
        />
        <div className="mt-2.5 space-y-2">
          <Slider
            label="Angle"
            value={options.angle}
            min={30}
            max={80}
            step={5}
            onChange={(value) => set("angle", value)}
            format={(value) => `${value}°`}
          />
          <Slider
            label="Text"
            value={options.fontSize}
            min={9}
            max={20}
            step={1}
            onChange={(value) => set("fontSize", value)}
          />
        </div>
      </Field>

      <SizeField
        width={options.width}
        height={options.height}
        onChange={(size) => onChange({ ...spec, options: { ...options, ...size } })}
        note="A wider sheet gives the bones more room before their causes crowd."
      />
    </div>
  );
}
