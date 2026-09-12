"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { PALETTES } from "@/lib/chart/spec";
import { fitSequence } from "@/lib/sequence/layout-sequence";
import {
  FRAGMENT_KINDS,
  MESSAGE_KINDS,
  SEQUENCE_HEADS,
  SEQUENCE_STYLES,
  freshParticipantId,
  freshStepId,
  insertAfter,
  moveStep,
  rewriteSteps,
  walkSequence,
  withoutParticipant,
  type FragmentKind,
  type MessageKind,
  type SequenceHead,
  type SequenceSpec,
  type SequenceStep,
} from "@/lib/sequence/spec";
import { Field, SlabButton, Tick } from "@/components/editor/ui";
import {
  Choice,
  ColourDot,
  IconButton,
  Picker,
  SizeField,
  Slider,
  TextField,
} from "@/components/editor/figure-fields";

/**
 * A sequence diagram's settings.
 *
 * Two lists, because a sequence diagram is two lists: who is taking part, and
 * what they say to each other in order. Everything else on the panel is a
 * setting that has a word in the language, and every word in the language is
 * on the panel — a message's kind, the numbering, the execution bars, how far
 * apart the lifelines stand.
 */

interface SequenceDrawerProps {
  spec: SequenceSpec;
  onChange: (spec: SequenceSpec) => void;
}

