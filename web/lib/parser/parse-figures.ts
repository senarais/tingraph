import { DSLError } from "@/lib/types";
import { tokenize, type Token } from "@/lib/parser/tokens";
import {
  defaultGanttOptions,
  ganttHeight,
  ganttRows,
  type GanttSpec,
} from "@/lib/gantt/spec";
import { HEX, Reader } from "@/lib/parser/reader";
import {
  MATRIX_STYLES,
  defaultMatrixOptions,
  fitMatrixRow,
  type MatrixSpec,
} from "@/lib/matrix/spec";
import { VENN_STYLES, defaultVennOptions, type VennSpec } from "@/lib/venn/spec";
import {
  QUADRANT_CORNERS,
  QUADRANT_STYLES,
  blankQuadrant,
  type QuadrantCorner,
  type QuadrantSpec,
} from "@/lib/quadrant/spec";
import {
  FISHBONE_STYLES,
  defaultFishboneOptions,
  type FishboneBone,
  type FishboneSpec,
} from "@/lib/fishbone/spec";
import {
  PRISMA_STYLES,
  defaultPrismaOptions,
  type PrismaBox,
  type PrismaLine,
  type PrismaSpec,
  type PrismaStep,
} from "@/lib/prisma/spec";

/**
 * The matrix, the Venn diagram, the fishbone and the PRISMA flow, written down.
 *
 * Four small grammars rather than one general one, because the four say
 * genuinely different things: a matrix names rows, columns and their cells, a
 * Venn names its sets and what falls in each region between them, a fishbone
 * is a nest of causes, and a PRISMA flow is a run of rows with what left the
 * review beside each one. What they share is `lib/parser/reader.ts`, and
 * nothing else.
 */

// ------------------------------------------------------------------- matrix

class MatrixParser extends Reader {
  parse(): MatrixSpec {
    const { title, line } = this.open("matrix");
    const options = defaultMatrixOptions();
    const spec: MatrixSpec = {
      kind: "matrix",
      title,
      corner: "",
      columns: [],
      rows: [],
      options,
    };

    while (!this.peekIs("rbrace")) {
      if (this.pos >= this.tokens.length) {
        throw new DSLError('Missing closing "}"', line);
      }
      const tok = this.advance();
      if (tok.kind !== "id") {
        throw new DSLError(
          `Expected "column", "row", "corner", or a setting, got "${tok.value}"`,
          tok.line,
        );
      }
      const name = tok.value;
      if (name === "column") {
        const column = {
          label: this.eat("string", 'A column is written column "Name" "Optional group"')
            .value,
          group: "",
          color: undefined as string | undefined,
        };
        if (this.peekIs("string")) {
          const next = this.advance();
          if (HEX.test(next.value)) column.color = next.value.toLowerCase();
          else column.group = next.value;
        }
        if (this.peekIs("string") && HEX.test(this.peek()!.value)) {
          column.color = this.advance().value.toLowerCase();
        }
        spec.columns.push(column);
        continue;
      }
      if (name === "row") {
        const row = {
          label: this.eat("string", 'A row is written row "Name" { ... }').value,
          color: undefined as string | undefined,
          cells: [] as Array<{ value: string; color?: string }>,
        };
        if (this.peekIs("lbrace")) {
          const opened = this.advance().line;
          while (!this.peekIs("rbrace")) {
            if (this.pos >= this.tokens.length) {
              throw new DSLError(`Missing "}" for row "${row.label}"`, opened);
            }
            const part = this.eat(
              "id",
              `A row contains cell "value" lines and an optional color setting`,
            );
            if (part.value === "color") {
              row.color = this.colour("color", part.line);
            } else if (part.value === "cell") {
              const value = this.eat("string", 'A cell is written cell "anything"').value;
              const color = this.peekIs("string") && HEX.test(this.peek()!.value)
                ? this.advance().value.toLowerCase()
                : undefined;
              row.cells.push({ value, ...(color ? { color } : {}) });
            } else {
              throw new DSLError(
                `"${part.value}" is not a row setting; use cell "value" or color "#rrggbb"`,
                part.line,
              );
            }
          }
          this.advance();
        } else {
          while (this.peekIs("string")) {
            row.cells.push({ value: this.advance().value });
          }
        }
        spec.rows.push(row);
        continue;
      }
      switch (name) {
        case "corner":
          spec.corner = this.eat("string", '"corner" takes a caption in quotes').value;
          break;
        case "style":
          options.style = this.word(
            tok,
            "style",
            MATRIX_STYLES.map((entry) => entry.id),
          ) as MatrixSpec["options"]["style"];
          break;
        case "header":
          options.headerDirection = this.word(tok, "header", [
            "horizontal",
            "vertical",
          ]) as MatrixSpec["options"]["headerDirection"];
          break;
        case "align":
          options.align = this.word(tok, "align", [
            "left",
            "center",
            "right",
          ]) as MatrixSpec["options"]["align"];
          break;
        case "header-color":
          options.headerColor = this.colour(name, tok.line);
          break;
        case "row-color":
          options.rowHeaderColor = this.colour(name, tok.line);
          break;
        case "cell-color":
          options.cellColor = this.colour(name, tok.line);
          break;
        case "grid-color":
          options.gridColor = this.colour(name, tok.line);
          break;
        case "border":
          options.borderWidth = this.amount(tok, "border", 0.5, 6);
          break;
        case "row-header":
          options.rowHeaderWidth = this.amount(tok, "row-header", 48, 800);
          break;
        case "header-height":
          options.headerHeight = this.amount(tok, "header-height", 28, 500);
          break;
        case "text":
          options.fontSize = this.amount(tok, "text", 8, 32);
          break;
        case "size":
          options.width = this.amount(tok, "size", 240, 2400);
          options.height = this.amount(tok, "size", 180, 2400);
          break;
        default:
          throw new DSLError(`"${name}" is not a matrix setting`, tok.line);
      }
    }
    this.close(line);
    if (spec.columns.length === 0) {
      spec.columns.push({ label: "Column 1", group: "" });
    }
    if (spec.rows.length === 0) {
      spec.rows.push({ label: "Row 1", cells: [] });
    }
    const tooWide = spec.rows.find((row) => row.cells.length > spec.columns.length);
    if (tooWide) {
      throw new DSLError(
        `Row "${tooWide.label}" has ${tooWide.cells.length} cells but the matrix has ${spec.columns.length} columns`,
        line,
      );
    }
    spec.rows = spec.rows.map((row) => fitMatrixRow(row, spec.columns.length));
    return spec;
  }

