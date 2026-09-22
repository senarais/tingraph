"use client";

import { useRef, useState } from "react";
import { Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { planMatrix, type Rect } from "@/lib/matrix/build-matrix";
import {
  appendMatrixColumn,
  appendMatrixRow,
  removeMatrixColumn,
  removeMatrixRow,
  type MatrixSpec,
} from "@/lib/matrix/spec";
import type { CanvasView } from "@/components/editor/pool-controls";
import {
  BarKey,
  HandleLayer,
  HitBox,
  PartBar,
  Rename,
  SheetKey,
} from "@/components/editor/figure-handles";

/**
 * Direct editing for the matrix table.
 *
 * Every visible label and every body cell is a hit target. Double-clicking it
 * writes the same spec the sidebar writes; the small pairs below the table add
 * and remove whole rows or columns while preserving its rectangular shape.
 */

interface MatrixHandlesProps {
  spec: MatrixSpec;
  box: Rect;
  view: CanvasView;
  picked: string | null;
  onPick: (id: string | null) => void;
  onChange: (spec: MatrixSpec, settled: boolean) => void;
}

interface Chosen {
  box: Rect;
  label: string;
  rename: (value: string) => void;
  remove?: () => void;
}

export default function MatrixHandles({
  spec,
  box,
  view,
  picked,
  onPick,
  onChange,
}: MatrixHandlesProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const plan = planMatrix(spec, box);
  const parts = (picked ?? "").split(":");
  const index = Number(parts[1]);
  const second = Number(parts[2]);

  const commit = (next: MatrixSpec) => onChange(next, true);

  const addColumn = () => commit(appendMatrixColumn(spec, {
    label: `Column ${spec.columns.length + 1}`,
    group: spec.columns.at(-1)?.group ?? "",
  }));

  const dropColumn = (column: number) => {
    const next = removeMatrixColumn(spec, column);
    if (next === spec) return;
    commit(next);
    onPick(null);
  };

  const addRow = () => commit(
    appendMatrixRow(spec, `Row ${spec.rows.length + 1}`),
  );

  const dropRow = (row: number) => {
    const next = removeMatrixRow(spec, row);
    if (next === spec) return;
    commit(next);
    onPick(null);
  };

  const choose = (id: string, startNaming = false) => {
    onPick(id);
    if (startNaming) setNaming(id);
  };

  const chosen: Chosen | null = (() => {
    if (picked === "title") {
      return {
        box: plan.title,
        label: spec.title,
        rename: (title) => commit({ ...spec, title }),
      };
    }
    if (picked === "corner") {
      return {
        box: plan.corner,
        label: spec.corner,
        rename: (corner) => commit({ ...spec, corner }),
      };
    }
    if (parts[0] === "group") {
      const group = plan.groups.find((entry) => entry.start === index && entry.end === second);
      if (!group) return null;
      return {
        box: group.box,
        label: group.label,
        rename: (label) => commit({
          ...spec,
          columns: spec.columns.map((column, at) =>
            at >= group.start && at <= group.end ? { ...column, group: label } : column,
          ),
        }),
      };
    }
    if (parts[0] === "column" && spec.columns[index] && plan.columns[index]) {
      return {
        box: plan.columns[index],
        label: spec.columns[index].label,
        rename: (label) => commit({
          ...spec,
          columns: spec.columns.map((column, at) =>
            at === index ? { ...column, label } : column,
          ),
        }),
        remove: spec.columns.length > 1 ? () => dropColumn(index) : undefined,
      };
    }
    if (parts[0] === "row" && spec.rows[index] && plan.rowHeaders[index]) {
      return {
        box: plan.rowHeaders[index],
        label: spec.rows[index].label,
        rename: (label) => commit({
          ...spec,
          rows: spec.rows.map((row, at) => at === index ? { ...row, label } : row),
        }),
        remove: spec.rows.length > 1 ? () => dropRow(index) : undefined,
      };
    }
    if (
      parts[0] === "cell" &&
      spec.rows[index]?.cells[second] &&
      plan.cells[index]?.[second]
    ) {
      return {
        box: plan.cells[index][second],
        label: spec.rows[index].cells[second].value,
        rename: (value) => commit({
          ...spec,
          rows: spec.rows.map((row, rowAt) => rowAt === index
            ? {
                ...row,
                cells: row.cells.map((cell, columnAt) =>
                  columnAt === second ? { ...cell, value } : cell,
                ),
              }
            : row),
        }),
      };
    }
    return null;
  })();

  return (
    <>
      <svg
        ref={svgRef}
        className="absolute inset-0 z-20 h-full w-full"
        style={{ pointerEvents: "none", touchAction: "none" }}
      >
        <g
          transform={`translate(${view.scrollX * view.zoom} ${view.scrollY * view.zoom}) scale(${view.zoom})`}
        >
          {spec.title && (
            <HitBox
              box={plan.title}
              held={picked === "title"}
              label={`Matrix title: ${spec.title}`}
              onPick={() => choose("title")}
              onRename={() => choose("title", true)}
            />
          )}
          <HitBox
            box={plan.corner}
            held={picked === "corner"}
            label={`Corner heading: ${spec.corner || "empty"}`}
            onPick={() => choose("corner")}
            onRename={() => choose("corner", true)}
          />
          {plan.groups.map((group) => {
            const id = `group:${group.start}:${group.end}`;
            return group.label ? (
              <HitBox
                key={id}
                box={group.box}
                held={picked === id}
                label={`Column group: ${group.label}`}
                onPick={() => choose(id)}
                onRename={() => choose(id, true)}
              />
            ) : null;
          })}
          {plan.columns.map((columnBox, column) => {
            const id = `column:${column}`;
            return (
              <HitBox
                key={id}
                box={columnBox}
                held={picked === id}
                label={`Column ${column + 1}: ${spec.columns[column]?.label ?? "empty"}`}
                onPick={() => choose(id)}
                onRename={() => choose(id, true)}
              />
            );
          })}
          {plan.rowHeaders.map((rowBox, row) => {
            const id = `row:${row}`;
            return (
              <HitBox
                key={id}
                box={rowBox}
                held={picked === id}
                label={`Row ${row + 1}: ${spec.rows[row]?.label ?? "empty"}`}
                onPick={() => choose(id)}
                onRename={() => choose(id, true)}
              />
            );
          })}
          {plan.cells.flatMap((row, rowIndex) => row.map((cellBox, columnIndex) => {
            const id = `cell:${rowIndex}:${columnIndex}`;
            const value = spec.rows[rowIndex]?.cells[columnIndex]?.value ?? "";
            return (
              <HitBox
                key={id}
                box={cellBox}
                held={picked === id}
                label={`${spec.rows[rowIndex]?.label}, ${spec.columns[columnIndex]?.label}: ${value || "empty"}`}
                onPick={() => choose(id)}
                onRename={() => choose(id, true)}
              />
            );
          }))}
        </g>
      </svg>

      <HandleLayer>
        <SheetKey
          view={view}
          at={{ x: plan.table.x + 10, y: plan.table.y + plan.table.height + 15 }}
          label="Add a row"
          onClick={addRow}
        >
          <Plus size={12} />
        </SheetKey>
        <SheetKey
          view={view}
          at={{ x: plan.table.x + 34, y: plan.table.y + plan.table.height + 15 }}
          label="Remove the last row"
          onClick={() => dropRow(spec.rows.length - 1)}
        >
          <Minus size={12} />
        </SheetKey>
        <SheetKey
          view={view}
          at={{ x: plan.table.x + plan.table.width - 34, y: plan.table.y + plan.table.height + 15 }}
          label="Add a column"
          onClick={addColumn}
        >
          <Plus size={12} />
        </SheetKey>
        <SheetKey
          view={view}
          at={{ x: plan.table.x + plan.table.width - 10, y: plan.table.y + plan.table.height + 15 }}
          label="Remove the last column"
          onClick={() => dropColumn(spec.columns.length - 1)}
        >
          <Minus size={12} />
        </SheetKey>

        {chosen && naming !== picked && (
          <PartBar
            view={view}
            at={{ x: chosen.box.x + chosen.box.width / 2, y: chosen.box.y - 5 }}
          >
            <BarKey
              label="Edit this text"
              onClick={() => setNaming(picked)}
              last={!chosen.remove}
            >
              <Pencil size={13} />
            </BarKey>
            {chosen.remove && (
              <BarKey label="Remove this" danger last onClick={chosen.remove}>
                <Trash2 size={13} />
              </BarKey>
            )}
          </PartBar>
        )}

        {chosen && naming === picked && (
          <Rename
            view={view}
            at={{
              x: chosen.box.x + chosen.box.width / 2,
              y: chosen.box.y + chosen.box.height / 2,
            }}
            width={chosen.box.width}
            value={chosen.label}
            onCommit={(value) => {
              chosen.rename(value);
              setNaming(null);
            }}
            onCancel={() => setNaming(null)}
          />
        )}
      </HandleLayer>
    </>
  );
}
