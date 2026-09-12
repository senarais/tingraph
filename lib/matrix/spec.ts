import type { PaletteId } from "@/lib/chart/spec";
import type { FigureSize } from "@/lib/figures/spec";

/**
 * What a 2×2 matrix is.
 *
 * Two things are being weighed against each other, and the four quadrants are
 * the four answers. The axes are not measured — nothing is plotted against a
 * scale — so each one is a name and its two ends, and that is all a matrix
 * needs to be read. Items may be dropped into the field on top of the
 * quadrants when the reader wants to place actual work rather than only name
 * the four cases.
 *
 * The corners are named the way they are drawn: `x.low` is the left end and
 * `x.high` the right, `y.low` the bottom and `y.high` the top.
 */

export type MatrixStyleId = "plain" | "filled" | "boxed" | "cards";

export interface MatrixStyle {
  id: MatrixStyleId;
  name: string;
  hint: string;
  /** the quadrants carry their colour as a fill rather than an outline */
  fill: boolean;
  /** how far the fill is taken back towards paper; 0 is the full colour */
  wash: number;
  /** a box drawn round all four quadrants */
  frame: boolean;
  /** weight of the two rules that cross the middle */
  axisWidth: number;
  /** the gap the quadrants leave around those rules */
  gap: number;
}

export const MATRIX_STYLES: MatrixStyle[] = [
  {
    id: "plain",
    name: "Plain",
    hint: "outlined quadrants, a plain cross",
    fill: false,
    wash: 0,
    frame: false,
    axisWidth: 1.5,
    gap: 0,
  },
  {
    id: "filled",
    name: "Filled",
    hint: "solid quadrants, a heavy cross through them",
    fill: true,
    wash: 0,
    frame: false,
    axisWidth: 3,
    gap: 10,
  },
  {
    id: "boxed",
    name: "Boxed",
    hint: "one box, four fills, the axis names in tabs",
    fill: true,
    wash: 0,
    frame: true,
    axisWidth: 1.5,
    gap: 0,
  },
  {
    id: "cards",
    name: "Cards",
    hint: "pale quadrants under arrows, for placing work",
    fill: true,
    wash: 0.82,
    frame: false,
    axisWidth: 2,
    gap: 12,
  },
];

export function matrixStyle(id: MatrixStyleId): MatrixStyle {
  return MATRIX_STYLES.find((entry) => entry.id === id) ?? MATRIX_STYLES[0];
}

/** How the two rules through the middle are drawn. */
export type MatrixAxisStyle = "cross" | "arrows" | "tabs" | "none";

export interface MatrixAxis {
  /** what the axis is called, written beside the middle of it */
  label: string;
  /** the left end, or the bottom one */
  low: string;
  /** the right end, or the top one */
  high: string;
}

export interface MatrixQuadrant {
  label: string;
  /** a second line under the name, for what the quadrant means */
  note: string;
  color?: string;
}

/** One thing placed in the field, at a share of the way across and up. */
export interface MatrixItem {
  label: string;
  x: number;
  y: number;
}

export interface MatrixOptions extends FigureSize {
  style: MatrixStyleId;
  axis: MatrixAxisStyle;
  palette: PaletteId;
  color: string;
  /** the quadrant names sit in the quadrants, or outside the corners */
  labels: "inside" | "corner";
  fontSize: number;
}

export interface MatrixSpec {
  kind: "matrix";
  title: string;
  x: MatrixAxis;
  y: MatrixAxis;
  /** top left, top right, bottom left, bottom right, in that order */
  quadrants: [MatrixQuadrant, MatrixQuadrant, MatrixQuadrant, MatrixQuadrant];
  items: MatrixItem[];
  options: MatrixOptions;
}

export const QUADRANT_NAMES = ["Top left", "Top right", "Bottom left", "Bottom right"];

export function defaultMatrixOptions(): MatrixOptions {
  return {
    style: "plain",
    axis: "cross",
    palette: "single",
    color: "#2a78d6",
    labels: "inside",
    fontSize: 13,
    width: 560,
    height: 480,
  };
}

export function blankMatrix(): MatrixSpec {
  return {
    kind: "matrix",
    title: "Priorities",
    x: { label: "Value", low: "Low value", high: "High value" },
    y: { label: "Effort", low: "High effort", high: "Low effort" },
    quadrants: [
      { label: "Do later", note: "" },
      { label: "Do now", note: "" },
      { label: "Don't do", note: "" },
      { label: "Do next", note: "" },
    ],
    items: [],
    options: defaultMatrixOptions(),
  };
}
