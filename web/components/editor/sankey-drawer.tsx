"use client";

import { Plus, Trash2, X } from "lucide-react";
import { sankeyLoop, withoutStrays, type SankeyFlow, type SankeySpec } from "@/lib/sankey/spec";
import { Field, SlabButton } from "@/components/editor/ui";
import {
  Choice,
  ColourDot,
  IconButton,
  NumberField,
  Picker,
  SizeField,
  Slider,
  TextField,
} from "@/components/editor/figure-fields";

/**
 * A Sankey diagram's settings: its flows, its nodes and how it is drawn. A
 * flow is picked from the nodes there are; a new name makes a new node. An
 * edit that would loop the flows back round, join a node to itself or give a
 * node a name another already has is not taken, the way the parser refuses it.
 */

const PALETTES = [
  { id: "ink" as const, name: "Ink", hint: "grey bands, black nodes" },
  { id: "colorful" as const, name: "Colorful", hint: "a hue per source, carried along its flows" },
];

const VALUES = [
  { id: "on" as const, name: "Totals", hint: "each node's total under its name" },
  { id: "off" as const, name: "Names only", hint: "no numbers on the nodes" },
];

interface SankeyDrawerProps {
  spec: SankeySpec;
  onChange: (spec: SankeySpec) => void;
}

export default function SankeyDrawer({ spec, onChange }: SankeyDrawerProps) {
  const { options } = spec;
  const set = <K extends keyof SankeySpec["options"]>(key: K, value: SankeySpec["options"][K]) =>
    onChange({ ...spec, options: { ...options, [key]: value } });
  const names = spec.nodes.map((node, index) => ({ value: String(index), label: node.label }));

  const writeFlow = (index: number, patch: Partial<SankeyFlow>) => {
    const flows = spec.flows.map((flow, at) => (at === index ? { ...flow, ...patch } : flow));
    const flow = flows[index];
    if (flow.from === flow.to || !(flow.value > 0)) return;
    const next = { ...spec, flows };
    if (sankeyLoop(next)) return;
    onChange(withoutStrays(next));
  };

  const renameNode = (index: number, value: string) => {
    const label = value.trim();
    if (!label || spec.nodes.some((node, at) => at !== index && node.label === label)) return;
    onChange({ ...spec, nodes: spec.nodes.map((node, at) => (at === index ? { ...node, label } : node)) });
  };

  const addFlow = () => {
    let n = spec.nodes.length + 1;
    while (spec.nodes.some((node) => node.label === `Node ${n}`)) n += 1;
    onChange({
      ...spec,
      nodes: [...spec.nodes, { label: `Node ${n}` }],
      flows: [...spec.flows, { from: 0, to: spec.nodes.length, value: 10 }],
    });
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Field label="Title" className="border-b-2 border-edge p-3">
        <TextField value={spec.title} onCommit={(title) => onChange({ ...spec, title })} title="What the diagram is called" />
      </Field>

      <Field label="Flows" className="border-b-2 border-edge p-3">
        <p className="mb-2 text-[11px] leading-relaxed text-ink-faint">
          From, to and how much. A band is as wide as its flow; flows run one way, so one that would loop back is not taken.
        </p>
        <div className="space-y-1.5">
          {spec.flows.map((flow, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <Picker
                className="flex-1"
                value={String(flow.from)}
                options={names}
                title={`Where flow ${index + 1} comes from`}
                onChange={(value) => writeFlow(index, { from: Number(value) })}
              />
              <span className="font-mono text-[11px] text-ink-faint">→</span>
              <Picker
                className="flex-1"
                value={String(flow.to)}
                options={names}
                title={`Where flow ${index + 1} goes`}
                onChange={(value) => writeFlow(index, { to: Number(value) })}
              />
              <NumberField
                value={flow.value}
                width="w-[60px]"
                title="How much flows, above 0"
                onCommit={(value) => writeFlow(index, { value })}
              />
              <IconButton
                label="Remove this flow"
                danger
                onClick={() => {
                  if (spec.flows.length > 1) {
                    onChange(withoutStrays({ ...spec, flows: spec.flows.filter((_, at) => at !== index) }));
                  }
                }}
              >
                <Trash2 size={12} />
              </IconButton>
            </div>
          ))}
        </div>
        <SlabButton className="mt-2" onClick={addFlow}>
          <Plus size={12} />
          Add a flow to a new node
        </SlabButton>
      </Field>

      <Field label="Nodes" className="border-b-2 border-edge p-3">
        <div className="space-y-1.5">
          {spec.nodes.map((node, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <ColourDot
                colour={node.color ?? (options.palette === "ink" ? "#1f2328" : "#9ca3af")}
                title={`The colour of ${node.label}`}
                onPick={(color) =>
                  onChange({ ...spec, nodes: spec.nodes.map((entry, at) => (at === index ? { ...entry, color } : entry)) })
                }
              />
              <TextField value={node.label} title={`Node ${index + 1}`} onCommit={(value) => renameNode(index, value)} />
              {node.color && (
                <IconButton
                  label={`Give ${node.label} its colour back`}
                  onClick={() =>
                    onChange({
                      ...spec,
                      nodes: spec.nodes.map((entry, at) => (at === index ? { label: entry.label } : entry)),
                    })
                  }
                >
                  <X size={12} />
                </IconButton>
              )}
            </div>
          ))}
        </div>
      </Field>

      <Field label="Drawing" className="border-b-2 border-edge p-3">
        <Choice options={PALETTES} value={options.palette} onChange={(value) => set("palette", value)} />
        <div className="mt-2.5">
          <Choice options={VALUES} value={options.values ? "on" : "off"} onChange={(value) => set("values", value === "on")} />
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="w-[52px] font-mono text-[11px] text-ink-faint">Unit</span>
          <TextField value={options.unit} placeholder="e.g. PJ" title="Written after every value" onCommit={(unit) => set("unit", unit.trim())} />
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
