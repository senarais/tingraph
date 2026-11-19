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

export type ChartKind =
  | "bar"
  | "line"
  | "pie"
  | "scatter"
  | "histogram"
  | "area"
  | "waterfall"
  | "funnel"
  | "radar";

export const CHART_KINDS: ChartKind[] = [
  "bar",
  "line",
  "pie",
  "scatter",
  "histogram",
  "area",
  "waterfall",
  "funnel",
  "radar",
];

/**
 * The charts whose marks are bars. A histogram is a bar chart whose bars
 * stand on touching bins of one measured quantity, so it is drawn by the same
 * code and differs only where `isHistogram` says: no gap between the bars, an
 * outline between neighbours, one series, and upright bars only.
 */
export function hasBars(kind: ChartKind): boolean {
  return kind === "bar" || kind === "histogram";
}

/**
 * The charts that read one sequence of readings rather than series side by
 * side: a histogram's bins, a waterfall's steps to a total, a funnel's stages.
 * Each draws one series, so the language and the panel offer no second one.
 */
export function isSingleSeries(kind: ChartKind): boolean {
  return kind === "histogram" || kind === "waterfall" || kind === "funnel";
}

/**
 * The charts with no category axis along the bottom: a pie is a circle, a
 * funnel a stack of centred bars, a radar a wheel of axes. They draw their own
 * frame, and the axis captions and rules of the others do not apply.
 */
export function isAxisless(kind: ChartKind): boolean {
  return kind === "pie" || kind === "funnel" || kind === "radar";
}

/**
 * What one step of a waterfall is. A `change` floats from the running total to
 * the running total plus its reading. A `total` stands on zero and reaches the
 * running total, which it works out for itself — a subtotal is never written,
 * so it can never disagree with the steps above it. A `start` stands on zero
 * too but carries its own reading, and the running total starts again from it:
 * an opening balance.
 */
export type WaterfallStep = "change" | "total" | "start";

export function isChartKind(value: string): value is ChartKind {
  return (CHART_KINDS as string[]).includes(value);
}

/** Which way a bar chart's bars run. */
export type Orientation = "vertical" | "horizontal";

/** What a bar chart does with more than one series. */
export type BarLayout = "grouped" | "stacked";

/**
 * Where the key sits. `auto` is the default and puts one under the plot as
 * soon as there is more than one series, because colour alone must never be
 * the only thing telling them apart; `none` means none, and is the reader's to
 * choose even when there are several.
 */
export type LegendPlace = "auto" | "none" | "right" | "bottom" | "top";

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
  /** waterfall only: what each category is, in step with `categories` */
  steps?: WaterfallStep[];
}

/** A waterfall's steps, one per category, a missing one read as a change. */
export function stepsOf(spec: ChartSpec): WaterfallStep[] {
  return spec.categories.map((_, index) => spec.steps?.[index] ?? "change");
}

/**
 * Where every step of a waterfall starts and stops. A total's own reading is
 * the running total, so the values a total holds in the spec are ignored.
 */
export function waterfallRuns(spec: ChartSpec): Array<{ from: number; to: number; step: WaterfallStep }> {
  const values = spec.series[0]?.values ?? [];
  let running = 0;
  return stepsOf(spec).map((step, index) => {
    const value = values[index] ?? 0;
    if (step === "total") {
      return { from: 0, to: running, step };
    }
    if (step === "start") {
      running = value;
      return { from: 0, to: value, step };
    }
    const from = running;
    running += value;
    return { from, to: running, step };
  });
}

/**
 * A stacked area's readings, piled: for each series, where its band starts and
 * stops at every category. An overlapping area chart starts every band on zero.
 */
export function areaBands(spec: ChartSpec): Array<{ low: number[]; high: number[] }> {
  const stacked = spec.options.layout === "stacked";
  const piled = spec.categories.map(() => 0);
  return spec.series.map((series) =>
    spec.categories.map((_, at) => series.values[at] ?? 0),
  ).map((values) => {
    const low = stacked ? piled.slice() : spec.categories.map(() => 0);
    const high = values.map((value, at) => low[at] + value);
    if (stacked) high.forEach((value, at) => (piled[at] = value));
    return { low, high };
  });
}

/** The colours a waterfall tells its three kinds of step apart by. */
export const WATERFALL_COLOURS = {
  increase: "#2a78d6",
  decrease: "#eb6834",
} as const;

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
  options: { color: string },
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

/**
 * A colour taken `amount` of the way to paper: 0 leaves it alone, 1 is white.
 * What every washed fill on the sheet is mixed with, so a tint under black
 * writing stays readable and still prints.
 */
export function toPaper(hex: string, amount: number): string {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const mixed = [0, 2, 4]
    .map((at) => parseInt(full.slice(at, at + 2), 16))
    .map((channel) => Math.round(channel + (255 - channel) * amount))
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("");
  return `#${mixed}`;
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
    // a histogram's bars touch, so they are outlined or they run together
    style:
      kind === "pie" || kind === "funnel"
        ? "plain"
        : kind === "histogram" || kind === "radar"
          ? "framed"
          : "ruled",
    legend: "auto",
    // a waterfall and a funnel are read by their numbers, so they show them
    values: kind === "pie" || kind === "waterfall" || kind === "funnel",
    // a funnel's share is of its first stage, which is what conversion means
    percent: kind === "pie" || kind === "funnel",
    grid: kind === "pie" || kind === "funnel" ? "none" : "value",
    xTitle: "",
    yTitle: "",
    // an area is read by its bands; a dot on every reading only clutters them
    markers: kind !== "area",
    curve: false,
    // a radar is outlined by default, the formal way; area is its fill
    area: kind === "area",
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
  if (spec.options.legend !== "auto") {
    return spec.options.legend;
  }
  // a waterfall's colours mean increase, decrease and total, so it says which
  if (spec.kind === "waterfall") {
    return "bottom";
  }
  return spec.kind !== "pie" && spec.kind !== "funnel" && spec.series.length > 1
    ? "bottom"
    : "none";
}

/** Every number a chart holds, for working out where the value axis runs. */
export function allValues(spec: ChartSpec): number[] {
  if (spec.kind === "scatter") {
    return spec.series.flatMap((series) => (series.points ?? []).map((p) => p.y));
  }
  if (spec.kind === "waterfall") {
    return waterfallRuns(spec).flatMap((run) => [run.from, run.to]);
  }
  if (spec.kind === "area") {
    return areaBands(spec).flatMap((band) => [...band.low, ...band.high]);
  }
  if (hasBars(spec.kind) && spec.options.layout === "stacked") {
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
