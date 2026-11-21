import { textWidth, wrapByWidth } from "@/lib/layout/text";
import {
  defaultMatrixOptions,
  type MatrixColumn,
  type MatrixRow,
  type MatrixSpec,
} from "@/lib/matrix/spec";
import { tooLarge, type Grid, type GridCell } from "@/lib/table/parse";

/**
 * A table, on a Studio sheet, is a `matrix` figure.
 *
 * A matrix already is a table: headings across the top (optionally under a
 * spanning heading), a heading down the left, a string in every cell, edited
 * in place and grown by whole rows and columns, exported with everything else.
 * So Studio's table is not a new notation. This file only turns a grid read
 * off the clipboard, a file or a pair of numbers into a `MatrixSpec` of the
 * right size — the first row becomes the column headings, the first column the
 * row headings — and nothing else knows a table exists.
 *
 * What a matrix does not have is carried over as closely as it can be: a
 * heading over several columns becomes a group, a merged cell keeps its words
 * in its first cell, and a fill the source gave a cell stays on that cell.
 * Columns share the width equally, which is the one thing a matrix cannot
 * vary.
 */

const FONT = 13;
const LINE = FONT * 1.28;
const PAD = 16;
const TITLE_GAP = 8;

/** The share of rows (or columns) a size is chosen for: the long outliers shrink their text instead. */
function percentile(values: number[], share: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** The size the figure needs so its text sits in its cells at full size. */
function sized(spec: MatrixSpec): MatrixSpec {
  const columns = Math.max(1, spec.columns.length);
  const labels = spec.rows.map((row) => row.label);
  const rowHeader = clamp(
    Math.ceil(Math.max(0, ...labels.map((label) => textWidth(label, FONT))) + 20),
    70,
    220,
  );
  const wide = spec.columns.map((_, at) =>
    percentile(spec.rows.map((row) => textWidth(row.cells[at]?.value ?? "", FONT)), 0.85),
  );
  const heads = spec.columns.map((column) => textWidth(column.label, FONT));
  const column = clamp(Math.ceil(Math.max(0, ...wide, ...heads) + 20), 56, 190);

  const lines = spec.rows.map((row) =>
    Math.max(
      1,
      wrapByWidth(row.label, rowHeader - 12, FONT).length,
      ...row.cells.map((cell) => wrapByWidth(cell.value, column - 12, FONT).length),
    ),
  );
  const rowHeight = clamp(Math.ceil(percentile(lines, 0.85) * LINE + 12), 30, 120);
  const headerLines = Math.max(
    1,
    ...spec.columns.map((head) => wrapByWidth(head.label, column - 12, FONT).length),
  );
  const headerHeight = clamp(Math.ceil(headerLines * LINE + 14), 32, 96);
  const hasGroups = spec.columns.some((head) => head.group.trim() !== "");
  const groupHeight = hasGroups ? Math.max(24, FONT * 1.65) : 0;
  const titleHeight = spec.title ? Math.max(26, FONT * 1.8) + TITLE_GAP : 0;
  return {
    ...spec,
    options: {
      ...spec.options,
      rowHeaderWidth: rowHeader,
      headerHeight,
      width: PAD * 2 + rowHeader + column * columns,
      height: Math.ceil(PAD * 2 + titleHeight + groupHeight + headerHeight + rowHeight * Math.max(1, spec.rows.length)),
    },
  };
}

function baseOptions() {
  return { ...defaultMatrixOptions(), style: "plain" as const, align: "left" as const, fontSize: FONT };
}

/**
 * A table read from a grid, or the sentence saying why it will not be drawn.
 *
 * The first row (the first two, when it spans columns and a second row sits
 * under it) is the heading, and the first column is the row heading. A first
 * row that is one cell merged across the whole table is its title. A table
 * of one column is drawn with an empty row heading beside it, and one with
 * only a heading row gets a single empty row to type into.
 */
export function tableFromGrid(grid: Grid): { spec: MatrixSpec } | { error: string } {
  const width = grid.rows[0]?.length ?? 0;
  if (grid.rows.length === 0 || width === 0) {
    return { error: "There is nothing in that table." };
  }
  const refusal = tooLarge(grid.rows.length, width);
  if (refusal) {
    return { error: refusal };
  }
  // a title merged across the whole width, over the headings, is the table's
  // title, not a heading over every column
  const spansAll = (line: GridCell[]) =>
    width > 1 &&
    line[0].wide &&
    line.every((cell) => cell.flow === line[0].flow) &&
    line.slice(1).every((cell) => cell.own === "");
  const titled = grid.rows.length >= 2 && spansAll(grid.rows[0]);
  const lines = titled ? grid.rows.slice(1) : grid.rows;
  const title = grid.caption || (titled ? grid.rows[0][0].own : "");
  // a first row that spans columns, with headings under it, groups them
  const grouped = lines.length >= 3 && lines[0].some((cell) => cell.wide);
  const head = grouped ? 1 : 0;
  const labelRow = lines[head];
  const body = lines.slice(head + 1);
  const single = width === 1;
  const first = single ? 0 : 1;

  const columns: MatrixColumn[] = [];
  for (let at = first; at < width; at += 1) {
    const colour = labelRow[at].color;
    columns.push({
      label: labelRow[at].own,
      group: grouped ? lines[0][at].flow : "",
      ...(colour ? { color: colour } : {}),
    });
  }
  const rows: MatrixRow[] = body.map((line) => ({
    label: single ? "" : line[0].own,
    ...(!single && line[0].color ? { color: line[0].color } : {}),
    cells: line.slice(first).map((cell) => ({ value: cell.own, ...(cell.color ? { color: cell.color } : {}) })),
  }));
  if (rows.length === 0) {
    rows.push({ label: "", cells: columns.map(() => ({ value: "" })) });
  }
  // the corner keeps its own words; only a heading merged down from the
  // group row into it lends its own
  const corner = single ? "" : labelRow[0].own || (grouped ? lines[0][0].flow : "");
  return {
    spec: sized({
      kind: "matrix",
      title,
      corner,
      columns,
      rows,
      options: baseOptions(),
    }),
  };
}

/** A blank table: headings numbered so the grid reads as one, cells empty. */
export function blankTable(rows: number, columns: number): MatrixSpec {
  const r = clamp(Math.floor(rows) || 1, 1, 50);
  const c = clamp(Math.floor(columns) || 1, 1, 20);
  return sized({
    kind: "matrix",
    title: "",
    corner: "",
    columns: Array.from({ length: c }, (_, at) => ({ label: `Column ${at + 1}`, group: "" })),
    rows: Array.from({ length: r }, (_, at) => ({
      label: `Row ${at + 1}`,
      cells: Array.from({ length: c }, () => ({ value: "" })),
    })),
    options: baseOptions(),
  });
}
