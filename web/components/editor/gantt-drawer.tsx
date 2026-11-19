"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  dropTask,
  freshTaskId,
  ganttStarts,
  withRows,
  type GanttSpec,
  type GanttTask,
} from "@/lib/gantt/spec";
import { Field, SlabButton, Tick } from "@/components/editor/ui";
import {
  ColourDot,
  IconButton,
  NumberField,
  Picker,
  SizeField,
  Slider,
  TextField,
} from "@/components/editor/figure-fields";

/**
 * A Gantt chart's settings: its sections, its tasks — when each starts, how
 * long it lasts, what it follows and how much of it is done — the unit the
 * header counts in, and the unit it is read in. Every field has a word in the
 * source and the other way round.
 */

interface GanttDrawerProps {
  spec: GanttSpec;
  onChange: (spec: GanttSpec) => void;
}

export default function GanttDrawer({ spec, onChange }: GanttDrawerProps) {
  const { options } = spec;
  const starts = ganttStarts(spec);
  const set = <K extends keyof GanttSpec["options"]>(key: K, value: GanttSpec["options"][K]) =>
    onChange({ ...spec, options: { ...options, [key]: value } });
  const writeTask = (index: number, patch: Partial<GanttTask>) =>
    onChange(
      withRows(spec, {
        ...spec,
        tasks: spec.tasks.map((task, at) => (at === index ? { ...task, ...patch } : task)),
      }),
    );
  const addTask = (milestone: boolean) => {
    const last = spec.tasks[spec.tasks.length - 1];
    const id = freshTaskId(spec, milestone);
    onChange(
      withRows(spec, {
        ...spec,
        tasks: [
          ...spec.tasks,
          {
            id,
            label: milestone ? "Milestone" : `Task ${spec.tasks.length + 1}`,
            section: spec.sections.length - 1,
            start: last ? null : 1,
            after: last ? [last.id] : [],
            length: milestone ? 0 : 2,
            done: 0,
          },
        ],
      }),
    );
  };
  const dropSection = (index: number) =>
    onChange(
      withRows(spec, {
        ...spec,
        sections: spec.sections.filter((_, at) => at !== index),
        tasks: spec.tasks.map((task) => ({
          ...task,
          section: task.section === index ? -1 : task.section > index ? task.section - 1 : task.section,
        })),
      }),
    );

  const sectionChoices = [
    { value: "-1", label: "No section" },
    ...spec.sections.map((name, index) => ({ value: String(index), label: name })),
  ];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Field label="Title" className="border-b-2 border-edge p-3">
        <TextField value={spec.title} onCommit={(title) => onChange({ ...spec, title })} title="What the chart is called" />
      </Field>

      <Field label="Time" className="border-b-2 border-edge p-3">
        <Tick className="mb-0.5 block">One unit is a</Tick>
        <TextField value={options.unit} placeholder="Week" title="What one unit is called" onCommit={(unit) => set("unit", unit)} />
        <div className="mt-2 flex items-center gap-1.5">
          <Tick className="shrink-0">Today, in unit</Tick>
          <NumberField
            value={options.today ?? 0}
            width="w-[60px]"
            title="The unit the chart is read in; 0 for none"
            onCommit={(value) => set("today", value >= 1 ? Math.round(value) : null)}
          />
        </div>
      </Field>

      <Field label="Sections" className="border-b-2 border-edge p-3">
        <div className="space-y-1.5">
          {spec.sections.map((name, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <TextField
                value={name}
                title={`Section ${index + 1}`}
                onCommit={(value) =>
                  onChange({ ...spec, sections: spec.sections.map((entry, at) => (at === index ? value : entry)) })
                }
              />
              <IconButton label={`Remove ${name}`} danger onClick={() => dropSection(index)}>
                <Trash2 size={12} />
              </IconButton>
            </div>
          ))}
        </div>
        <SlabButton
          className="mt-2"
          onClick={() => onChange(withRows(spec, { ...spec, sections: [...spec.sections, `Section ${spec.sections.length + 1}`] }))}
        >
          <Plus size={12} />
          Add a section
        </SlabButton>
      </Field>

      <Field label="Tasks" className="border-b-2 border-edge p-3">
        <div className="space-y-3">
          {spec.tasks.map((task, index) => {
            const others = spec.tasks.filter((other) => other.id !== task.id);
            return (
              <div key={task.id} className="space-y-1.5 border-l-2 border-edge pl-2">
                <div className="flex items-center gap-1.5">
                  <code className="shrink-0 font-mono text-[10.5px] text-ink-faint">{task.id}</code>
                  <TextField value={task.label} title={`Name of ${task.id}`} onCommit={(label) => writeTask(index, { label })} />
                  <IconButton label={`Remove ${task.label}`} danger onClick={() => onChange(dropTask(spec, index))}>
                    <Trash2 size={12} />
                  </IconButton>
                </div>
                <Picker
                  value={String(task.section)}
                  options={sectionChoices}
                  title={`Section of ${task.id}`}
                  onChange={(value) => writeTask(index, { section: Number(value) })}
                  className="w-full"
                />
                <div className="flex items-center gap-1.5">
                  <Picker
                    value={task.after.length > 0 ? `after:${task.after[0]}` : "unit"}
                    options={[
                      { value: "unit", label: "Starts in unit" },
                      ...others.map((other) => ({ value: `after:${other.id}`, label: `After ${other.id}` })),
                    ]}
                    title={`When ${task.id} starts`}
                    onChange={(value) =>
                      writeTask(
                        index,
                        value === "unit"
                          ? { after: [], start: starts[index] }
                          : { after: [value.slice(6)], start: null },
                      )
                    }
                  />
                  {task.after.length === 0 && (
                    <NumberField
                      value={task.start ?? 1}
                      width="w-[52px]"
                      title={`The unit ${task.id} starts in`}
                      onCommit={(value) => writeTask(index, { start: Math.max(1, Math.round(value)) })}
                    />
                  )}
                </div>
                {task.after.length > 1 && (
                  <p className="text-[11px] text-ink-faint">Follows {task.after.join(", ")}.</p>
                )}
                {task.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Tick className="shrink-0">Lasts</Tick>
                    <NumberField
                      value={task.length}
                      width="w-[52px]"
                      title={`How many units ${task.id} lasts`}
                      onCommit={(value) => writeTask(index, { length: Math.max(1, Math.round(value)) })}
                    />
                    <Tick className="shrink-0">Done %</Tick>
                    <NumberField
                      value={task.done}
                      width="w-[52px]"
                      title={`How much of ${task.id} is done`}
                      onCommit={(value) => writeTask(index, { done: Math.min(100, Math.max(0, Math.round(value))) })}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-1.5">
          <SlabButton onClick={() => addTask(false)}>
            <Plus size={12} />
            Add a task
          </SlabButton>
          <SlabButton onClick={() => addTask(true)}>
            <Plus size={12} />
            Add a milestone
          </SlabButton>
        </div>
      </Field>

      <Field label="Drawing" className="border-b-2 border-edge p-3">
        <div className="flex items-center gap-2">
          <ColourDot colour={options.color} title="The colour every bar takes" onPick={(value) => set("color", value)} />
          <span className="font-mono text-[11px] text-ink-faint">Done is solid; what is left is washed.</span>
        </div>
        <div className="mt-2.5">
          <Slider label="Text" value={options.fontSize} min={9} max={20} step={1} onChange={(value) => set("fontSize", value)} />
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
