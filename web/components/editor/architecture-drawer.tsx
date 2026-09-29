"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ElementOnSheet, LinkOnSheet } from "@/lib/canvas/elements";
import type { DSLNode } from "@/lib/types";
import type { LinkMark } from "@/lib/canvas/units";
import { CONNECTORS } from "@/lib/connectors";
import { ARCHITECTURE_TEMPLATES } from "@/lib/templates";
import { Picker, TextField } from "@/components/editor/figure-fields";
import ArchitectureImage from "@/components/editor/architecture-image";

interface Props {
  elements: ElementOnSheet[];
  links: LinkOnSheet[];
  held: string | null;
  onSelect: (unit: string) => void;
  onChange: (unit: string, spec: DSLNode) => void;
  onAdd: (type: string) => void;
  onRemove: (unit: string) => void;
  onImage: (unit: string, file: File) => void;
  imageMessage: string;
  onTemplate: (source: string) => void;
  generating: boolean;
  onConnect: (from: string, to: string) => void;
  onLink: (id: string, patch: Partial<LinkMark>) => void;
  onLabelLink: (id: string, label: string) => void;
  onRemoveLink: (id: string) => void;
}

const TYPES = ["zone", "client", "service", "database", "storage", "queue", "cloud", "external"];
const options = (entries: ElementOnSheet[]) => entries.map((entry) => ({ value: entry.unit, label: entry.spec.label || entry.spec.id }));

export default function ArchitectureDrawer(props: Props) {
  const [armed, setArmed] = useState<number | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const nodes = props.elements.filter((entry) => entry.spec.type !== "zone");
  const ends = options(nodes);
  const start = ends.some((entry) => entry.value === from) ? from : (ends[0]?.value ?? "");
  const finish = ends.some((entry) => entry.value === to) ? to : (ends[1]?.value ?? ends[0]?.value ?? "");
  return <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 text-[11px]">
    <section>
      <p className="mb-2 font-bold uppercase tracking-wide">Starting layouts</p>
      <div className="grid grid-cols-2 gap-1.5">
        {ARCHITECTURE_TEMPLATES.map((template, index) => <button key={template.label} type="button" disabled={props.generating}
          onClick={() => {
            if (armed === index) {
              props.onTemplate(template.source);
              setArmed(null);
            } else setArmed(index);
          }}
          className="border-2 border-edge bg-white px-2 py-2 text-left font-semibold hover:bg-bone disabled:opacity-50">
          {armed === index ? `Replace sheet with ${template.label}?` : template.label}
        </button>)}
      </div>
      <p className="mt-1 text-ink-faint">Press twice to replace sheet and source.</p>
    </section>
    <section>
      <p className="mb-2 font-bold uppercase tracking-wide">Add component or zone</p>
      <div className="flex flex-wrap gap-1">
        {TYPES.map((type) => <button key={type} type="button" onClick={() => props.onAdd(type)} className="border border-edge bg-white px-2 py-1 capitalize hover:bg-bone">+ {type}</button>)}
      </div>
    </section>
    <section>
      <p className="mb-2 font-bold uppercase tracking-wide">Components & zones ({props.elements.length})</p>
      <div className="space-y-2">
        {props.elements.map((entry) => {
          const spec = entry.spec;
          const set = (patch: Partial<DSLNode>) => props.onChange(entry.unit, { ...spec, ...patch });
          const number = (value: string, fallback: number, min: number, max: number) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
          };
          return <div key={entry.unit} className="border-2 border-edge bg-white p-2">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => props.onSelect(entry.unit)} className={`min-w-0 flex-1 truncate text-left font-semibold ${props.held === entry.unit ? "text-blue-700" : "text-ink"}`} title="Select on canvas">{spec.label}</button>
              <button type="button" aria-label={`Remove ${spec.label}`} onClick={() => props.onRemove(entry.unit)} className="p-1 hover:text-alert"><Trash2 size={13} /></button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1">
              <label>Type <Picker value={spec.type} options={TYPES.map((type) => ({ value: type, label: type }))} onChange={(type) => set({ type: type as DSLNode["type"], image: undefined })} title="Component type" /></label>
              <label>Name <TextField value={spec.label} onCommit={(label) => set({ label })} title="Component name" /></label>
              {(["x", "y", "width", "height"] as const).map((key) => <label key={key} className="capitalize">{key}
                <TextField value={String(key === "x" || key === "y" ? spec.at?.[key] ?? entry.box[key] : spec[key] ?? entry.box[key])}
                  onCommit={(value) => key === "x" || key === "y"
                    ? set({ at: { ...(spec.at ?? { x: entry.box.x, y: entry.box.y }), [key]: number(value, entry.box[key], -5000, 5000) } })
                    : set({ [key]: number(value, entry.box[key], key === "width" ? 80 : 60, key === "width" ? 3000 : 2000) })}
                  title={`${key} in canvas units`} />
              </label>)}
            </div>
            {spec.type !== "zone" && <div className="mt-2 flex items-center gap-2">
              <ArchitectureImage onFile={(file) => props.onImage(entry.unit, file)} />
              {spec.image && <button type="button" className="underline" onClick={() => set({ image: undefined })}>Remove image</button>}
            </div>}
          </div>;
        })}
      </div>
      {props.imageMessage && <p role="alert" className="mt-2 text-alert">{props.imageMessage}</p>}
    </section>
    <section>
      <p className="mb-2 font-bold uppercase tracking-wide">Connections ({props.links.length})</p>
      {ends.length > 1 && <div className="mb-2 flex items-center gap-1">
        <Picker value={start} options={ends} onChange={setFrom} title="From component" />
        <span>→</span>
        <Picker value={finish} options={ends} onChange={setTo} title="To component" />
        <button type="button" disabled={start === finish} onClick={() => props.onConnect(start, finish)} title="Add connection" aria-label="Add connection" className="border border-edge bg-white p-1 disabled:opacity-40"><Plus size={14} /></button>
      </div>}
      <div className="space-y-2">
        {props.links.map((entry) => <div key={entry.id} className="border-2 border-edge bg-white p-2">
          <div className="flex items-center gap-1">
            <Picker value={entry.link.from.unit} options={ends} onChange={(unit) => props.onLink(entry.id, { from: { unit }, bend: null })} title="From component" />
            <span>→</span>
            <Picker value={entry.link.to.unit} options={ends} onChange={(unit) => props.onLink(entry.id, { to: { unit }, bend: null })} title="To component" />
            <button type="button" aria-label="Remove connection" onClick={() => props.onRemoveLink(entry.id)} className="p-1 hover:text-alert"><Trash2 size={13} /></button>
          </div>
          <div className="mt-1 flex items-center gap-1">
            <Picker value={entry.link.line} options={CONNECTORS.architecture.map((kind) => ({ value: kind.id, label: kind.label }))} onChange={(line) => props.onLink(entry.id, { line })} title="Connection style" />
            <TextField value={entry.label} onCommit={(label) => props.onLabelLink(entry.id, label)} title="Connection label" placeholder="label" />
          </div>
        </div>)}
      </div>
    </section>
  </div>;
}
