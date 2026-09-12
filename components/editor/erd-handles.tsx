"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Minus, Plus, Trash2 } from "lucide-react";
import type { ElementOnSheet } from "@/lib/canvas/elements";
import { addField, moveField, nextKey, removeField, setField } from "@/lib/canvas/erd";
import { erdBoxLayout } from "@/lib/layout/layout-erd";
import type { DSLNode } from "@/lib/types";
import {
  BarKey,
  HandleLayer,
  HitBox,
  PartBar,
  Rename,
  SheetKey,
} from "@/components/editor/figure-handles";
import type { CanvasView } from "@/components/editor/pool-controls";

/**
 * Building a table on the sheet.
 *
 * A column is not somewhere on the drawing — it is third, under the second —
 * so it cannot be dragged into place the way a box can. These are what it is
 * edited with instead: a row can be pressed for what it can do, double-clicked
 * to be renamed, and a pair of keys under the last row adds another or takes
 * one off. Every one of them rewrites the table's spec, which is the same
 * thing the panel writes, so the sheet and the panel cannot disagree.
 */

interface ErdHandlesProps {
  tables: ElementOnSheet[];
  /** the table the reader has hold of, by unit name */
  held: string | null;
  /** the row that is picked, written `unit#index` */
  picked: string | null;
  onPick: (id: string | null) => void;
  view: CanvasView;
  onChange: (unit: string, spec: DSLNode) => void;
}

/** `erd-BOOKING#2` — which table, and which of its columns. */
function rowOf(picked: string | null, unit: string): number | null {
  if (!picked || !picked.startsWith(`${unit}#`)) {
    return null;
  }
  const at = Number(picked.slice(unit.length + 1));
  return Number.isInteger(at) ? at : null;
}

export default function ErdHandles({
  tables,
  held,
  picked,
  onPick,
  view,
  onChange,
}: ErdHandlesProps) {
  const [naming, setNaming] = useState<string | null>(null);
  const table =
    tables.find((entry) => entry.unit === held) ??
    tables.find((entry) => picked?.startsWith(`${entry.unit}#`)) ??
    null;
  if (!table) {
    return null;
  }
  const spec = table.spec;
  const fields = spec.fields ?? [];
  const box = erdBoxLayout(spec);
  const width = Math.max(box.width, table.box.width);
  const rowBox = (at: number) => ({
    x: table.box.x,
    y: table.box.y + box.headerHeight + at * box.rowHeight,
    width,
    height: box.rowHeight,
  });
  const at = rowOf(picked, table.unit);
  const write = (next: DSLNode) => onChange(table.unit, next);
  const bottom = table.box.y + box.headerHeight + fields.length * box.rowHeight;

  return (
    <HandleLayer>
      <svg
        className="absolute inset-0 h-full w-full"
        style={{ pointerEvents: "none" }}
      >
        <g
          transform={`translate(${view.scrollX * view.zoom} ${
            view.scrollY * view.zoom
          }) scale(${view.zoom})`}
        >
          {fields.map((field, index) => (
            <HitBox
              key={`${index}-${field.name}`}
              box={rowBox(index)}
              held={at === index}
              label={`Column ${field.name}`}
              onPick={() => onPick(`${table.unit}#${index}`)}
              onRename={() => {
                onPick(`${table.unit}#${index}`);
                setNaming(`${table.unit}#${index}`);
              }}
            />
          ))}
        </g>
      </svg>

      {at !== null && fields[at] && naming !== `${table.unit}#${at}` && (
        <PartBar
          view={view}
          align="beside"
          at={{ x: table.box.x + width + 10, y: rowBox(at).y + box.rowHeight / 2 }}
        >
          <BarKey
            label="Rename this column"
            onClick={() => setNaming(`${table.unit}#${at}`)}
          >
            <span className="px-0.5 font-mono text-[10px] leading-none">Aa</span>
          </BarKey>
          <BarKey
            label="Primary key, foreign key, both, or none"
            onClick={() => write(setField(spec, at, { key: nextKey(fields[at].key) }))}
          >
            <span className="px-0.5 font-mono text-[10px] leading-none">
              {fields[at].key ? fields[at].key.toUpperCase() : "—"}
            </span>
          </BarKey>
          <BarKey
            label="No two rows share this value"
            onClick={() => write(setField(spec, at, { unique: !fields[at].unique }))}
          >
            <span
              className={`px-0.5 font-mono text-[10px] leading-none ${
                fields[at].unique ? "" : "opacity-40"
              }`}
            >
              U
            </span>
          </BarKey>
          <BarKey
            label="The value may be missing"
            onClick={() => write(setField(spec, at, { optional: !fields[at].optional }))}
          >
            <span
              className={`px-0.5 font-mono text-[10px] leading-none ${
                fields[at].optional ? "" : "opacity-40"
              }`}
            >
              ?
            </span>
          </BarKey>
          <BarKey
            label="Move this column up"
            disabled={at === 0}
            onClick={() => {
              write(moveField(spec, at, -1));
              onPick(`${table.unit}#${at - 1}`);
            }}
          >
            <ArrowUp size={12} />
          </BarKey>
          <BarKey
            label="Move this column down"
            disabled={at >= fields.length - 1}
            onClick={() => {
              write(moveField(spec, at, 1));
              onPick(`${table.unit}#${at + 1}`);
            }}
          >
            <ArrowDown size={12} />
          </BarKey>
          <BarKey
            label="Add a column under this one"
            onClick={() => {
              write(addField(spec, at));
              onPick(`${table.unit}#${at + 1}`);
            }}
          >
            <Plus size={12} />
          </BarKey>
          <BarKey
            label="Delete this column"
            danger
            last
            disabled={fields.length < 2}
            onClick={() => {
              write(removeField(spec, at));
              onPick(null);
            }}
          >
            <Trash2 size={12} />
          </BarKey>
        </PartBar>
      )}

      {naming !== null && at !== null && fields[at] && (
        <Rename
          view={view}
          at={{ x: table.box.x + width / 2, y: rowBox(at).y + box.rowHeight / 2 }}
          width={width}
          value={fields[at].name}
          onCommit={(value) => {
            setNaming(null);
            if (value.trim()) {
              write(setField(spec, at, { name: value.trim() }));
            }
          }}
          onCancel={() => setNaming(null)}
        />
      )}

      <SheetKey
        view={view}
        at={{ x: table.box.x + width / 2 - 14, y: bottom + 13 }}
        label="Add a column to this table"
        onClick={() => {
          write(addField(spec));
          onPick(`${table.unit}#${fields.length}`);
        }}
      >
        <Plus size={12} />
      </SheetKey>
      <SheetKey
        view={view}
        at={{ x: table.box.x + width / 2 + 14, y: bottom + 13 }}
        label="Take the last column off this table"
        onClick={() => {
          write(removeField(spec, fields.length - 1));
          onPick(null);
        }}
      >
        <Minus size={12} />
      </SheetKey>
    </HandleLayer>
  );
}
