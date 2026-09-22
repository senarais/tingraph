"use client";

import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import {
  MATRIX_STYLES,
  appendMatrixColumn,
  appendMatrixRow,
  moveMatrixColumn,
  moveMatrixRow,
  removeMatrixColumn,
  removeMatrixRow,
  type MatrixCell,
  type MatrixSpec,
} from "@/lib/matrix/spec";
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
 * The whole matrix table, editable as data rather than as a picture.
 *
 * A row owns exactly one cell per column. Column moves therefore move the same
 * cell in every row, while row moves leave columns alone. That small invariant
 * is what keeps sidebar edits, source input and on-sheet edits interchangeable.
 */

interface MatrixDrawerProps {
  spec: MatrixSpec;
  onChange: (spec: MatrixSpec) => void;
}

function OptionalColour({
  value,
  fallback,
  title,
  onChange,
}: {
  value?: string;
  fallback: string;
  title: string;
  onChange: (value?: string) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <ColourDot colour={value ?? fallback} title={title} onPick={onChange} />
      {value && (
        <button
          type="button"
          title="Use the shared colour"
          aria-label="Use the shared colour"
          onClick={() => onChange(undefined)}
          className="grid h-5 w-5 place-items-center border border-edge bg-white text-ink-faint hover:bg-bone hover:text-ink"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}

export default function MatrixDrawer({ spec, onChange }: MatrixDrawerProps) {
  const { options } = spec;
  const set = <K extends keyof MatrixSpec["options"]>(
    key: K,
    value: MatrixSpec["options"][K],
  ) => onChange({ ...spec, options: { ...options, [key]: value } });

  const writeColumn = (
    index: number,
    patch: Partial<MatrixSpec["columns"][number]>,
  ) => onChange({
    ...spec,
    columns: spec.columns.map((column, at) =>
      at === index ? { ...column, ...patch } : column,
    ),
  });

  const addColumn = () => {
    const group = spec.columns.at(-1)?.group ?? "";
    onChange(appendMatrixColumn(spec, {
      label: `Column ${spec.columns.length + 1}`,
      group,
    }));
  };

  const writeRow = (
    index: number,
    patch: Partial<MatrixSpec["rows"][number]>,
  ) => onChange({
    ...spec,
    rows: spec.rows.map((row, at) => at === index ? { ...row, ...patch } : row),
  });

  const writeCell = (row: number, column: number, patch: Partial<MatrixCell>) => {
    const cells = spec.rows[row].cells.map((cell, at) =>
      at === column ? { ...cell, ...patch } : cell,
    );
    writeRow(row, { cells });
  };

  const addRow = () => onChange(
    appendMatrixRow(spec, `Row ${spec.rows.length + 1}`),
  );
  const colours: Array<{
    label: string;
    key: "headerColor" | "rowHeaderColor" | "cellColor" | "gridColor";
    colour: string;
  }> = [
    { label: "Column heads", key: "headerColor", colour: options.headerColor },
    { label: "Row heads", key: "rowHeaderColor", colour: options.rowHeaderColor },
    { label: "Body cells", key: "cellColor", colour: options.cellColor },
    { label: "Grid", key: "gridColor", colour: options.gridColor },
  ];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Field label="Labels" className="border-b-2 border-edge p-3">
        <div className="space-y-1.5">
          <TextField
            value={spec.title}
            title="What the matrix is called"
            placeholder="Matrix title"
            onCommit={(title) => onChange({ ...spec, title })}
          />
          <TextField
            value={spec.corner}
            title="Caption in the top-left corner"
            placeholder="Name / Skill"
            onCommit={(corner) => onChange({ ...spec, corner })}
          />
        </div>
      </Field>

      <Field label={`Columns · ${spec.columns.length}`} className="border-b-2 border-edge p-3">
        <div className="space-y-2">
          {spec.columns.map((column, index) => (
            <div key={index} className="border-2 border-edge bg-bone/40 p-1.5">
              <Tick className="mb-1 block">Column {index + 1}</Tick>
              <div className="flex items-center gap-1">
                <OptionalColour
                  value={column.color}
                  fallback={options.headerColor}
                  title={`Colour of ${column.label || `column ${index + 1}`}`}
                  onChange={(color) => writeColumn(index, { color })}
                />
                <TextField
                  value={column.label}
                  title={`Name of column ${index + 1}`}
                  onCommit={(label) => writeColumn(index, { label })}
                />
                <IconButton
                  label="Move column left"
                  onClick={() => onChange(moveMatrixColumn(spec, index, index - 1))}
                >
                  <ArrowUp size={11} className="-rotate-90" />
                </IconButton>
                <IconButton
                  label="Move column right"
                  onClick={() => onChange(moveMatrixColumn(spec, index, index + 1))}
                >
                  <ArrowDown size={11} className="-rotate-90" />
                </IconButton>
                <IconButton
                  label={`Remove ${column.label || `column ${index + 1}`}`}
                  danger
                  onClick={() => onChange(removeMatrixColumn(spec, index))}
                >
                  <Trash2 size={11} />
                </IconButton>
              </div>
              <div className="mt-1">
                <TextField
                  value={column.group}
                  title="Spanning heading; adjacent columns with the same heading are merged"
                  placeholder="Optional group heading"
                  onCommit={(group) => writeColumn(index, { group })}
                />
              </div>
            </div>
          ))}
        </div>
        <SlabButton className="mt-2" onClick={addColumn}>
          <Plus size={12} />
          Add a column
        </SlabButton>
      </Field>

      <Field label={`Rows & cells · ${spec.rows.length}`} className="border-b-2 border-edge p-3">
        <div className="space-y-2.5">
          {spec.rows.map((row, rowIndex) => (
            <div key={rowIndex} className="border-2 border-edge bg-bone/40 p-1.5">
              <Tick className="mb-1 block">Row {rowIndex + 1}</Tick>
              <div className="flex items-center gap-1">
                <OptionalColour
                  value={row.color}
                  fallback={options.rowHeaderColor}
                  title={`Colour of ${row.label || `row ${rowIndex + 1}`}`}
                  onChange={(color) => writeRow(rowIndex, { color })}
                />
                <TextField
                  value={row.label}
                  title={`Name of row ${rowIndex + 1}`}
                  onCommit={(label) => writeRow(rowIndex, { label })}
                />
                <IconButton
                  label="Move row up"
                  onClick={() => onChange(moveMatrixRow(spec, rowIndex, rowIndex - 1))}
                >
                  <ArrowUp size={11} />
                </IconButton>
                <IconButton
                  label="Move row down"
                  onClick={() => onChange(moveMatrixRow(spec, rowIndex, rowIndex + 1))}
                >
                  <ArrowDown size={11} />
                </IconButton>
                <IconButton
                  label={`Remove ${row.label || `row ${rowIndex + 1}`}`}
                  danger
                  onClick={() => {
                    onChange(removeMatrixRow(spec, rowIndex));
                  }}
                >
                  <Trash2 size={11} />
                </IconButton>
              </div>
              <div className="mt-2 space-y-1">
                {spec.columns.map((column, columnIndex) => {
                  const cell = row.cells[columnIndex] ?? { value: "" };
                  return (
                    <div key={columnIndex} className="flex items-center gap-1">
                      <span
                        className="w-[58px] shrink-0 truncate font-mono text-[10px] text-ink-faint"
                        title={column.label}
                      >
                        {column.label || `Col ${columnIndex + 1}`}
                      </span>
                      <OptionalColour
                        value={cell.color}
                        fallback={options.cellColor}
                        title={`Colour of ${row.label}, ${column.label}`}
                        onChange={(color) => writeCell(rowIndex, columnIndex, { color })}
                      />
                      <TextField
                        value={cell.value}
                        title={`Value at ${row.label}, ${column.label}`}
                        placeholder="empty"
                        onCommit={(value) => writeCell(rowIndex, columnIndex, { value })}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <SlabButton className="mt-2" onClick={addRow}>
          <Plus size={12} />
          Add a row
        </SlabButton>
      </Field>

      <Field label="Layout" className="border-b-2 border-edge p-3">
        <Tick className="mb-1 block">Column labels</Tick>
        <Segmented
          size="sm"
          value={options.headerDirection}
          onChange={(value) => set("headerDirection", value)}
          options={[
            { value: "horizontal", label: "Horizontal" },
            { value: "vertical", label: "Vertical" },
          ]}
        />
        <Tick className="mb-1 mt-2.5 block">Cell alignment</Tick>
        <Segmented
          size="sm"
          value={options.align}
          onChange={(value) => set("align", value)}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Centre" },
            { value: "right", label: "Right" },
          ]}
        />
        <div className="mt-3 space-y-2">
          <Slider
            label="Rows"
            value={options.rowHeaderWidth}
            min={54}
            max={400}
            step={2}
            onChange={(value) => set("rowHeaderWidth", value)}
          />
          <Slider
            label="Header"
            value={options.headerHeight}
            min={28}
            max={240}
            step={2}
            onChange={(value) => set("headerHeight", value)}
          />
        </div>
      </Field>

      <Field label="Drawing" className="border-b-2 border-edge p-3">
        <Choice
          options={MATRIX_STYLES}
          value={options.style}
          onChange={(value) => set("style", value)}
        />
        <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5">
          {colours.map(({ label, key, colour }) => (
            <div key={key} className="contents">
              <ColourDot
                colour={colour}
                title={`${label} colour`}
                onPick={(value) => set(key, value)}
              />
              <span className="font-mono text-[11px] text-ink">{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          <Slider
            label="Text"
            value={options.fontSize}
            min={8}
            max={24}
            step={1}
            onChange={(value) => set("fontSize", value)}
          />
          <Slider
            label="Border"
            value={options.borderWidth}
            min={0.5}
            max={5}
            step={0.5}
            onChange={(value) => set("borderWidth", value)}
          />
        </div>
      </Field>

      <SizeField
        width={options.width}
        height={options.height}
        onChange={(size) => onChange({ ...spec, options: { ...options, ...size } })}
        note="Resize it on the sheet too. Rows and columns divide the available table space again when it is released."
      />
    </div>
  );
}
