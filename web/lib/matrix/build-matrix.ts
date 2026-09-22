import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { marked } from "@/lib/canvas/units";
import { readableOn } from "@/lib/chart/spec";
import { MONOCHROME, type Ink } from "@/lib/ink";
import { wrapByWidth } from "@/lib/layout/compute-layout";
import { FORMAL, type SheetStyle } from "@/lib/sheet";
import type { MatrixSpec } from "@/lib/matrix/spec";

/** Geometry handed both to the renderer and to the canvas handles. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MatrixGroupBox {
  label: string;
  start: number;
  end: number;
  box: Rect;
}

export interface MatrixPlan {
  title: Rect;
  table: Rect;
  corner: Rect;
  groups: MatrixGroupBox[];
  columns: Rect[];
  rowHeaders: Rect[];
  cells: Rect[][];
}

const BASE = {
  fillStyle: "solid",
  strokeStyle: "solid",
  opacity: 100,
  roundness: null,
  angle: 0,
} as const;

const PAD = 16;
const TITLE_GAP = 8;
const MIN_COLUMN = 28;
const MIN_ROW_HEADER = 54;
const MIN_HEADER = 28;

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

export function toMatrixPaper(hex: string, amount: number): string {
  if (amount <= 0) return hex;
  const value = hex.replace("#", "");
  const full = value.length === 3
    ? value.split("").map((part) => part + part).join("")
    : value;
  return `#${[0, 2, 4]
    .map((at) => Number.parseInt(full.slice(at, at + 2), 16))
    .map((channel) => Math.round(channel + (255 - channel) * amount))
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Lay the matrix out without drawing it.
 *
 * Rows and columns always divide the same table rectangle, so adding content
 * never shifts an unrelated caption. A group is only a run of consecutive
 * columns with the same name; repeating a group later starts a new span.
 */
export function planMatrix(spec: MatrixSpec, at: Rect): MatrixPlan {
  const columnCount = Math.max(1, spec.columns.length);
  const rowCount = Math.max(1, spec.rows.length);
  const titleHeight = spec.title ? Math.max(26, spec.options.fontSize * 1.8) : 0;
  const table: Rect = {
    x: at.x + PAD,
    y: at.y + PAD + titleHeight + (titleHeight ? TITLE_GAP : 0),
    width: Math.max(120, at.width - PAD * 2),
    height: Math.max(90, at.height - PAD * 2 - titleHeight - (titleHeight ? TITLE_GAP : 0)),
  };
  const hasGroups = spec.columns.some((column) => column.group.trim() !== "");
  const groupHeight = hasGroups ? Math.max(24, spec.options.fontSize * 1.65) : 0;
  const maxHeader = Math.max(MIN_HEADER, table.height * 0.48 - groupHeight);
  const headerHeight = clamp(spec.options.headerHeight, MIN_HEADER, maxHeader);
  const bodyHeight = Math.max(24, table.height - groupHeight - headerHeight);
  const maxRowHeader = Math.max(
    MIN_ROW_HEADER,
    table.width - columnCount * MIN_COLUMN,
  );
  const rowHeaderWidth = clamp(
    spec.options.rowHeaderWidth,
    MIN_ROW_HEADER,
    maxRowHeader,
  );
  const bodyWidth = Math.max(MIN_COLUMN, table.width - rowHeaderWidth);
  const columnWidth = bodyWidth / columnCount;
  const rowHeight = bodyHeight / rowCount;
  const headingHeight = groupHeight + headerHeight;
  const corner: Rect = {
    x: table.x,
    y: table.y,
    width: rowHeaderWidth,
    height: headingHeight,
  };
  const columns = Array.from({ length: columnCount }, (_, index): Rect => ({
    x: table.x + rowHeaderWidth + columnWidth * index,
    y: table.y + groupHeight,
    width: columnWidth,
    height: headerHeight,
  }));
  const bodyY = table.y + headingHeight;
  const rowHeaders = Array.from({ length: rowCount }, (_, index): Rect => ({
    x: table.x,
    y: bodyY + rowHeight * index,
    width: rowHeaderWidth,
    height: rowHeight,
  }));
  const cells = Array.from({ length: rowCount }, (_, row) =>
    Array.from({ length: columnCount }, (_, column): Rect => ({
      x: table.x + rowHeaderWidth + columnWidth * column,
      y: bodyY + rowHeight * row,
      width: columnWidth,
      height: rowHeight,
    })),
  );

  const groups: MatrixGroupBox[] = [];
  if (hasGroups) {
    let start = 0;
    while (start < columnCount) {
      const label = spec.columns[start]?.group ?? "";
      let end = start;
      if (label.trim()) {
        while (end + 1 < columnCount && spec.columns[end + 1]?.group === label) {
          end += 1;
        }
      }
      groups.push({
        label,
        start,
        end,
        box: {
          x: table.x + rowHeaderWidth + columnWidth * start,
          y: table.y,
          width: columnWidth * (end - start + 1),
          height: groupHeight,
        },
      });
      start = end + 1;
    }
  }

  return {
    title: {
      x: at.x + PAD,
      y: at.y + PAD,
      width: Math.max(1, at.width - PAD * 2),
      height: titleHeight,
    },
    table,
    corner,
    groups,
    columns,
    rowHeaders,
    cells,
  };
}

