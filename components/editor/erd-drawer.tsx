"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import type { ElementOnSheet, LinkOnSheet } from "@/lib/canvas/elements";
import { addField, moveField, removeField, setField } from "@/lib/canvas/erd";
import { CONNECTORS } from "@/lib/connectors";
import type { DSLField, DSLNode } from "@/lib/types";
import type { LinkMark } from "@/lib/canvas/units";
import { IconButton, Picker, TextField } from "@/components/editor/figure-fields";
import { SlabButton, Tick } from "@/components/editor/ui";

/**
 * Everything an entity relationship diagram is made of, as a list.
 *
 * The tables here are the tables on the sheet — read off it, not kept beside
 * it — so a column renamed by typing on the drawing is the column this panel
 * shows, and a column added here is drawn the moment it is added. The two are
 * one state with two hands on it, which is the whole point of the panel.
 */

interface ErdDrawerProps {
  tables: ElementOnSheet[];
  links: LinkOnSheet[];
  /** picks the table on the sheet too, so its row handles come out with it */
  onSelect: (unit: string) => void;
  onChange: (unit: string, spec: DSLNode) => void;
  onAdd: () => void;
  onRemove: (unit: string) => void;
  onLink: (id: string, patch: Partial<LinkMark>) => void;
  onLabelLink: (id: string, label: string) => void;
  onRemoveLink: (id: string) => void;
}

const KEYS: Array<{ value: string; label: string }> = [
  { value: "", label: "—" },
  { value: "pk", label: "PK" },
  { value: "fk", label: "FK" },
  { value: "pfk", label: "PFK" },
];

/** A flag that is on or off, shown as the letter the drawing writes. */
function Flag({
  on,
  label,
  title,
  onToggle,
}: {
  on: boolean;
  label: string;
  title: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={on}
      onClick={onToggle}
      className={`grid h-[26px] w-[26px] shrink-0 place-items-center border-2 border-edge font-mono text-[10px] leading-none transition-colors ${
        on ? "bg-edge text-bone" : "bg-white text-ink hover:bg-bone"
      }`}
    >
      {label}
    </button>
  );
}

function Column({
  field,
  at,
  last,
  onChange,
  onRemove,
  onMove,
}: {
  field: DSLField;
  at: number;
  last: boolean;
  onChange: (patch: Partial<DSLField>) => void;
  onRemove: () => void;
  onMove: (by: -1 | 1) => void;
}) {
  return (
    <div className="border-2 border-edge bg-white p-1.5">
      <div className="flex items-center gap-1.5">
        <Picker
          value={field.key ?? ""}
          options={KEYS}
          title="Key marker"
          className="w-[62px] shrink-0"
          onChange={(value) =>
            onChange({ key: (value || undefined) as DSLField["key"] })
          }
        />
        <TextField
          value={field.name}
          title="Column name"
          placeholder="column"
          onCommit={(value) => onChange({ name: value.trim() || field.name })}
        />
        <IconButton label="Delete this column" danger onClick={onRemove}>
          <Trash2 size={12} />
        </IconButton>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <TextField
          value={field.type ?? ""}
          title="Column type"
          placeholder="type"
          onCommit={(value) => onChange({ type: value.trim() })}
        />
        <Flag
          on={Boolean(field.unique)}
          label="U"
          title="No two rows share this value"
          onToggle={() => onChange({ unique: !field.unique })}
        />
        <Flag
          on={Boolean(field.optional)}
          label="?"
          title="The value may be missing"
          onToggle={() => onChange({ optional: !field.optional })}
        />
        <IconButton label="Move this column up" onClick={() => onMove(-1)}>
          <span className="font-mono text-[11px] leading-none">↑</span>
        </IconButton>
        <IconButton label="Move this column down" onClick={() => onMove(1)}>
          <span className="font-mono text-[11px] leading-none">↓</span>
        </IconButton>
      </div>
      {last && at === 0 && (
        <p className="mt-1.5 text-[10.5px] leading-tight text-ink-faint">
          A table keeps at least one column.
        </p>
      )}
    </div>
  );
}