  private colour(name: string, line: number): string {
    const value = this.eat("string", `"${name}" takes a quoted hex colour`).value;
    if (!HEX.test(value)) {
      throw new DSLError(`"${name}" takes a hex colour such as "#2a78d6"`, line);
    }
    return value.toLowerCase();
  }
}

// --------------------------------------------------------------------- venn

const REGIONS = new Set(["A", "B", "C", "AB", "AC", "BC", "ABC", "out"]);

/**
 * `quadrant "Title" { x "Effort" "Low" "High"  top-left "Quick wins"  item "Login" 30 80 }`.
 * An axis is its name and then the words at its low and high ends; a quarter
 * is named by its corner; an item is plotted at a share of each axis, 0 to 100.
 */
class QuadrantParser extends Reader {
  parse(): QuadrantSpec {
    const { title, line } = this.open("quadrant");
    const spec = blankQuadrant();
    spec.title = title;
    spec.quarters = {};
    spec.x = { label: "", low: "", high: "" };
    spec.y = { label: "", low: "", high: "" };
    while (!this.peekIs("rbrace")) {
      const tok = this.peek();
      if (!tok) {
        throw new DSLError(`Missing closing "}" for the block opened on line ${line}`, line);
      }
      if (tok.kind !== "id") {
        throw new DSLError(
          `Expected an axis, a quarter or an item, e.g. top-left "Quick wins", got "${tok.value}"`,
          tok.line,
        );
      }
      this.advance();
      if (tok.value === "x" || tok.value === "y") {
        const label = this.eat("string", `"${tok.value}" takes the axis name, then its low and high ends, e.g. ${tok.value} "Effort" "Low" "High"`).value;
        const low = this.peekIs("string") ? this.advance().value : "";
        const high = this.peekIs("string") ? this.advance().value : "";
        spec[tok.value] = { label, low, high };
      } else if ((QUADRANT_CORNERS as string[]).includes(tok.value)) {
        spec.quarters[tok.value as QuadrantCorner] = this.eat(
          "string",
          `"${tok.value}" takes a caption in quotes, e.g. ${tok.value} "Quick wins"`,
        ).value;
      } else if (tok.value === "item") {
        const label = this.eat("string", 'An item is written item "Name" across up, e.g. item "Login" 30 80').value;
        const x = this.amount(tok, "item", 0, 100);
        const y = this.amount(tok, "item", 0, 100);
        spec.items.push({ label, x, y });
      } else if (tok.value === "style") {
        spec.options.style = this.word(tok, "style", QUADRANT_STYLES.map((entry) => entry.id)) as QuadrantSpec["options"]["style"];
      } else if (tok.value === "color" || tok.value === "colour") {
        const hex = this.eat("string", `"${tok.value}" takes a colour in quotes, e.g. ${tok.value} "#2a78d6"`);
        if (!HEX.test(hex.value)) {
          throw new DSLError(`"${hex.value}" is not a colour; write it as "#2a78d6"`, hex.line);
        }
        spec.options.color = hex.value.toLowerCase();
      } else if (tok.value === "text") {
        spec.options.fontSize = this.amount(tok, "text", 9, 22);
      } else if (tok.value === "size") {
        spec.options.width = this.amount(tok, "size", 280, 2400);
        spec.options.height = this.amount(tok, "size", 240, 2400);
      } else {
        throw new DSLError(
          `"${tok.value}" is not part of a quadrant — write x, y, top-left, top-right, bottom-left, bottom-right, item, style, color, text or size`,
          tok.line,
        );
      }
    }
    this.close(line);
    return spec;
  }
}