interface Paper {
  font: number;
  lineHeight: number;
  roughness: number;
  unit: string;
  id: (part: string) => string;
}

function box(
  paper: Paper,
  rect: Rect,
  fill: string,
  stroke: string,
  width: number,
): ExcalidrawElementSkeleton {
  return {
    type: "rectangle",
    id: paper.id("box"),
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
    ...BASE,
    strokeColor: stroke,
    backgroundColor: fill,
    strokeWidth: width,
    roughness: paper.roughness,
    groupIds: [paper.unit],
    ...marked({ unit: paper.unit, kind: "figure" }),
  } as unknown as ExcalidrawElementSkeleton;
}

function rule(
  paper: Paper,
  from: { x: number; y: number },
  to: { x: number; y: number },
  stroke: string,
  width: number,
): ExcalidrawElementSkeleton {
  return {
    type: "line",
    id: paper.id("rule"),
    x: Math.round(from.x),
    y: Math.round(from.y),
    width: Math.abs(Math.round(to.x - from.x)),
    height: Math.abs(Math.round(to.y - from.y)),
    points: [
      [0, 0],
      [Math.round(to.x - from.x), Math.round(to.y - from.y)],
    ],
    ...BASE,
    strokeColor: stroke,
    backgroundColor: "transparent",
    strokeWidth: width,
    roughness: paper.roughness,
    startArrowhead: null,
    endArrowhead: null,
    groupIds: [paper.unit],
    ...marked({ unit: paper.unit, kind: "figure" }),
  } as unknown as ExcalidrawElementSkeleton;
}

function fitted(
  content: string,
  width: number,
  height: number,
  wanted: number,
): { lines: string; size: number } {
  if (!content) return { lines: "", size: wanted };
  for (let size = wanted; size >= 8; size -= 1) {
    const lines = wrapByWidth(content, Math.max(8, width), size);
    if (lines.length * size * 1.28 <= height) {
      return { lines: lines.join("\n"), size };
    }
  }
  const lines = wrapByWidth(content, Math.max(8, width), 8);
  const count = Math.max(1, Math.floor(height / (8 * 1.28)));
  if (lines.length > count) {
    const last = lines[count - 1] ?? "";
    lines[count - 1] = `${last.slice(0, Math.max(0, last.length - 1))}…`;
  }
  return { lines: lines.slice(0, count).join("\n"), size: 8 };
}

function caption(
  paper: Paper,
  content: string,
  rect: Rect,
  options: {
    size: number;
    color: string;
    align?: "left" | "center" | "right";
    vertical?: boolean;
  },
): ExcalidrawElementSkeleton | null {
  if (!content) return null;
  const vertical = Boolean(options.vertical);
  const fit = fitted(
    content,
    (vertical ? rect.height : rect.width) - 12,
    (vertical ? rect.width : rect.height) - 8,
    options.size,
  );
  const align = vertical ? "center" : (options.align ?? "center");
  const x = vertical || align === "center"
    ? rect.x + rect.width / 2
    : align === "left"
      ? rect.x + 7
      : rect.x + rect.width - 7;
  return {
    type: "text",
    id: paper.id("text"),
    text: fit.lines,
    x: Math.round(x),
    y: Math.round(rect.y + rect.height / 2),
    ...BASE,
    ...(vertical ? { angle: -Math.PI / 2 } : {}),
    strokeColor: options.color,
    backgroundColor: "transparent",
    strokeWidth: 1,
    roughness: paper.roughness,
    fontFamily: paper.font,
    fontSize: fit.size,
    lineHeight: paper.lineHeight,
    textAlign: align,
    verticalAlign: "middle",
    groupIds: [paper.unit],
    ...marked({ unit: paper.unit, kind: "figure" }),
  } as unknown as ExcalidrawElementSkeleton;
}

function headerFill(spec: MatrixSpec, color: string): string {
  switch (spec.options.style) {
    case "plain":
    case "heatmap":
      return "#ffffff";
    case "headers":
      return toMatrixPaper(color, 0.72);
    default:
      return color;
  }
}

function rowFill(spec: MatrixSpec, color: string): string {
  switch (spec.options.style) {
    case "plain":
    case "heatmap":
      return "#ffffff";
    case "headers":
      return toMatrixPaper(color, 0.72);
    default:
      return color;
  }
}

function cellFill(spec: MatrixSpec, row: number, own?: string): string {
  if (own) return own;
  if (spec.options.style === "heatmap") return spec.options.cellColor;
  if (spec.options.style === "banded" && row % 2 === 1) {
    return toMatrixPaper(spec.options.cellColor, 0.78);
  }
  return "#ffffff";
}

