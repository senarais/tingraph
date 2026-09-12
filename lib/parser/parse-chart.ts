import { DSLError } from "@/lib/types";
import { tokenize, type Token, type TokenKind } from "@/lib/parser/tokens";
import {
  CHART_STYLES,
  PALETTES,
  defaultOptions,
  type ChartKind,
  type ChartOptions,
  type ChartPoint,
  type ChartSeries,
  type ChartSpec,
} from "@/lib/chart/spec";

/**
 * The chart half of the language.
 *
 * A chart block is a title, a run of settings, and a run of readings. Every
 * setting the panel on the sheet offers can be written here, and every setting
 * written here comes back out in the panel, because both sides work on the one
 * `ChartSpec`. A word that is not a setting is a reading, so a category called
 * `values` is written in quotes and everything else can be written plainly.
 */

const ON_OFF = new Set(["on", "off", "yes", "no", "true", "false"]);
const SETTINGS = new Set([
  "x",
  "y",
  "bars",
  "layout",
  "colors",
  "colours",
  "style",
  "legend",
  "values",
  "percent",
  "grid",
  "markers",
  "curve",
  "area",
  "trend",
  "donut",
  "range",
  "size",
  "categories",
  "series",
]);

const HEX = /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/;

class ChartParser {
  private pos = 0;
  private readonly options: ChartOptions;
  private readonly series: ChartSeries[] = [];
  private categories: string[] = [];
  /** readings written one to a line, which make up one unnamed series */
  private readonly plain: number[] = [];
  private plainPoints: ChartPoint[] = [];
  private sawPlain = false;

  constructor(
    private readonly tokens: Token[],
    private readonly kind: ChartKind,
  ) {
    this.options = defaultOptions(kind);
  }

  parse(): ChartSpec {
    const keyword = this.eat("id", `Expected "${this.kind}" to open the chart`);
    if (keyword.value !== this.kind) {
      throw new DSLError(
        `Expected "${this.kind}", got "${keyword.value}"`,
        keyword.line,
      );
    }
    const title = this.eat("string", "Expected a chart title in quotes");
    this.eat("lbrace", 'Expected "{" after the title');

    while (!this.peekIs("rbrace")) {
      if (this.pos >= this.tokens.length) {
        throw new DSLError('Missing closing "}"', keyword.line);
      }
      this.parseStatement();
    }
    this.advance();
    if (this.pos < this.tokens.length) {
      throw new DSLError(
        'Unexpected content after the closing "}"',
        this.tokens[this.pos].line,
      );
    }

    if (this.sawPlain) {
      // the readings written plainly are the chart's first series, named after
      // the value axis when the reader gave it a name
      const label = this.options.yTitle || "Value";
      if (this.kind === "scatter") {
        this.series.unshift({ label, points: this.plainPoints, values: [] });
      } else {
        this.series.unshift({ label, values: this.plain.slice() });
      }
    }

    if (this.kind !== "scatter" && this.categories.length === 0) {
      const longest = this.series.reduce(
        (most, entry) => Math.max(most, entry.values.length),
        0,
      );
      this.categories = Array.from({ length: longest }, (_, i) => String(i + 1));
    }
    // a short series is padded rather than refused: a half-typed chart still draws
    if (this.kind !== "scatter") {
      for (const entry of this.series) {
        while (entry.values.length < this.categories.length) {
          entry.values.push(0);
        }
        entry.values.length = this.categories.length;
      }
    }

    return {
      kind: this.kind,
      title: title.value,
      categories: this.categories,
      series: this.series,
      options: this.options,
    };
  }

  private parseStatement(): void {
    const tok = this.tokens[this.pos];
    if (tok.kind === "lparen") {
      this.plainPoints.push(this.parsePoint());
      this.sawPlain = true;
      return;
    }
    if (tok.kind === "id" && SETTINGS.has(tok.value)) {
      this.parseSetting(tok.value);
      return;
    }
    if (tok.kind === "id" || tok.kind === "string" || tok.kind === "number") {
      this.parseReading();
      return;
    }
    throw new DSLError(
      `Expected a reading such as "Apples 40", or a setting such as "legend bottom", got "${tok.value}"`,
      tok.line,
    );
  }