/**
 * `gantt "Plan" { unit "Week"  section "Research"  task T1 "Survey" 1 3  task T2 "Write" after T1 2 done 40
 * milestone M1 "Submit" after T2 }`. A task starts in a unit, or after other tasks,
 * and lasts a whole number of units; a milestone lasts none.
 */
class GanttParser extends Reader {
  parse(): GanttSpec {
    const { title, line } = this.open("gantt");
    const spec: GanttSpec = { kind: "gantt", title, sections: [], tasks: [], options: defaultGanttOptions() };
    let sized = false;
    const lines = new Map<string, number>();
    while (!this.peekIs("rbrace")) {
      const tok = this.peek();
      if (!tok) {
        throw new DSLError(`Missing closing "}" for the block opened on line ${line}`, line);
      }
      if (tok.kind !== "id") {
        throw new DSLError(`Expected a section, a task or a milestone, e.g. task T1 "Survey" 1 3, got "${tok.value}"`, tok.line);
      }
      this.advance();
      switch (tok.value) {
        case "section":
          spec.sections.push(this.eat("string", 'A section is written section "Name"').value);
          break;
        case "task":
        case "milestone": {
          const milestone = tok.value === "milestone";
          const id = this.eat("id", `Expected an id after "${tok.value}", e.g. ${tok.value} T1 "Name"`);
          if (lines.has(id.value)) {
            throw new DSLError(`Duplicate id "${id.value}"`, id.line);
          }
          lines.set(id.value, id.line);
          const label = this.peekIs("string") ? this.advance().value : id.value;
          let start: number | null = null;
          const after: string[] = [];
          if (this.peek()?.kind === "id" && this.peek()?.value === "after") {
            const word = this.advance();
            // the tasks it follows are the ids on the same line, up to `done`
            while (
              this.peek()?.kind === "id" &&
              this.peek()?.line === word.line &&
              this.peek()?.value !== "done"
            ) {
              after.push(this.advance().value);
            }
            if (after.length === 0) {
              throw new DSLError(`"after" names the tasks it follows, e.g. after T1`, tok.line);
            }
          } else {
            start = this.whole(tok, `${tok.value} ${id.value} needs the unit it starts in, e.g. ${tok.value} ${id.value} "${label}" 1${milestone ? "" : " 3"}, or after another task`, 1);
          }
          const length = milestone
            ? 0
            : this.whole(tok, `task ${id.value} needs how many units it lasts, e.g. task ${id.value} "${label}" ${start ?? `after ${after.join(" ")}`} 3`, 1);
          let done = 0;
          if (this.peek()?.kind === "id" && this.peek()?.value === "done") {
            if (milestone) {
              throw new DSLError("A milestone is reached or not; it has no share done", tok.line);
            }
            this.advance();
            done = this.amount(tok, "done", 0, 100);
          }
          spec.tasks.push({ id: id.value, label, section: spec.sections.length - 1, start, after, length, done });
          break;
        }
        case "unit":
          spec.options.unit = this.eat("string", 'unit takes a word in quotes, e.g. unit "Week"').value;
          break;
        case "today":
          spec.options.today = this.whole(tok, "today takes the unit the chart is read in, e.g. today 6", 1);
          break;
        case "color":
        case "colour": {
          const hex = this.eat("string", `"${tok.value}" takes a colour in quotes, e.g. ${tok.value} "#2a78d6"`);
          if (!HEX.test(hex.value)) {
            throw new DSLError(`"${hex.value}" is not a colour; write it as "#2a78d6"`, hex.line);
          }
          spec.options.color = hex.value.toLowerCase();
          break;
        }
        case "text":
          spec.options.fontSize = this.amount(tok, "text", 9, 20);
          break;
        case "size":
          spec.options.width = this.amount(tok, "size", 320, 3000);
          spec.options.height = this.amount(tok, "size", 160, 3000);
          sized = true;
          break;
        default:
          throw new DSLError(
            `"${tok.value}" is not part of a Gantt chart — write section, task, milestone, unit, today, color, text or size`,
            tok.line,
          );
      }
    }
    this.close(line);

    // every task it follows exists, and following never comes back round
    const ids = new Set(spec.tasks.map((task) => task.id));
    for (const task of spec.tasks) {
      for (const id of task.after) {
        if (!ids.has(id)) {
          throw new DSLError(`${task.id} starts after "${id}", which is not a task here`, lines.get(task.id) ?? line);
        }
      }
    }
    const byId = new Map(spec.tasks.map((task) => [task.id, task]));
    for (const task of spec.tasks) {
      const seen = new Set<string>();
      const walk = (id: string): void => {
        if (id === task.id && seen.size > 0) {
          throw new DSLError(`${task.id} ends up starting after itself; a schedule cannot loop`, lines.get(task.id) ?? line);
        }
        if (seen.has(id)) return;
        seen.add(id);
        for (const next of byId.get(id)?.after ?? []) walk(next);
      };
      for (const next of task.after) walk(next);
    }
    if (!sized) {
      spec.options.height = ganttHeight(ganttRows(spec).length, Boolean(spec.title));
    }
    return spec;
  }

