import { DSLError } from "@/lib/types";
import { tokenize, type Token } from "@/lib/parser/tokens";
import { PALETTES } from "@/lib/chart/spec";
import {
  MIND_SHAPES,
  MIND_STYLES,
  defaultMindOptions,
  type MindNode,
  type MindOptions,
  type MindSpec,
} from "@/lib/mind/spec";

/**
 * A mind map, written down.
 *
 * The map is its own outline: a branch is a caption, and what hangs off it is
 * a block under it. That is the whole grammar, because the shape of the tree
 * is the only thing the source has to carry — where a branch ends up is the
 * layout's to work out and the reader's to override on the sheet.
 */

const SETTINGS = new Set([
  "layout",
  "shape",
  "line",
  "colors",
  "colours",
  "style",
  "spread",
  "text",
  "branch",
  "size",
]);

const HEX = /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/;

class MindParser {
  private pos = 0;
  private next = 1;
  private readonly options: MindOptions = defaultMindOptions();

  constructor(private readonly tokens: Token[]) {}

  parse(): MindSpec {
    const keyword = this.eat("id", 'Expected "mind" to open the map');
    if (keyword.value !== "mind") {
      throw new DSLError(`Expected "mind", got "${keyword.value}"`, keyword.line);
    }
    const title = this.eat("string", "Expected the central idea in quotes");
    this.eat("lbrace", 'Expected "{" after the central idea');
    const children = this.parseBranches(keyword.line);
    if (this.pos < this.tokens.length) {
      throw new DSLError(
        'Unexpected content after the closing "}"',
        this.tokens[this.pos].line,
      );
    }
    return {
      kind: "mind",
      title: title.value,
      root: { id: "root", label: title.value, children },
      options: this.options,
    };
  }

  /** Everything inside one pair of braces: settings, then branches. */
  private parseBranches(opened: number): MindNode[] {
    const out: MindNode[] = [];
    while (!this.peekIs("rbrace")) {
      if (this.pos >= this.tokens.length) {
        throw new DSLError('Missing closing "}"', opened);
      }
      const tok = this.tokens[this.pos];
      if (tok.kind === "id" && SETTINGS.has(tok.value)) {
        this.parseSetting(tok.value);
        continue;
      }
      if (tok.kind !== "string") {
        throw new DSLError(
          `Expected a branch in quotes, e.g. "Visual design", got "${tok.value}"`,
          tok.line,
        );
      }
      out.push(this.parseBranch());
    }
    this.advance();
    return out;
  }

  private parseBranch(): MindNode {
    const label = this.advance();
    const node: MindNode = {
      id: `n${this.next++}`,
      label: label.value,
      children: [],
    };
    // a colour, then a shape, may follow the caption, in that order
    if (this.peekIs("string") && HEX.test(this.tokens[this.pos].value)) {
      node.color = this.advance().value.toLowerCase();
    }
    if (
      this.peekIs("id") &&
      MIND_SHAPES.some((shape) => shape.id === this.tokens[this.pos].value)
    ) {
      node.shape = this.advance().value as MindNode["shape"];
    }
    if (this.peekIs("lbrace")) {
      const opened = this.advance().line;
      node.children = this.parseBranches(opened);
    }
    return node;
  }

  private parseSetting(name: string): void {
    const tok = this.advance();
    switch (name) {
      case "layout":
        this.options.layout = this.oneOf(tok, name, [
          "radial",
          "sides",
          "down",
        ]) as MindOptions["layout"];
        return;
      case "shape":
        this.options.shape = this.oneOf(
          tok,
          name,
          MIND_SHAPES.map((entry) => entry.id),
        ) as MindOptions["shape"];
        return;
      case "line":
        this.options.line = this.oneOf(tok, name, [
          "curve",
          "elbow",
          "straight",
        ]) as MindOptions["line"];
        return;
      case "style":
        this.options.style = this.oneOf(
          tok,
          name,
          MIND_STYLES.map((entry) => entry.id),
        ) as MindOptions["style"];
        return;
      case "colors":
      case "colours": {
        const ahead = this.tokens[this.pos];
        if (ahead?.kind === "string" && HEX.test(ahead.value)) {
          this.advance();
          this.options.palette = "single";
          this.options.color = ahead.value.toLowerCase();
          return;
        }
        this.options.palette = this.oneOf(
          tok,
          "colors",
          PALETTES.map((entry) => entry.id),
        ) as MindOptions["palette"];
        return;
      }
      case "branch":
        this.options.branchColors = this.flag(tok, name);
        return;
      case "spread":
        this.options.spread = this.bounded(tok, name, 60, 400);
        return;
      case "text":
        this.options.fontSize = this.bounded(tok, name, 8, 32);
        return;
      default:
        this.options.width = this.bounded(tok, "size", 200, 2400);
        this.options.height = this.bounded(tok, "size", 160, 2400);
    }
  }

  // ------------------------------------------------------------- small parts

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
    if (!next || next.kind !== "id" || !["on", "off"].includes(next.value)) {
      throw new DSLError(`"${name}" takes on or off, e.g. ${name} on`, tok.line);
    }
    this.advance();
    return next.value === "on";
  }

  private bounded(tok: Token, name: string, low: number, high: number): number {
    const next = this.eat("number", `"${name}" takes a number`);
    const value = Number(next.value);
    if (!Number.isFinite(value) || value < low || value > high) {
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

  private peekIs(kind: Token["kind"]): boolean {
    const tok = this.tokens[this.pos];
    return tok !== undefined && tok.kind === kind;
  }

  private eat(kind: Token["kind"], message: string): Token {
    const tok = this.tokens[this.pos];
    if (tok === undefined || tok.kind !== kind) {
      throw new DSLError(message, tok?.line ?? 0);
    }
    return this.tokens[this.pos++];
  }
}

export function parseMind(code: string): MindSpec {
  return new MindParser(tokenize(code)).parse();
}
