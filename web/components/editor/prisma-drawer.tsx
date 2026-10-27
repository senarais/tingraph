"use client";

import { PanelRight, Plus, Trash2 } from "lucide-react";
import {
  PRISMA_STYLES,
  type PrismaBox,
  type PrismaLine,
  type PrismaSpec,
  type PrismaStep,
} from "@/lib/prisma/spec";
import { grownPrisma } from "@/lib/prisma/build-prisma";
import { Field, Segmented, SlabButton, Tick } from "@/components/editor/ui";
import {
  Choice,
  IconButton,
  SizeField,
  Slider,
  TextField,
} from "@/components/editor/figure-fields";

/**
 * A PRISMA flow's settings.
 *
 * The rows in the order the review moved through them, each with the phase it
 * stands in, its total, the lines under it and the box beside it for what left
 * the flow there. Counts are text fields on purpose: a review may write a
 * number, a range, or nothing at all.
 */

interface PrismaDrawerProps {
  spec: PrismaSpec;
  onChange: (spec: PrismaSpec) => void;
}

function newLine(): PrismaLine {
  return { label: "New line", count: "" };
}

export default function PrismaDrawer({
  spec,
  onChange: notify,
}: PrismaDrawerProps) {
  // every edit is passed through the notation's own fit, so a row that wraps
  // or a face that grows makes the sheet taller instead of drawing past it
  const onChange = (next: PrismaSpec) => notify(grownPrisma(next));
  const { options } = spec;
  const set = <K extends keyof PrismaSpec["options"]>(
    key: K,
    value: PrismaSpec["options"][K],
  ) => onChange({ ...spec, options: { ...options, [key]: value } });

  const writeStep = (index: number, patch: Partial<PrismaStep>) =>
    onChange({
      ...spec,
      steps: spec.steps.map((step, at) => (at === index ? { ...step, ...patch } : step)),
    });

  const writeSide = (index: number, patch: Partial<PrismaBox>) => {
    const side = spec.steps[index]?.side;
    if (!side) {
      return;
    }
    writeStep(index, { side: { ...side, ...patch } });
  };

  const writeItem = (
    index: number,
    side: boolean,
    at: number,
    patch: Partial<PrismaLine>,
  ) => {
    const holder = side ? spec.steps[index]?.side : spec.steps[index];
    if (!holder) {
      return;
    }
    const items = holder.items.map((line, i) =>
      i === at ? { ...line, ...patch } : line,
    );
    if (side) {
      writeSide(index, { items });
    } else {
      writeStep(index, { items });
    }
  };

  const addItem = (index: number, side: boolean) => {
    const holder = side ? spec.steps[index]?.side : spec.steps[index];
    if (!holder) {
      return;
    }
    const items = [...holder.items, newLine()];
    if (side) {
      writeSide(index, { items });
    } else {
      writeStep(index, { items });
    }
  };

  const dropItem = (index: number, side: boolean, at: number) => {
    const holder = side ? spec.steps[index]?.side : spec.steps[index];
    if (!holder) {
      return;
    }
    const items = holder.items.filter((_, i) => i !== at);
    if (side) {
      writeSide(index, { items });
    } else {
      writeStep(index, { items });
    }
  };

  const dropStep = (index: number) => {
    if (spec.steps.length <= 1) {
      return;
    }
    onChange({ ...spec, steps: spec.steps.filter((_, at) => at !== index) });
  };

  const addSide = (index: number) =>
    writeStep(index, {
      side: { title: "Records excluded", count: "", items: [] },
    });

  const dropSide = (index: number) => {
    const step = spec.steps[index];
    if (!step?.side) {
      return;
    }
    const plain: PrismaStep = {
      band: step.band,
      title: step.title,
      count: step.count,
      items: step.items,
    };
    writeStep(index, plain);
  };

  const addStep = () =>
    onChange({
      ...spec,
      steps: [
        ...spec.steps,
        {
          band: spec.steps[spec.steps.length - 1]?.band ?? "",
          title: "New row",
          count: "",
          items: [],
        },
      ],
    });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Field label="Title" className="border-b-2 border-edge p-3">
        <TextField
          value={spec.title}
          onCommit={(title) => onChange({ ...spec, title })}
          title="What this flow is called"
        />
      </Field>

      <Field label="The flow" className="border-b-2 border-edge p-3">
        <div className="space-y-3">
          {spec.steps.map((step, index) => (
            <div key={index} className="border-2 border-edge bg-white p-2">
              <div className="flex items-center gap-1.5">
                <TextField
                  value={step.band}
                  placeholder="phase band"
                  title={`The phase row ${index + 1} stands in`}
                  onCommit={(band) => writeStep(index, { band })}
                />
                {spec.steps.length > 1 && (
                  <IconButton
                    label={`Remove row ${index + 1}`}
                    danger
                    onClick={() => dropStep(index)}
                  >
                    <Trash2 size={12} />
                  </IconButton>
                )}
              </div>

              <div className="mt-1.5">
                <TextField
                  value={step.title}
                  title={`Caption of row ${index + 1}`}
                  onCommit={(title) => writeStep(index, { title })}
                />
              </div>

              <div className="mt-1.5 flex items-center gap-1.5">
                <div className="w-20 shrink-0">
                  <TextField
                    value={step.count}
                    placeholder="total"
                    title={`Total of row ${index + 1}`}
                    onCommit={(count) => writeStep(index, { count })}
                  />
                </div>
                <span className="font-mono text-[10.5px] text-ink-faint">
                  drawn as (n = …)
                </span>
              </div>

              <div className="mt-2 space-y-1.5">
                {step.items.map((line, at) => (
                  <div key={at} className="flex items-center gap-1.5">
                    <TextField
                      value={line.label}
                      title={`Line ${at + 1} under row ${index + 1}`}
                      onCommit={(label) => writeItem(index, false, at, { label })}
                    />
                    <div className="w-20 shrink-0">
                      <TextField
                        value={line.count}
                        placeholder="count"
                        title={`Count of line ${at + 1}`}
                        onCommit={(count) => writeItem(index, false, at, { count })}
                      />
                    </div>
                    <IconButton
                      label={`Remove line ${at + 1}`}
                      danger
                      onClick={() => dropItem(index, false, at)}
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  </div>
                ))}
              </div>

              <SlabButton className="mt-2" onClick={() => addItem(index, false)}>
                <Plus size={12} />
                Add a line
              </SlabButton>

              {step.side ? (
                <div className="mt-2.5 border-2 border-dashed border-edge p-1.5">
                  <div className="flex items-center gap-1.5">
                    <TextField
                      value={step.side.title}
                      title={`The box beside row ${index + 1}`}
                      onCommit={(title) => writeSide(index, { title })}
                    />
                    <IconButton
                      label="Remove this side box"
                      danger
                      onClick={() => dropSide(index)}
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  </div>

                  <div className="mt-1.5 flex items-center gap-1.5">
                    <div className="w-20 shrink-0">
                      <TextField
                        value={step.side.count}
                        placeholder="total"
                        title="The side box's total"
                        onCommit={(count) => writeSide(index, { count })}
                      />
                    </div>
                    <span className="font-mono text-[10.5px] text-ink-faint">
                      what left the flow
                    </span>
                  </div>

                  <div className="mt-2 space-y-1.5">
                    {step.side.items.map((line, at) => (
                      <div key={at} className="flex items-center gap-1.5">
                        <TextField
                          value={line.label}
                          title={`Reason ${at + 1}`}
                          onCommit={(label) => writeItem(index, true, at, { label })}
                        />
                        <div className="w-20 shrink-0">
                          <TextField
                            value={line.count}
                            placeholder="count"
                            title={`Count of reason ${at + 1}`}
                            onCommit={(count) => writeItem(index, true, at, { count })}
                          />
                        </div>
                        <IconButton
                          label={`Remove reason ${at + 1}`}
                          danger
                          onClick={() => dropItem(index, true, at)}
                        >
                          <Trash2 size={12} />
                        </IconButton>
                      </div>
                    ))}
                  </div>

                  <SlabButton className="mt-2" onClick={() => addItem(index, true)}>
                    <Plus size={12} />
                    Add a reason
                  </SlabButton>
                </div>
              ) : (
                <SlabButton className="mt-2" onClick={() => addSide(index)}>
                  <PanelRight size={12} />
                  Add the box beside this row
                </SlabButton>
              )}
            </div>
          ))}
        </div>

        <SlabButton className="mt-2" onClick={addStep}>
          <Plus size={12} />
          Add a row
        </SlabButton>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Each row is a step in the flow. A side box says what left the review at
          that step, and the phase bands are read off the rows themselves.
        </p>
      </Field>

      <Field label="Look" className="border-b-2 border-edge p-3">
        <Choice
          options={PRISMA_STYLES}
          value={options.style}
          onChange={(value) => set("style", value)}
        />
        <Tick className="mb-1.5 mt-3 block">Phase bands</Tick>
        <Segmented
          size="sm"
          value={options.bands ? "on" : "off"}
          onChange={(value) => set("bands", value === "on")}
          options={[
            { value: "on", label: "Down the left" },
            { value: "off", label: "Left out" },
          ]}
        />
        <div className="mt-3">
          <Slider
            label="Text"
            value={options.fontSize}
            min={8}
            max={24}
            step={1}
            onChange={(value) => set("fontSize", value)}
          />
        </div>
      </Field>

      <SizeField
        width={options.width}
        height={options.height}
        onChange={(size) => onChange({ ...spec, options: { ...options, ...size } })}
        note="A taller sheet leaves room for longer rows and more lines under them."
      />
    </div>
  );
}