  /** A whole number of units, at least `least`. */
  private whole(tok: Token, message: string, least: number): number {
    const next = this.peek();
    if (!next || next.kind !== "number" || !Number.isInteger(Number(next.value)) || Number(next.value) < least) {
      throw new DSLError(message, next?.line ?? tok.line);
    }
    this.advance();
    return Number(next.value);
  }
}

class VennParser extends Reader {
  parse(): VennSpec {
    const { title, line } = this.open("venn");
    const options = defaultVennOptions();
    const spec: VennSpec = {
      kind: "venn",
      title,
      sets: [],
      regions: {},
      options,
    };

    while (!this.peekIs("rbrace")) {
      if (this.pos >= this.tokens.length) {
        throw new DSLError('Missing closing "}"', line);
      }
      const tok = this.advance();
      if (tok.kind !== "id") {
        throw new DSLError(
          `Expected a set, a region such as "AB", or a setting, got "${tok.value}"`,
          tok.line,
        );
      }
      const name = tok.value;
      if (name === "set") {
        // the letter is optional and only ever confirms what the order already
        // says, but writing it makes the regions below obvious
        const letter = this.peek();
        if (letter?.kind === "id" && /^[ABC]$/.test(letter.value)) {
          const expected = "ABC".charAt(spec.sets.length);
          if (letter.value !== expected) {
            throw new DSLError(
              `Sets are declared in order, so this one is "${expected}"`,
              letter.line,
            );
          }
          this.advance();
        }
        const label = this.eat(
          "string",
          'A set is written set A "Name", or set "Name"',
        ).value;
        const colour =
          this.peekIs("string") && HEX.test(this.peek()!.value)
            ? this.advance().value.toLowerCase()
            : undefined;
        spec.sets.push({ label, ...(colour ? { color: colour } : {}) });
        continue;
      }
      if (REGIONS.has(name)) {
        spec.regions[name] = this.eat(
          "string",
          `Region "${name}" takes what is in it, in quotes`,
        ).value;
        continue;
      }
      switch (name) {
        case "style":
          options.style = this.word(
            tok,
            "style",
            VENN_STYLES.map((entry) => entry.id),
          ) as VennSpec["options"]["style"];
          break;
        case "overlap":
          options.overlap = this.amount(tok, "overlap", 0.05, 0.9);
          break;
        case "zeros":
          options.zeros = this.flag(tok, "zeros");
          break;
        case "colors":
        case "colours": {
          const picked = this.palette(tok);
          options.palette = picked.palette as VennSpec["options"]["palette"];
          if (picked.color) {
            options.color = picked.color;
          }
          break;
        }
        case "text":
          options.fontSize = this.amount(tok, "text", 8, 32);
          break;
        case "size":
          options.width = this.amount(tok, "size", 200, 2400);
          options.height = this.amount(tok, "size", 160, 2400);
          break;
        default:
          throw new DSLError(
            `"${name}" is not a Venn setting, and not a region — regions are A, B, C, AB, AC, BC, ABC and out`,
            tok.line,
          );
      }
    }
    this.close(line);
    if (spec.sets.length < 2) {
      spec.sets = [{ label: "Set A" }, { label: "Set B" }, ...spec.sets].slice(0, 2);
    }
    spec.sets = spec.sets.slice(0, 3);
    return spec;
  }
}