export function buildMatrixSkeletons(
  spec: MatrixSpec,
  at: Rect,
  _ink: Ink = MONOCHROME,
  sheet: SheetStyle = FORMAL,
  unit = "matrix-1",
): ExcalidrawElementSkeleton[] {
  void _ink;
  let next = 0;
  const paper: Paper = {
    font: sheet.fontFamily,
    lineHeight: sheet.lineHeight,
    roughness: sheet.roughness,
    unit,
    id: (part) => `${unit}-${part}-${next++}`,
  };
  const plan = planMatrix(spec, at);
  const { options } = spec;
  const out: ExcalidrawElementSkeleton[] = [
    {
      type: "rectangle",
      id: `${unit}-frame`,
      x: Math.round(at.x),
      y: Math.round(at.y),
      width: Math.round(at.width),
      height: Math.round(at.height),
      ...BASE,
      strokeColor: "transparent",
      backgroundColor: "transparent",
      strokeWidth: 1,
      roughness: 0,
      groupIds: [unit],
      ...marked({ unit, kind: "figure", core: true, figure: spec }),
    } as unknown as ExcalidrawElementSkeleton,
  ];
  const putCaption = (
    content: string,
    rect: Rect,
    fill: string,
    config: {
      size?: number;
      align?: "left" | "center" | "right";
      vertical?: boolean;
    } = {},
  ) => {
    const element = caption(paper, content, rect, {
      size: config.size ?? options.fontSize,
      color: readableOn(fill),
      align: config.align,
      vertical: config.vertical,
    });
    if (element) out.push(element);
  };

  if (spec.title) {
    const title = caption(paper, spec.title, plan.title, {
      size: options.fontSize + 4,
      color: options.gridColor,
      align: "center",
    });
    if (title) out.push(title);
  }

  const cornerFill = headerFill(spec, options.headerColor);
  out.push(box(paper, plan.corner, cornerFill, "transparent", 0.5));
  putCaption(spec.corner, plan.corner, cornerFill, { align: "center" });

  for (const group of plan.groups) {
    const own = spec.columns[group.start]?.color;
    const fill = headerFill(spec, own ?? options.headerColor);
    out.push(box(paper, group.box, fill, "transparent", 0.5));
    putCaption(group.label, group.box, fill, { size: options.fontSize + 1 });
  }

  plan.columns.forEach((rect, index) => {
    const column = spec.columns[index];
    const fill = column?.color
      ? column.color
      : headerFill(spec, options.headerColor);
    out.push(box(paper, rect, fill, "transparent", 0.5));
    putCaption(column?.label ?? "", rect, fill, {
      vertical: options.headerDirection === "vertical",
    });
  });

  plan.rowHeaders.forEach((rect, rowIndex) => {
    const row = spec.rows[rowIndex];
    const fill = row?.color ? row.color : rowFill(spec, options.rowHeaderColor);
    out.push(box(paper, rect, fill, "transparent", 0.5));
    putCaption(row?.label ?? "", rect, fill, { align: "left" });
    plan.cells[rowIndex].forEach((cellRect, columnIndex) => {
      const cell = row?.cells[columnIndex];
      const cellColour = cellFill(spec, rowIndex, cell?.color);
      out.push(box(paper, cellRect, cellColour, "transparent", 0.5));
      putCaption(cell?.value ?? "", cellRect, cellColour, { align: options.align });
    });
  });

  // Draw the grid once. Giving every cell an outline would stack two or three
  // strokes at a group boundary and make the selected border weight uneven.
  out.push(
    box(paper, plan.table, "transparent", options.gridColor, options.borderWidth),
    rule(
      paper,
      { x: plan.corner.x + plan.corner.width, y: plan.table.y },
      {
        x: plan.corner.x + plan.corner.width,
        y: plan.table.y + plan.table.height,
      },
      options.gridColor,
      options.borderWidth,
    ),
  );
  const groupHeight = plan.columns[0].y - plan.table.y;
  for (let index = 1; index < plan.columns.length; index += 1) {
    const before = spec.columns[index - 1]?.group ?? "";
    const after = spec.columns[index]?.group ?? "";
    const sameNamedGroup = before.trim() !== "" && before === after;
    const x = plan.columns[index].x;
    out.push(rule(
      paper,
      {
        x,
        y: sameNamedGroup ? plan.table.y + groupHeight : plan.table.y,
      },
      { x, y: plan.table.y + plan.table.height },
      options.gridColor,
      options.borderWidth,
    ));
  }
  if (groupHeight > 0) {
    out.push(rule(
      paper,
      {
        x: plan.corner.x + plan.corner.width,
        y: plan.table.y + groupHeight,
      },
      {
        x: plan.table.x + plan.table.width,
        y: plan.table.y + groupHeight,
      },
      options.gridColor,
      options.borderWidth,
    ));
  }
  const bodyTop = plan.rowHeaders[0].y;
  out.push(rule(
    paper,
    { x: plan.table.x, y: bodyTop },
    { x: plan.table.x + plan.table.width, y: bodyTop },
    options.gridColor,
    options.borderWidth,
  ));
  for (let index = 1; index < plan.rowHeaders.length; index += 1) {
    const y = plan.rowHeaders[index].y;
    out.push(rule(
      paper,
      { x: plan.table.x, y },
      { x: plan.table.x + plan.table.width, y },
      options.gridColor,
      options.borderWidth,
    ));
  }

  return out;
}
