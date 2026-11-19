"use client";

import { Plus, Trash2 } from "lucide-react";
import { withFit } from "@/lib/timeline/build-timeline";
import { scaleOf, timeOf, type TimelineSpec } from "@/lib/timeline/spec";
import { Field, SlabButton, Tick } from "@/components/editor/ui";
import { Choice, ColourDot, IconButton, SizeField, Slider, TextField } from "@/components/editor/figure-fields";

/**
 * A timeline's settings: its events, which way the rule runs, whether it is
 * drawn to scale, and how it looks. Every field here has a word in the source
 * and the other way round.
 */

const ORIENTATIONS = [
  { id: "horizontal" as const, name: "Across", hint: "the rule runs left to right" },
  { id: "vertical" as const, name: "Down", hint: "the rule runs down the page" },
];

const SCALES = [
  { id: "time" as const, name: "To scale", hint: "gaps between events are the time between them" },
  { id: "even" as const, name: "In sequence", hint: "every event takes the same room" },
];

/** The size a timeline starts from when it is turned, before it grows to fit. */
const TURNED = {
  horizontal: { width: 820, height: 240 },
  vertical: { width: 420, height: 360 },
};

interface TimelineDrawerProps {
  spec: TimelineSpec;
  onChange: (spec: TimelineSpec) => void;
}

export default function TimelineDrawer({ spec, onChange }: TimelineDrawerProps) {
  const { options } = spec;
  // what an event says decides how much room it takes, so every edit to one
  // grows the figure to fit; it is never shrunk under the reader's own size
  const write = (next: TimelineSpec) => onChange(withFit(next));
  const set = <K extends keyof TimelineSpec["options"]>(key: K, value: TimelineSpec["options"][K]) =>
    write({ ...spec, options: { ...options, [key]: value } });
  const writeEvent = (index: number, patch: Partial<TimelineSpec["events"][number]>) =>
    write({ ...spec, events: spec.events.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)) });
  const wantsScale = options.scale === "time" && scaleOf(spec) === "even";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Field label="Title" className="border-b-2 border-edge p-3">
        <TextField value={spec.title} onCommit={(title) => onChange({ ...spec, title })} title="What the timeline is called" />
      </Field>

      <Field label="Events" className="border-b-2 border-edge p-3">
        <p className="mb-2 text-[11px] leading-relaxed text-ink-faint">
          A time written as a number, such as a year, can be drawn to scale. Drag a dot on the sheet to move it in time.
        </p>
        <div className="space-y-2.5">
          {spec.events.map((event, index) => (
            <div key={index} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <div className="w-[76px] shrink-0">
                  <TextField
                    value={event.when}
                    placeholder="when"
                    title={`When event ${index + 1} happened`}
                    onCommit={(when) => writeEvent(index, { when: when.trim(), at: timeOf(when) })}
                  />
                </div>
                <TextField
                  value={event.label}
                  placeholder="what happened"
                  title={`Event ${index + 1}`}
                  onCommit={(label) => writeEvent(index, { label })}
                />
                <IconButton
                  label={`Remove ${event.label}`}
                  danger
                  onClick={() => {
                    if (spec.events.length > 1) write({ ...spec, events: spec.events.filter((_, at) => at !== index) });
                  }}
                >
                  <Trash2 size={12} />
                </IconButton>
              </div>
              <div className="pl-[82px] pr-8">
                <TextField
                  value={event.note}
                  placeholder="a note under it (optional)"
                  title={`A note under event ${index + 1}`}
                  onCommit={(note) => writeEvent(index, { note })}
                />
              </div>
            </div>
          ))}
        </div>
        <SlabButton
          className="mt-2"
          onClick={() => {
            const last = spec.events[spec.events.length - 1];
            const at = last?.at !== null && last?.at !== undefined ? last.at + 1 : null;
            write({
              ...spec,
              events: [
                ...spec.events,
                { when: at === null ? `Step ${spec.events.length + 1}` : String(at), at, label: "New event", note: "" },
              ],
            });
          }}
        >
          <Plus size={12} />
          Add an event
        </SlabButton>
      </Field>

      <Field label="Rule" className="border-b-2 border-edge p-3">
        <Tick className="mb-1 block">Runs</Tick>
        <Choice
          options={ORIENTATIONS}
          value={options.orientation}
          onChange={(orientation) =>
            write({ ...spec, options: { ...options, orientation, ...TURNED[orientation] } })
          }
        />
        <Tick className="mb-1 mt-2.5 block">Spacing</Tick>
        <Choice options={SCALES} value={options.scale} onChange={(value) => set("scale", value)} />
        {wantsScale && (
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            Drawn in sequence: to scale needs every time written as a number, and two different ones at least.
          </p>
        )}
      </Field>

      <Field label="Drawing" className="border-b-2 border-edge p-3">
        <div className="flex items-center gap-2">
          <ColourDot colour={options.color} title="The colour of the dots and the times" onPick={(value) => set("color", value)} />
          <span className="font-mono text-[11px] text-ink-faint">The dots and the times take this colour.</span>
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