// ----------------------------------------------------------------- fishbone

class FishboneParser extends Reader {
  parse(): FishboneSpec {
    const { title, line } = this.open("fishbone");
    const options = defaultFishboneOptions();
    const spec: FishboneSpec = { kind: "fishbone", title, bones: [], options };

    while (!this.peekIs("rbrace")) {
      if (this.pos >= this.tokens.length) {
        throw new DSLError('Missing closing "}"', line);
      }
      const tok = this.advance();
      if (tok.kind !== "id") {
        throw new DSLError(
          `Expected "bone" or a setting, got "${tok.value}"`,
          tok.line,
        );
      }
      if (tok.value === "bone") {
        spec.bones.push(this.parseBone());
        continue;
      }
      switch (tok.value) {
        case "style":
          options.style = this.word(
            tok,
            "style",
            FISHBONE_STYLES.map((entry) => entry.id),
          ) as FishboneSpec["options"]["style"];
          break;
        case "head":
          options.head = this.word(tok, "head", [
            "arrow",
            "box",
            "curve",
          ]) as FishboneSpec["options"]["head"];
          break;
        case "arrows":
          options.arrows = this.flag(tok, "arrows");
          break;
        case "angle":
          options.angle = this.amount(tok, "angle", 25, 80);
          break;
        case "colors":
        case "colours": {
          const picked = this.palette(tok);
          options.palette = picked.palette as FishboneSpec["options"]["palette"];
          if (picked.color) {
            options.color = picked.color;
          }
          break;
        }
        case "text":
          options.fontSize = this.amount(tok, "text", 8, 28);
          break;
        case "size":
          options.width = this.amount(tok, "size", 240, 2400);
          options.height = this.amount(tok, "size", 160, 2400);
          break;
        default:
          throw new DSLError(`"${tok.value}" is not a fishbone setting`, tok.line);
      }
    }
    this.close(line);
    return spec;
  }

  private parseBone(): FishboneBone {
    const label = this.eat("string", 'A bone is written bone "Material" { … }').value;
    const colour =
      this.peekIs("string") && HEX.test(this.peek()!.value)
        ? this.advance().value.toLowerCase()
        : undefined;
    const bone: FishboneBone = {
      label,
      causes: [],
      ...(colour ? { color: colour } : {}),
    };
    if (!this.peekIs("lbrace")) {
      return bone;
    }
    const opened = this.advance().line;
    while (!this.peekIs("rbrace")) {
      if (this.pos >= this.tokens.length) {
        throw new DSLError(`Missing "}" for bone "${label}"`, opened);
      }
      const cause = this.eat("string", `A cause on "${label}" is written in quotes`);
      const deeper: string[] = [];
      if (this.peekIs("lbrace")) {
        const nested = this.advance().line;
        while (!this.peekIs("rbrace")) {
          if (this.pos >= this.tokens.length) {
            throw new DSLError(`Missing "}" under "${cause.value}"`, nested);
          }
          deeper.push(
            this.eat("string", `What is behind "${cause.value}" is written in quotes`)
              .value,
          );
        }
        this.advance();
      }
      bone.causes.push({ label: cause.value, causes: deeper });
    }
    this.advance();
    return bone;
  }
}

