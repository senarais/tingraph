/**
 * What a chart is, before anything draws it.
 *
 * A chart is not a graph of nodes and edges, so it does not travel through the
 * layout that flowcharts, BPMN diagrams and org charts share. It is a title,
 * a list of categories, a list of series, and a set of choices — and those
 * choices are the whole point: every one of them can be written in the source
 * and changed on the sheet, and the two always mean the same thing.
 *
 * Nothing here draws or measures. `layout-chart.ts` turns a spec into geometry
 * and `build-chart.ts` turns that into shapes, so all of this runs under `tsx`.
 */

export type ChartKind = "bar" | "line" | "pie" | "scatter";

export const CHART_KINDS: ChartKind[] = ["bar", "line", "pie", "scatter"];

export function isChartKind(value: string): value is ChartKind {
  return (CHART_KINDS as string[]).includes(value);
}

/** Which way a bar chart's bars run. */
export type Orientation = "vertical" | "horizontal";

/** What a bar chart does with more than one series. */
export type BarLayout = "grouped" | "stacked";

/** Where the key sits, or that there is none. */
export type LegendPlace = "none" | "right" | "bottom" | "top";

/** Which axis is ruled behind the marks. */
export type GridLines = "none" | "value" | "category" | "both";

export type PaletteId = "auto" | "single" | "colorful" | "warm" | "cool" | "ink";

export type ChartStyleId = "plain" | "ruled" | "framed" | "bold";

export interface ChartPoint {
  x: number;
  y: number;
  /** a name written beside this point, on a scatter plot */
  label?: string;
}

export interface ChartSeries {
  label: string;
  /** bar and line: one value per category, short lists padded with zero */
  values: number[];
  /** scatter: the cloud itself; `values` is unused */
  points?: ChartPoint[];
  /** a colour the reader pinned, which beats the palette */
  color?: string;
}

/**
 * Every choice a chart carries. One flat record on purpose: the source writes
 * it, the settings panel writes it, and both have to be able to name each
 * field without knowing which kind of chart is in front of them.
 */
export interface ChartOptions {
  /** bar: which way the bars run */
  orientation: Orientation;
  /** bar: side by side, or piled up */
  layout: BarLayout;
  /** which colours the marks take */
  palette: PaletteId;
  /** the one colour `single` uses, and the first colour of any palette */
  color: string;
  /** how much chrome is drawn around the plot */
  style: ChartStyleId;
  legend: LegendPlace;
  /** the value written on every mark */
  values: boolean;
  /** pie: values read as a share of the whole */
  percent: boolean;
  grid: GridLines;
  /** captions under and beside the plot */
  xTitle: string;
  yTitle: string;
  /** line: a dot at every reading */
  markers: boolean;
  /** line: the reading joined by a curve rather than a straight run */
  curve: boolean;
  /** line: a wash under the line */
  area: boolean;
  /** scatter: one straight line of best fit through the cloud */
  trend: boolean;
  /** pie: the hole in the middle, as a share of the radius */
  donut: number;
  /** where the value axis starts and stops, when the reader pins it */
  min: number | null;
  max: number | null;
  /** how big the chart is drawn, in sheet units */
  width: number;
  height: number;
}

export interface ChartSpec {
  kind: ChartKind;
  title: string;
  /** bar and line: the names along the category axis; pie: the slice names */
  categories: string[];
  series: ChartSeries[];
  options: ChartOptions;
}

// ------------------------------------------------------------------ colours

/**
 * The categorical hues, in the order they are handed out.
 *
 * Eight hues, validated as a set for colour-vision deficiency and for normal
 * vision against white paper: worst adjacent pair ΔE 9.1 under protanopia and
 * 19.6 in normal vision, which clears the 8 and 15 floors. The order is fixed.
 * A ninth series repeats the first hue rather than inventing one, and the
 * reader can pin a colour on any series to break the tie.
 */
export const CATEGORICAL = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
] as const;

const WARM = ["#e34948", "#eb6834", "#eda100", "#e87ba4", "#b4531f", "#7f1d1d"];
const COOL = ["#2a78d6", "#1baf7a", "#4a3aa7", "#0e7490", "#008300", "#64748b"];

export interface PaletteChoice {
  id: PaletteId;
  name: string;
  hint: string;
}

export const PALETTES: PaletteChoice[] = [
  { id: "auto", name: "Automatic", hint: "one colour, or one each when there are several" },
  { id: "single", name: "One colour", hint: "every mark the same" },
  { id: "colorful", name: "Colourful", hint: "eight hues, in order" },
  { id: "warm", name: "Warm", hint: "reds through to yellow" },
  { id: "cool", name: "Cool", hint: "blues through to green" },
  { id: "ink", name: "Ink", hint: "greys, for print" },
];

const INK_SCALE = ["#1e1e1e", "#555555", "#8a8a8a", "#b4b4b4", "#d4d4d4"];

