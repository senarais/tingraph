import type { FigureSize } from "@/lib/figures/spec";

/**
 * What a matrix table is.
 *
 * The columns name the things being compared, the rows name the subjects, and
 * every intersection is deliberately just a string. A reader may put an x, a
 * number, a status, or a sentence in a cell; the notation does not reinterpret
 * it. Consecutive columns with the same non-empty `group` receive one spanning
 * heading, which covers both the simple tables and the grouped skill matrices
 * this notation is used for.
 */

export type MatrixStyleId = "plain" | "headers" | "banded" | "heatmap";

export interface MatrixStyle {
  id: MatrixStyleId;
  name: string;
  hint: string;
}

export const MATRIX_STYLES: MatrixStyle[] = [
  {
    id: "plain",
    name: "Plain",
    hint: "white cells and formal grid lines",
  },
  {
    id: "headers",
    name: "Headers",
    hint: "coloured column and row headings",
  },
  {
    id: "banded",
    name: "Banded",
    hint: "coloured headings with alternating body rows",
  },
  {
    id: "heatmap",
    name: "Heatmap",
    hint: "every body cell carries its fill colour",
  },
];

export interface MatrixColumn {
  label: string;
  /** Consecutive equal names are drawn as one heading over those columns. */
  group: string;
  /** A fill of its own for this column heading. */
  color?: string;
}

export interface MatrixCell {
  /** Kept as text on purpose: x, 0, ✓ and a sentence are equally valid. */
  value: string;
  /** A fill of its own, independent of the selected preset. */
  color?: string;
}

export interface MatrixRow {
  label: string;
  color?: string;
  cells: MatrixCell[];
}

export interface MatrixOptions extends FigureSize {
  style: MatrixStyleId;
  headerDirection: "horizontal" | "vertical";
  align: "left" | "center" | "right";
  headerColor: string;
  rowHeaderColor: string;
  cellColor: string;
  gridColor: string;
  fontSize: number;
  borderWidth: number;
  /** Width of the heading down the left, in sheet units. */
  rowHeaderWidth: number;
  /** Height of the column labels, below any grouped heading. */
  headerHeight: number;
}

export interface MatrixSpec {
  kind: "matrix";
  title: string;
  /** Caption in the top-left corner, e.g. "Name / Skill". */
  corner: string;
  columns: MatrixColumn[];
  rows: MatrixRow[];
  options: MatrixOptions;
}

export function defaultMatrixOptions(): MatrixOptions {
  return {
    style: "plain",
    headerDirection: "horizontal",
    align: "center",
    headerColor: "#2a78d6",
    rowHeaderColor: "#dce9f8",
    cellColor: "#fff2cc",
    gridColor: "#1f2933",
    fontSize: 13,
    borderWidth: 1.5,
    rowHeaderWidth: 150,
    headerHeight: 58,
    width: 760,
    height: 460,
  };
}

export function emptyMatrixCell(value = ""): MatrixCell {
  return { value };
}

/** Keep a row rectangular after a column is added or removed. */
export function fitMatrixRow(row: MatrixRow, columns: number): MatrixRow {
  return {
    ...row,
    cells: Array.from(
      { length: columns },
      (_, index) => row.cells[index] ?? emptyMatrixCell(),
    ),
  };
}

function moved<T>(values: T[], from: number, to: number): T[] {
  if (from < 0 || from >= values.length || to < 0 || to >= values.length || from === to) {
    return values;
  }
  const next = [...values];
  const [value] = next.splice(from, 1);
  next.splice(to, 0, value);
  return next;
}

export function appendMatrixColumn(spec: MatrixSpec, column: MatrixColumn): MatrixSpec {
  return {
    ...spec,
    columns: [...spec.columns, column],
    rows: spec.rows.map((row) => ({
      ...row,
      cells: [...row.cells, emptyMatrixCell()],
    })),
  };
}

export function removeMatrixColumn(spec: MatrixSpec, index: number): MatrixSpec {
  if (spec.columns.length <= 1 || index < 0 || index >= spec.columns.length) return spec;
  return {
    ...spec,
    columns: spec.columns.filter((_, at) => at !== index),
    rows: spec.rows.map((row) => ({
      ...row,
      cells: row.cells.filter((_, at) => at !== index),
    })),
  };
}

export function moveMatrixColumn(spec: MatrixSpec, from: number, to: number): MatrixSpec {
  const columns = moved(spec.columns, from, to);
  if (columns === spec.columns) return spec;
  return {
    ...spec,
    columns,
    rows: spec.rows.map((row) => ({ ...row, cells: moved(row.cells, from, to) })),
  };
}

export function appendMatrixRow(spec: MatrixSpec, label: string): MatrixSpec {
  return {
    ...spec,
    rows: [
      ...spec.rows,
      { label, cells: spec.columns.map(() => emptyMatrixCell()) },
    ],
  };
}

export function removeMatrixRow(spec: MatrixSpec, index: number): MatrixSpec {
  if (spec.rows.length <= 1 || index < 0 || index >= spec.rows.length) return spec;
  return { ...spec, rows: spec.rows.filter((_, at) => at !== index) };
}

export function moveMatrixRow(spec: MatrixSpec, from: number, to: number): MatrixSpec {
  const rows = moved(spec.rows, from, to);
  return rows === spec.rows ? spec : { ...spec, rows };
}

export function blankMatrix(): MatrixSpec {
  const columns: MatrixColumn[] = [
    { label: "3-GEN", group: "GENBA KAIZEN" },
    { label: "3-MU", group: "GENBA KAIZEN" },
    { label: "7 Wastes", group: "GENBA KAIZEN" },
    { label: "KAIZEN", group: "GENBA KAIZEN" },
    { label: "Ringkas", group: "5R" },
    { label: "Rapi", group: "5R" },
    { label: "Resik", group: "5R" },
    { label: "Rawat", group: "5R" },
    { label: "Rajin", group: "5R" },
  ];
  const cells = (...values: string[]): MatrixCell[] =>
    columns.map((_, index) => emptyMatrixCell(values[index] ?? ""));
  return {
    kind: "matrix",
    title: "Skill Matrix",
    corner: "Name / Skill",
    columns,
    rows: [
      { label: "Amir", cells: cells("x", "", "x", "", "1") },
      { label: "Budi", cells: cells("", "x", "", "x", "2") },
      { label: "Hasan", cells: cells("x", "x", "", "", "") },
      { label: "Togop", cells: cells("", "", "x", "", "1") },
      { label: "Tuti", cells: cells("x", "", "", "x", "") },
    ],
    options: {
      ...defaultMatrixOptions(),
      headerDirection: "vertical",
      width: 900,
      height: 540,
    },
  };
}