export default function SequenceDrawer({ spec, onChange }: SequenceDrawerProps) {
  const { options } = spec;
  const set = <K extends keyof SequenceSpec["options"]>(
    key: K,
    value: SequenceSpec["options"][K],
  ) => onChange({ ...spec, options: { ...options, [key]: value } });

  /** A change to what is on the diagram, which also changes how big it is. */
  const build = (next: SequenceSpec) => onChange(fitSequence(next));

  const who = spec.participants.map((entry) => ({
    value: entry.id,
    label: entry.label || entry.id,
  }));
  const rows = walkSequence(spec.steps);

  const addParticipant = () => {
    const id = freshParticipantId(spec);
    build({
      ...spec,
      participants: [
        ...spec.participants,
        { id, label: `Participant ${spec.participants.length + 1}`, kind: "object" },
      ],
    });
  };

  const dropParticipant = (id: string) =>
    build({
      ...spec,
      participants: spec.participants.filter((entry) => entry.id !== id),
      steps: withoutParticipant(spec.steps, id),
    });

  const moveParticipant = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= spec.participants.length) {
      return;
    }
    const next = [...spec.participants];
    [next[index], next[to]] = [next[to], next[index]];
    build({ ...spec, participants: next });
  };

  const writeParticipant = (
    index: number,
    patch: Partial<SequenceSpec["participants"][number]>,
  ) =>
    onChange({
      ...spec,
      participants: spec.participants.map((entry, at) =>
        at === index ? { ...entry, ...patch } : entry,
      ),
    });

  const addAfter = (id: string | null, step: SequenceStep) =>
    build({ ...spec, steps: insertAfter(spec.steps, id, step) });

  const freshMessage = (): SequenceStep => ({
    type: "message",
    id: freshStepId(spec.steps),
    from: spec.participants[0]?.id ?? "",
    to: spec.participants[1]?.id ?? spec.participants[0]?.id ?? "",
    label: "message()",
    kind: "sync",
  });

  const freshFragment = (): SequenceStep => ({
    type: "fragment",
    id: freshStepId(spec.steps),
    kind: "alt",
    sections: [{ guard: "condition", steps: [] }],
  });

  const writeStep = (id: string, change: (found: SequenceStep) => SequenceStep | null) =>
    onChange({ ...spec, steps: rewriteSteps(spec.steps, id, change) });

  const dropStep = (id: string) =>
    build({ ...spec, steps: rewriteSteps(spec.steps, id, () => null) });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Field label="Title" className="border-b-2 border-edge p-3">
        <TextField
          value={spec.title}
          onCommit={(title) => onChange({ ...spec, title })}
          title="What the diagram is called"
        />
      </Field>

      <Field label="Participants" className="border-b-2 border-edge p-3">
        <div className="space-y-1.5">
          {spec.participants.map((entry, index) => (
            <div key={entry.id} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <ColourDot
                  colour={entry.color ?? options.color}
                  title={`Colour of ${entry.label}`}
                  onPick={(color) => writeParticipant(index, { color })}
                />
                <TextField
                  value={entry.label}
                  title={`The name of ${entry.id}`}
                  onCommit={(label) => writeParticipant(index, { label })}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Picker
                  value={entry.kind}
                  className="flex-1"
                  title="What it is drawn as"
                  options={SEQUENCE_HEADS.map((head) => ({
                    value: head.id as SequenceHead,
                    label: head.name,
                  }))}
                  onChange={(kind) => writeParticipant(index, { kind })}
                />
                <IconButton
                  label="Move it left"
                  onClick={() => moveParticipant(index, -1)}
                >
                  <ArrowUp size={13} />
                </IconButton>
                <IconButton
                  label="Move it right"
                  onClick={() => moveParticipant(index, 1)}
                >
                  <ArrowDown size={13} />
                </IconButton>
                <IconButton
                  label="Take it off"
                  danger
                  onClick={() => dropParticipant(entry.id)}
                >
                  <Trash2 size={13} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
        <SlabButton className="mt-2 w-full" onClick={addParticipant}>
          <Plus size={13} />
          Add a participant
        </SlabButton>
      </Field>

      <Field label="Messages" className="border-b-2 border-edge p-3">
        <div className="space-y-2">
          {rows.map((row) => {
            const step = row.step;
            const pad = { paddingLeft: row.depth * 10 };
            if (step.type === "fragment") {
              return (
                <div key={step.id} className="space-y-1" style={pad}>
                  <div className="flex items-center gap-1.5">
                    <Picker
                      value={step.kind}
                      className="flex-1"
                      title="Which operator"
                      options={FRAGMENT_KINDS.map((kind) => ({
                        value: kind.id as FragmentKind,
                        label: kind.name,
                      }))}
                      onChange={(kind) =>
                        writeStep(step.id, (found) => ({ ...found, kind }) as SequenceStep)
                      }
                    />
                    <IconButton
                      label="Add a section"
                      onClick={() =>
                        writeStep(step.id, (found) =>
                          found.type === "fragment"
                            ? {
                                ...found,
                                sections: [...found.sections, { guard: "otherwise", steps: [] }],
                              }
                            : found,
                        )
                      }
                    >
                      <Plus size={13} />
                    </IconButton>
                    <IconButton
                      label="Put a message in it"
                      onClick={() =>
                        writeStep(step.id, (found) =>
                          found.type === "fragment"
                            ? {
                                ...found,
                                sections: found.sections.map((section, at) =>
                                  at === 0
                                    ? { ...section, steps: [...section.steps, freshMessage()] }
                                    : section,
                                ),
                              }
                            : found,
                        )
                      }
                    >
                      <ArrowDown size={13} />
                    </IconButton>
                    <IconButton label="Take it off" danger onClick={() => dropStep(step.id)}>
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                  {step.sections.map((section, at) => (
                    <div key={at} className="flex items-center gap-1.5">
                      <Tick className="w-9 shrink-0">{at === 0 ? "if" : "else"}</Tick>
                      <TextField
                        value={section.guard}
                        title="The condition this section runs under"
                        onCommit={(guard) =>
                          writeStep(step.id, (found) =>
                            found.type === "fragment"
                              ? {
                                  ...found,
                                  sections: found.sections.map((entry, index) =>
                                    index === at ? { ...entry, guard } : entry,
                                  ),
                                }
                              : found,
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              );
            }
            return (
              <div key={step.id} className="space-y-1" style={pad}>
                <div className="flex items-center gap-1.5">
                  <Picker
                    value={step.from}
                    className="flex-1"
                    title="Who sends it"
                    options={who}
                    onChange={(from) =>
                      writeStep(step.id, (found) => ({ ...found, from }) as SequenceStep)
                    }
                  />
                  <Picker
                    value={step.kind}
                    className="w-[76px]"
                    title="What kind of message"
                    options={MESSAGE_KINDS.map((kind) => ({
                      value: kind.id as MessageKind,
                      label: kind.name,
                    }))}
                    onChange={(kind) =>
                      writeStep(step.id, (found) => ({ ...found, kind }) as SequenceStep)
                    }
                  />
                  <Picker
                    value={step.to}
                    className="flex-1"
                    title="Who receives it"
                    options={who}
                    onChange={(to) =>
                      writeStep(step.id, (found) => ({ ...found, to }) as SequenceStep)
                    }
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <TextField
                    value={step.label}
                    title="What the message says"
                    onCommit={(label) =>
                      writeStep(step.id, (found) => ({ ...found, label }) as SequenceStep)
                    }
                  />
                  <IconButton
                    label="Move it earlier"
                    onClick={() => onChange({ ...spec, steps: moveStep(spec.steps, step.id, -1) })}
                  >
                    <ArrowUp size={13} />
                  </IconButton>
                  <IconButton
                    label="Move it later"
                    onClick={() => onChange({ ...spec, steps: moveStep(spec.steps, step.id, 1) })}
                  >
                    <ArrowDown size={13} />
                  </IconButton>
                  <IconButton
                    label="Add one after it"
                    onClick={() => addAfter(step.id, freshMessage())}
                  >
                    <Plus size={13} />
                  </IconButton>
                  <IconButton label="Take it off" danger onClick={() => dropStep(step.id)}>
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-1.5">
          <SlabButton className="flex-1" onClick={() => addAfter(null, freshMessage())}>
            <Plus size={13} />
            Message
          </SlabButton>
          <SlabButton className="flex-1" onClick={() => addAfter(null, freshFragment())}>
            <Plus size={13} />
            Fragment
          </SlabButton>
        </div>
      </Field>

      <Field label="Reading" className="border-b-2 border-edge p-3">
        <div className="space-y-1.5">
          <Choice
            options={[
              { id: "on", name: "Numbered", hint: "1:, 2:, 3: down the diagram" },
              { id: "off", name: "Unnumbered", hint: "just what is said" },
            ]}
            value={options.numbers ? "on" : "off"}
            onChange={(value) => set("numbers", value === "on")}
          />
          <Choice
            options={[
              { id: "on", name: "Execution bars", hint: "when each lifeline is running" },
              { id: "off", name: "Bare lifelines", hint: "no bars at all" },
            ]}
            value={options.activations ? "on" : "off"}
            onChange={(value) => set("activations", value === "on")}
          />
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
          The bars are read off the messages: a call opens one, its reply closes
          it, and a call to itself opens another a level deeper.
        </p>
      </Field>

      <Field label="Spacing" className="border-b-2 border-edge p-3">
        <div className="space-y-2">
          <Slider
            label="Apart"
            value={options.spacing}
            min={100}
            max={320}
            step={10}
            onChange={(value) => build({ ...spec, options: { ...options, spacing: value } })}
          />
          <Slider
            label="Step"
            value={options.step}
            min={30}
            max={110}
            step={2}
            onChange={(value) => build({ ...spec, options: { ...options, step: value } })}
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
              title="The one colour the participants take"
              onPick={(value) => set("color", value)}
            />
            <span className="font-mono text-[11px] text-ink-faint">
              Every participant takes this colour.
            </span>
          </div>
        )}
      </Field>

      <Field label="Drawing" className="border-b-2 border-edge p-3">
        <Choice
          options={SEQUENCE_STYLES}
          value={options.style}
          onChange={(value) => set("style", value)}
        />
        <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
          Formal is black on white, which is what a paper wants. Tinted washes
          each participant&apos;s own colour into its box and its bars.
        </p>
      </Field>

      <SizeField
        width={options.width}
        height={options.height}
        onChange={(size) => onChange({ ...spec, options: { ...options, ...size } })}
        note="Lifelines spread to fill the width, and the messages spread to fill the height; adding either grows it again."
      />
    </div>
  );
}