  /** One `Label 40` line: the label joins the categories, the number the series. */
  private parseReading(): void {
    if (this.kind === "scatter") {
      throw new DSLError(
        'A scatter plot is written as points: series "Name" (12, 40) (18, 55)',
        this.tokens[this.pos].line,
      );
    }
    const label = this.advance();
    const value = this.eat(
      "number",
      `Expected a number after "${label.value}", e.g. ${label.value} 40`,
    );
    this.categories.push(label.value);
    this.plain.push(Number(value.value));
    this.sawPlain = true;
  }

  private parseSetting(name: string): void {
    const tok = this.advance();
    switch (name) {
      case "x":
        this.options.xTitle = this.caption(tok);
        return;
      case "y":
        this.options.yTitle = this.caption(tok);
        return;
      case "bars":
        this.options.orientation = this.oneOf(tok, name, [
          "vertical",
          "horizontal",
        ]) as ChartOptions["orientation"];
        return;
      case "layout":
        this.options.layout = this.oneOf(tok, name, [
          "grouped",
          "stacked",
        ]) as ChartOptions["layout"];
        return;
      case "colors":
      case "colours":
        this.parsePalette(tok);
        return;
      case "style":
        this.options.style = this.oneOf(
          tok,
          name,
          CHART_STYLES.map((entry) => entry.id),
        ) as ChartOptions["style"];
        return;
      case "legend":
        this.options.legend = this.oneOf(tok, name, [
          "auto",
          "none",
          "right",
          "bottom",
          "top",
        ]) as ChartOptions["legend"];
        return;
      case "grid":
        this.options.grid = this.oneOf(tok, name, [
          "none",
          "value",
          "category",
          "both",
        ]) as ChartOptions["grid"];
        return;
      case "values":
        this.options.values = this.flag(tok, name);
        return;
      case "percent":
        this.options.percent = this.flag(tok, name);
        return;
      case "markers":
        this.options.markers = this.flag(tok, name);
        return;
      case "curve":
        this.options.curve = this.flag(tok, name);
        return;
      case "area":
        this.options.area = this.flag(tok, name);
        return;
      case "trend":
        this.options.trend = this.flag(tok, name);
        return;
      case "donut":
        this.options.donut = this.bounded(tok, name, 0, 0.9);
        return;
      case "range": {
        const low = this.number(tok, "range");
        const high = this.number(tok, "range");
        if (high <= low) {
          throw new DSLError(
            `"range" needs the smaller number first, e.g. range 0 250`,
            tok.line,
          );
        }
        this.options.min = low;
        this.options.max = high;
        return;
      }
      case "size": {
        this.options.width = this.bounded(tok, "size", 160, 2400);
        this.options.height = this.bounded(tok, "size", 120, 2400);
        return;
      }
      case "categories":
        this.parseCategories(tok);
        return;
      default:
        this.parseSeries(tok);
    }
  }

  private parsePalette(tok: Token): void {
    const next = this.tokens[this.pos];
    if (next?.kind === "string" && HEX.test(next.value)) {
      this.advance();
      this.options.palette = "single";
      this.options.color = next.value.toLowerCase();
      return;
    }
    this.options.palette = this.oneOf(
      tok,
      "colors",
      PALETTES.map((entry) => entry.id),
    ) as ChartOptions["palette"];
  }

  /**
   * `categories Mon Tue Wed`, and only what is written on that line: a category
   * may be a bare word or a number, so there is nothing else that could tell
   * the list from the statement under it. Writing `categories` again adds to
   * the same list.
   */
  private parseCategories(tok: Token): void {
    const names: string[] = [];
    while (this.labelAhead() && this.tokens[this.pos].line === tok.line) {
      names.push(this.advance().value);
    }
    if (names.length === 0) {
      throw new DSLError(
        '"categories" needs at least one name on the same line, e.g. categories Mon Tue Wed',
        tok.line,
      );
    }
    this.categories.push(...names);
  }