// ------------------------------------------------------------------- prisma

class PrismaParser extends Reader {
  parse(): PrismaSpec {
    const { title, line } = this.open("prisma");
    const options = defaultPrismaOptions();
    const steps: PrismaStep[] = [];
    let band = "";
    let last: PrismaStep | null = null;

    while (!this.peekIs("rbrace")) {
      if (this.pos >= this.tokens.length) {
        throw new DSLError('Missing closing "}"', line);
      }
      const tok = this.advance();
      if (tok.kind !== "id") {
        throw new DSLError(
          `Expected "band", "row", "side" or a setting, got "${tok.value}"`,
          tok.line,
        );
      }
      if (tok.value === "band") {
        band = this.eat("string", 'A band is written band "Identification"').value;
        // a side box belongs to the row above it, and a band ends that row
        last = null;
        continue;
      }
      if (tok.value === "row") {
        const step: PrismaStep = { band, ...this.parseBox("row") };
        steps.push(step);
        last = step;
        continue;
      }
      if (tok.value === "side") {
        if (!last) {
          throw new DSLError(
            'A side box follows the row it belongs to, e.g. row "Records screened" 955 then side "Records excluded" 812',
            tok.line,
          );
        }
        if (last.side) {
          throw new DSLError(
            `"${last.title}" already has a side box; a row has one`,
            tok.line,
          );
        }
        last.side = this.parseBox("side");
        continue;
      }
      switch (tok.value) {
        case "style":
          options.style = this.word(
            tok,
            "style",
            PRISMA_STYLES.map((entry) => entry.id),
          ) as PrismaSpec["options"]["style"];
          break;
        case "bands":
          options.bands = this.flag(tok, "bands");
          break;
        case "text":
          options.fontSize = this.amount(tok, "text", 8, 24);
          break;
        case "size":
          options.width = this.amount(tok, "size", 240, 2400);
          options.height = this.amount(tok, "size", 200, 2400);
          break;
        default:
          throw new DSLError(`"${tok.value}" is not a PRISMA setting`, tok.line);
      }
    }
    this.close(line);
    if (steps.length === 0) {
      throw new DSLError(
        'A PRISMA flow needs at least one row, e.g. row "Records screened" 955',
        line,
      );
    }
    return { kind: "prisma", title, steps, options };
  }

  /** `row "Records screened" 955 { "Databases" 1200 ... }`, or a side box. */
  private parseBox(what: "row" | "side"): PrismaBox {
    const title = this.eat(
      "string",
      what === "row"
        ? 'A row is written row "Caption" 955, with an optional { "Line" 120 } block'
        : 'A side box is written side "Caption" 812, with an optional { "Line" 120 } block',
    ).value;
    const count = this.peekIs("number") ? this.advance().value : "";
    const items: PrismaLine[] = [];
    if (this.peekIs("lbrace")) {
      const opened = this.advance().line;
      while (!this.peekIs("rbrace")) {
        if (this.pos >= this.tokens.length) {
          throw new DSLError(`Missing "}" for "${title}"`, opened);
        }
        const label = this.eat(
          "string",
          'A line is written "Caption" 1200, or just "Caption"',
        ).value;
        const lineCount = this.peekIs("number") ? this.advance().value : "";
        items.push({ label, count: lineCount });
      }
      this.advance();
    }
    return { title, count, items };
  }
}

export function parseMatrix(code: string): MatrixSpec {
  return new MatrixParser(tokenize(code)).parse();
}

export function parseQuadrant(code: string): QuadrantSpec {
  return new QuadrantParser(tokenize(code)).parse();
}

export function parseGantt(code: string): GanttSpec {
  return new GanttParser(tokenize(code)).parse();
}

export function parseVenn(code: string): VennSpec {
  return new VennParser(tokenize(code)).parse();
}

export function parseFishbone(code: string): FishboneSpec {
  return new FishboneParser(tokenize(code)).parse();
}

export function parsePrisma(code: string): PrismaSpec {
  return new PrismaParser(tokenize(code)).parse();
}
