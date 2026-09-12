import { DSLError } from "@/lib/types";
import { tokenize } from "@/lib/parser/tokens";
import { HEX, Reader } from "@/lib/parser/reader";
import {
  MATRIX_STYLES,
  defaultMatrixOptions,
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
 * genuinely different things: a matrix names two axes and four corners, a Venn
 * names its sets and what falls in each region between them, and a fishbone is
 * a nest of causes. What they share is `lib/parser/reader.ts`, and nothing else.
 */

// ------------------------------------------------------------------- matrix

const CORNERS: Record<string, number> = {
  "top-left": 0,
  "top-right": 1,
  "bottom-left": 2,
  "bottom-right": 3,
};

class MatrixParser extends Reader {
  parse(): MatrixSpec {
    const { title, line } = this.open("matrix");
    const options = defaultMatrixOptions();
    const spec: MatrixSpec = {
      kind: "matrix",
      title,
      x: { label: "", low: "", high: "" },
      y: { label: "", low: "", high: "" },
      quadrants: [
        { label: "", note: "" },
        { label: "", note: "" },
        { label: "", note: "" },
        { label: "", note: "" },
      ],
      items: [],
      options,
    };

    while (!this.peekIs("rbrace")) {
      if (this.pos >= this.tokens.length) {
        throw new DSLError('Missing closing "}"', line);
      }
      const tok = this.advance();
      if (tok.kind !== "id") {
        throw new DSLError(
          `Expected a setting such as "top-left" or "x", got "${tok.value}"`,
          tok.line,
        );
      }
      const name = tok.value;
      if (name === "x" || name === "y") {
        const axis = {
          label: this.eat("string", `"${name}" takes a name, e.g. ${name} "Value" "Low" "High"`)
            .value,
          low: this.eat("string", `"${name}" takes its two ends as well`).value,
          high: this.eat("string", `"${name}" takes its two ends as well`).value,
        };
        spec[name] = axis;
        continue;
      }
      if (name in CORNERS) {
        const index = CORNERS[name];
        spec.quadrants[index] = {
          label: this.eat("string", `"${name}" takes a name in quotes`).value,
          note: this.peekIs("string") && !HEX.test(this.peek()!.value)
            ? this.advance().value
            : "",
          ...(this.peekIs("string") && HEX.test(this.peek()!.value)
            ? { color: this.advance().value.toLowerCase() }
            : {}),
        };
        continue;
      }
      switch (name) {
        case "item": {
          const label = this.eat("string", 'An item is written item "Name" 70 30').value;
          const x = this.amount(tok, "item", -1000, 1000);
          const y = this.amount(tok, "item", -1000, 1000);
          spec.items.push({
            label,
            x: Math.min(1, Math.max(0, x / 100)),
            y: Math.min(1, Math.max(0, y / 100)),
          });
          break;
        }
        case "style":
          options.style = this.word(
            tok,
            "style",
            MATRIX_STYLES.map((entry) => entry.id),
          ) as MatrixSpec["options"]["style"];
          break;
        case "axis":
          options.axis = this.word(tok, "axis", [
            "cross",
            "arrows",
            "tabs",
            "none",
          ]) as MatrixSpec["options"]["axis"];
          break;
        case "labels":
          options.labels = this.word(tok, "labels", [
            "inside",
            "corner",
          ]) as MatrixSpec["options"]["labels"];
          break;
        case "colors":
        case "colours": {
          const picked = this.palette(tok);
          options.palette = picked.palette as MatrixSpec["options"]["palette"];
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
          throw new DSLError(`"${name}" is not a matrix setting`, tok.line);
      }
    }
    this.close(line);
    return spec;
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