  private parseSeries(tok: Token): void {
    const name = this.eat(
      "string",
      'Expected a series name in quotes, e.g. series "Round 1" 10 20 12',
    );
    let color: string | undefined;
    if (this.peekIs("string") && HEX.test(this.tokens[this.pos].value)) {
      color = this.advance().value.toLowerCase();
    }
    if (this.kind === "scatter") {
      const points: ChartPoint[] = [];
      while (this.peekIs("lparen")) {
        points.push(this.parsePoint());
      }
      if (points.length === 0) {
        throw new DSLError(
          `Series "${name.value}" has no points, e.g. series "${name.value}" (12, 40) (18, 55)`,
          tok.line,
        );
      }
      this.series.push({ label: name.value, values: [], points, ...(color ? { color } : {}) });
      return;
    }
    const values: number[] = [];
    while (this.peekIs("number")) {
      values.push(Number(this.advance().value));
    }
    if (values.length === 0) {
      throw new DSLError(
        `Series "${name.value}" has no readings, e.g. series "${name.value}" 10 20 12`,
        tok.line,
      );
    }
    this.series.push({ label: name.value, values, ...(color ? { color } : {}) });
  }

  /** `(12, 40)`, optionally followed by the name of that one reading. */
  private parsePoint(): ChartPoint {
    const open = this.eat("lparen", "Expected a point, e.g. (12, 40)");
    const x = this.eat("number", "Expected the across value, e.g. (12, 40)");
    const y = this.eat("number", "Expected the up value, e.g. (12, 40)");
    this.eat("rparen", 'Expected ")" to close the point');
    const point: ChartPoint = { x: Number(x.value), y: Number(y.value) };
    if (this.peekIs("string")) {
      point.label = this.advance().value;
    }
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new DSLError("A point needs two plain numbers, e.g. (12, 40)", open.line);
    }
    return point;
  }

  // ------------------------------------------------------------- small parts

  private labelAhead(): boolean {
    const tok = this.tokens[this.pos];
    return (
      tok !== undefined &&
      (tok.kind === "id" || tok.kind === "number" || tok.kind === "string")
    );
  }

  private caption(tok: Token): string {
    return this.eat(
      "string",
      `"${tok.value}" needs a caption in quotes, e.g. ${tok.value} "Sales"`,
    ).value;
  }

  private oneOf(tok: Token, name: string, allowed: readonly string[]): string {
    const next = this.tokens[this.pos];
    if (!next || next.kind !== "id" || !allowed.includes(next.value)) {
      throw new DSLError(
        `"${name}" takes one of ${allowed.join(", ")}, e.g. ${name} ${allowed[0]}`,
        tok.line,
      );
    }
    this.advance();
    return next.value;
  }

  private flag(tok: Token, name: string): boolean {
    const next = this.tokens[this.pos];
    if (!next || next.kind !== "id" || !ON_OFF.has(next.value)) {
      throw new DSLError(`"${name}" takes on or off, e.g. ${name} on`, tok.line);
    }
    this.advance();
    return next.value === "on" || next.value === "yes" || next.value === "true";
  }

  private number(tok: Token, name: string): number {
    const next = this.eat("number", `"${name}" takes numbers, e.g. ${name} 0 250`);
    const value = Number(next.value);
    if (!Number.isFinite(value)) {
      throw new DSLError(`"${name}" takes plain numbers`, tok.line);
    }
    return value;
  }

  private bounded(tok: Token, name: string, low: number, high: number): number {
    const value = this.number(tok, name);
    if (value < low || value > high) {
      throw new DSLError(
        `"${name}" takes a number between ${low} and ${high}`,
        tok.line,
      );
    }
    return value;
  }

  private advance(): Token {
    if (this.pos >= this.tokens.length) {
      throw new DSLError("Unexpected end of input", 0);
    }
    return this.tokens[this.pos++];
  }

  private peekIs(kind: TokenKind): boolean {
    const tok = this.tokens[this.pos];
    return tok !== undefined && tok.kind === kind;
  }

  private eat(kind: TokenKind, message: string): Token {
    const tok = this.tokens[this.pos];
    if (tok === undefined || tok.kind !== kind) {
      throw new DSLError(message, tok?.line ?? 0);
    }
    return this.tokens[this.pos++];
  }
}

export function parseChart(code: string, kind: ChartKind): ChartSpec {
  return new ChartParser(tokenize(code), kind).parse();
}