/**
 * What `auto` comes out as.
 *
 * One series is one thing being measured, so it is drawn in one colour and the
 * title says what it is. Several series, or the slices of a pie, are several
 * things, and colour is what tells them apart — so those take the categorical
 * order. Writing `colors single` or `colors colorful` pins it either way.
 */
export function effectivePalette(spec: ChartSpec): PaletteId {
  if (spec.options.palette !== "auto") {
    return spec.options.palette;
  }
  if (spec.kind === "pie") {
    return "colorful";
  }
  return spec.series.length > 1 ? "colorful" : "single";
}

/**
 * The colour of one mark. A pinned series colour wins; after that the palette
 * decides, and `single` gives every mark the chart's own colour. `index` is
 * the mark's place in whatever the chart is telling apart: the series when
 * there are several, the category when there is one.
 */
export function markColor(
  palette: PaletteId,
  options: ChartOptions,
  index: number,
  pinned?: string,
): string {
  if (pinned) {
    return pinned;
  }
  switch (palette) {
    case "single":
      return options.color;
    case "auto":
      return options.color;
    case "warm":
      return WARM[index % WARM.length];
    case "cool":
      return COOL[index % COOL.length];
    case "ink":
      return INK_SCALE[index % INK_SCALE.length];
    default:
      return CATEGORICAL[index % CATEGORICAL.length];
  }
}

/** Whether a caption written on this colour should be white or near-black. */
export function readableOn(hex: string): string {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 150 ? "#ffffff" : "#1e1e1e";
}

// ------------------------------------------------------------------- styles

export interface ChartStyle {
  id: ChartStyleId;
  name: string;
  hint: string;
  /** a box round the whole plot, rather than two axis rules */
  frame: boolean;
  /** weight of the axis rules */
  axisWidth: number;
  /** weight of the outline round a filled mark; 0 leaves it unoutlined */
  markWidth: number;
}

/**
 * Four ways the same numbers can be drawn.
 *
 * `plain` and `ruled` leave a filled mark unoutlined and let a two-unit gap in
 * the paper do the separating, which is what keeps a chart of eight hues
 * readable. `framed` and `bold` draw the outline the way a textbook does; the
 * reader asks for that look, it is not the default.
 */
export const CHART_STYLES: ChartStyle[] = [
  {
    id: "plain",
    name: "Plain",
    hint: "two axis rules, nothing else",
    frame: false,
    axisWidth: 1,
    markWidth: 0,
  },
  {
    id: "ruled",
    name: "Ruled",
    hint: "hairline rules behind the marks",
    frame: false,
    axisWidth: 1,
    markWidth: 0,
  },
  {
    id: "framed",
    name: "Framed",
    hint: "a box round the plot, outlined marks",
    frame: true,
    axisWidth: 1,
    markWidth: 1,
  },
  {
    id: "bold",
    name: "Bold",
    hint: "thick outlines, the way a worksheet prints",
    frame: false,
    axisWidth: 2.5,
    markWidth: 2,
  },
];

export function chartStyle(id: ChartStyleId): ChartStyle {
  return CHART_STYLES.find((entry) => entry.id === id) ?? CHART_STYLES[1];
}

// ----------------------------------------------------------------- defaults

/** The chart's own colour when nothing else is said: the first categorical hue. */
export const DEFAULT_MARK = CATEGORICAL[0];

export function defaultOptions(kind: ChartKind): ChartOptions {
  return {
    orientation: "vertical",
    layout: "grouped",
    palette: "auto",
    color: DEFAULT_MARK,
    style: kind === "pie" ? "plain" : "ruled",
    legend: "none",
    values: kind === "pie",
    percent: kind === "pie",
    grid: kind === "pie" ? "none" : "value",
    xTitle: "",
    yTitle: "",
    markers: true,
    curve: false,
    area: false,
    trend: false,
    donut: 0,
    min: null,
    max: null,
    width: 520,
    height: 340,
  };
}

/**
 * A key is drawn whenever more than one series is on the sheet, because colour
 * alone must never be the only thing telling them apart. A pie names its
 * slices on the sheet, so it only needs one when the reader asks.
 */
export function legendFor(spec: ChartSpec): LegendPlace {
  if (spec.options.legend !== "none") {
    return spec.options.legend;
  }
  return spec.kind !== "pie" && spec.series.length > 1 ? "bottom" : "none";
}

/** Every number a chart holds, for working out where the value axis runs. */
export function allValues(spec: ChartSpec): number[] {
  if (spec.kind === "scatter") {
    return spec.series.flatMap((series) => (series.points ?? []).map((p) => p.y));
  }
  if (spec.kind === "bar" && spec.options.layout === "stacked") {
    return spec.categories.map((_, index) =>
      spec.series.reduce((sum, series) => sum + (series.values[index] ?? 0), 0),
    );
  }
  return spec.series.flatMap((series) => series.values);
}

/** A chart with nothing in it draws nothing, and the editor says so instead. */
export function isEmptyChart(spec: ChartSpec): boolean {
  return spec.kind === "scatter"
    ? spec.series.every((series) => (series.points ?? []).length === 0)
    : spec.categories.length === 0 || spec.series.length === 0;
}