function Table({
  table,
  open,
  onOpen,
  onChange,
  onRemove,
}: {
  table: ElementOnSheet;
  open: boolean;
  onOpen: () => void;
  onChange: (spec: DSLNode) => void;
  onRemove: () => void;
}) {
  const spec = table.spec;
  const fields = spec.fields ?? [];
  return (
    <div className="border-2 border-edge bg-bone">
      <div className="flex items-center gap-1.5 p-1.5">
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={open}
          title={open ? "Close this table" : "Open this table"}
          aria-label={open ? "Close this table" : "Open this table"}
          className="grid h-[26px] w-[22px] shrink-0 place-items-center text-ink transition-colors hover:bg-white"
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <TextField
          value={spec.label}
          title="Table name"
          onCommit={(value) => onChange({ ...spec, label: value.trim() || spec.label })}
        />
        <Picker
          value={spec.type === "weak" ? "weak" : "entity"}
          options={[
            { value: "entity", label: "Entity" },
            { value: "weak", label: "Weak" },
          ]}
          title="A weak entity carries a second outline"
          className="w-[86px] shrink-0"
          onChange={(value) => onChange({ ...spec, type: value as DSLNode["type"] })}
        />
        <IconButton label="Delete this table" danger onClick={onRemove}>
          <Trash2 size={12} />
        </IconButton>
      </div>
      {open && (
        <div className="space-y-1.5 border-t-2 border-edge p-1.5">
          {fields.map((field, at) => (
            <Column
              key={`${at}-${field.name}`}
              field={field}
              at={at}
              last={fields.length === 1}
              onChange={(patch) => onChange(setField(spec, at, patch))}
              onRemove={() => onChange(removeField(spec, at))}
              onMove={(by) => onChange(moveField(spec, at, by))}
            />
          ))}
          <SlabButton className="w-full" onClick={() => onChange(addField(spec))}>
            <Plus size={12} />
            Add a column
          </SlabButton>
        </div>
      )}
    </div>
  );
}

/** One relation: the two columns it joins, and the crow's foot at each end. */
function Relation({
  link,
  tables,
  onChange,
  onLabel,
  onRemove,
}: {
  link: LinkOnSheet;
  tables: ElementOnSheet[];
  onChange: (patch: Partial<LinkMark>) => void;
  onLabel: (label: string) => void;
  onRemove: () => void;
}) {
  const named = (unit: string) =>
    tables.find((table) => table.unit === unit)?.spec.label ?? unit;
  const columns = (unit: string) => {
    const table = tables.find((entry) => entry.unit === unit);
    return [
      { value: "", label: "whole table" },
      ...(table?.spec.fields ?? []).map((field) => ({
        value: field.name,
        label: field.name,
      })),
    ];
  };
  const kinds = CONNECTORS.erd.map((kind) => ({ value: kind.id, label: kind.label }));
  return (
    <div className="border-2 border-edge bg-white p-1.5">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink">
          {named(link.link.from.unit)}
        </span>
        <Picker
          value={link.link.from.port ?? ""}
          options={columns(link.link.from.unit)}
          title="Which column this relation leaves"
          className="w-[112px] shrink-0"
          onChange={(value) =>
            onChange({ from: { ...link.link.from, port: value || undefined } })
          }
        />
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink">
          → {named(link.link.to.unit)}
        </span>
        <Picker
          value={link.link.to.port ?? ""}
          options={columns(link.link.to.unit)}
          title="Which column this relation meets"
          className="w-[112px] shrink-0"
          onChange={(value) =>
            onChange({ to: { ...link.link.to, port: value || undefined } })
          }
        />
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <Picker
          value={link.link.line}
          options={kinds}
          title="How many at each end"
          className="min-w-0 flex-1"
          onChange={(value) => onChange({ line: value })}
        />
        <IconButton label="Delete this relation" danger onClick={onRemove}>
          <Trash2 size={12} />
        </IconButton>
      </div>
      <div className="mt-1.5">
        <TextField
          value={link.label}
          title="What the relation is called"
          placeholder="what it is called"
          onCommit={onLabel}
        />
      </div>
    </div>
  );
}

export default function ErdDrawer({
  tables,
  links,
  onSelect,
  onChange,
  onAdd,
  onRemove,
  onLink,
  onLabelLink,
  onRemoveLink,
}: ErdDrawerProps) {
  const [open, setOpen] = useState<string | null>(null);
  const known = new Set(tables.map((table) => table.unit));
  const relations = links.filter(
    (link) => known.has(link.link.from.unit) && known.has(link.link.to.unit),
  );
  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      <Tick className="block">Tables</Tick>
      {tables.length === 0 && (
        <p className="text-[12px] leading-relaxed text-ink-soft">
          Nothing on the sheet yet. Write it in the source and press Generate,
          or add a table here and give it its columns.
        </p>
      )}
      {tables.map((table) => (
        <Table
          key={table.unit}
          table={table}
          open={open === table.unit}
          onOpen={() => {
            const next = open === table.unit ? null : table.unit;
            setOpen(next);
            if (next) {
              onSelect(next);
            }
          }}
          onChange={(spec) => onChange(table.unit, spec)}
          onRemove={() => onRemove(table.unit)}
        />
      ))}
      <SlabButton className="w-full" tone="solid" onClick={onAdd}>
        <Plus size={13} />
        Add a table
      </SlabButton>

      {relations.length > 0 && (
        <>
          <Tick className="block pt-2">Relations</Tick>
          <p className="text-[11px] leading-relaxed text-ink-faint">
            A relation joins one table&apos;s key to another&apos;s. Left on the
            whole table it meets the side; given a column it leaves that row.
          </p>
          <div className="space-y-1.5">
            {relations.map((link) => (
              <Relation
                key={link.id}
                link={link}
                tables={tables}
                onChange={(patch) => onLink(link.id, patch)}
                onLabel={(label) => onLabelLink(link.id, label)}
                onRemove={() => onRemoveLink(link.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
