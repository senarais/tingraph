import { DSLError } from "@/lib/types";
import { tokenize } from "@/lib/parser/tokens";
import { HEX, Reader } from "@/lib/parser/reader";
import {
  MATRIX_STYLES,
  defaultMatrixOptions,
  fitMatrixRow,
  type MatrixSpec,
} from "@/lib/matrix/spec";
import { VENN_STYLES, defaultVennOptions, type VennSpec } from "@/lib/venn/spec";
import {
  FISHBONE_STYLES,
  defaultFishboneOptions,
  type FishboneBone,
  type FishboneSpec,
} from "@/lib/fishbone/spec";

/**
 * The matrix, the Venn diagram and the fishbone, written down.
 *
 * Three small grammars rather than one general one, because the three say
 * genuinely different things: a matrix names rows, columns and their cells, a
 * Venn names its sets and what falls in each region between them, and a
 * fishbone is a nest of causes. What they share is `lib/parser/reader.ts`, and
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

export function parseMatrix(code: string): MatrixSpec {
  return new MatrixParser(tokenize(code)).parse();
}

export function parseVenn(code: string): VennSpec {
  return new VennParser(tokenize(code)).parse();
}

export function parseFishbone(code: string): FishboneSpec {
  return new FishboneParser(tokenize(code)).parse();
}
