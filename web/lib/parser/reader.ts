import { DSLError } from "@/lib/types";
import type { Token } from "@/lib/parser/tokens";
import { PALETTES } from "@/lib/chart/spec";

/**
 * The half of a figure's grammar that every figure's grammar shares.
 *
 * Each notation says something genuinely different — a matrix names rows and
 * columns, a Venn names its regions, a sequence diagram names who talks to
 * whom — so there is no general grammar to write. What they do share is how a block
 * opens and closes, how a setting reads, and what counts as a colour; keeping
 * that here is what stops the grammars drifting apart over it.
 */

export const HEX = /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/;

export class Reader {
  protected pos = 0;
  constructor(protected readonly tokens: Token[]) {}

  protected advance(): Token {
    if (this.pos >= this.tokens.length) {
      throw new DSLError("Unexpected end of input", 0);
    }
    return this.tokens[this.pos++];
  }

  protected peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  protected peekIs(kind: Token["kind"]): boolean {
    return this.tokens[this.pos]?.kind === kind;
  }

  protected eat(kind: Token["kind"], message: string): Token {
    const tok = this.tokens[this.pos];
    if (tok === undefined || tok.kind !== kind) {
      throw new DSLError(message, tok?.line ?? 0);
    }
    return this.tokens[this.pos++];
  }

  protected open(keyword: string): { title: string; line: number } {
    const head = this.eat("id", `Expected "${keyword}" to open the drawing`);
    if (head.value !== keyword) {
      throw new DSLError(`Expected "${keyword}", got "${head.value}"`, head.line);
    }
    const title = this.eat("string", "Expected a title in quotes");
    this.eat("lbrace", 'Expected "{" after the title');
    return { title: title.value, line: head.line };
  }

  protected close(opened: number): void {
    this.eat("rbrace", `Missing closing "}" for the block opened on line ${opened}`);
    if (this.pos < this.tokens.length) {
      throw new DSLError(
        'Unexpected content after the closing "}"',
        this.tokens[this.pos].line,
      );
    }
  }

  protected word(tok: Token, name: string, allowed: readonly string[]): string {
    const next = this.peek();
    if (!next || next.kind !== "id" || !allowed.includes(next.value)) {
      throw new DSLError(
        `"${name}" takes one of ${allowed.join(", ")}, e.g. ${name} ${allowed[0]}`,
        tok.line,
      );
    }
    this.advance();
    return next.value;
  }

  protected flag(tok: Token, name: string): boolean {
    const next = this.peek();
    if (!next || next.kind !== "id" || !["on", "off"].includes(next.value)) {
      throw new DSLError(`"${name}" takes on or off, e.g. ${name} on`, tok.line);
    }
    this.advance();
    return next.value === "on";
  }

  protected amount(tok: Token, name: string, low: number, high: number): number {
    const next = this.eat("number", `"${name}" takes a number`);
    const value = Number(next.value);
    if (!Number.isFinite(value) || value < low || value > high) {
      throw new DSLError(`"${name}" takes a number between ${low} and ${high}`, tok.line);
    }
    return value;
  }

  /** `colors colorful`, or `colors "#2a78d6"` for one pinned colour. */
  protected palette(tok: Token): { palette: string; color?: string } {
    const ahead = this.peek();
    if (ahead?.kind === "string" && HEX.test(ahead.value)) {
      this.advance();
      return { palette: "single", color: ahead.value.toLowerCase() };
    }
    return {
      palette: this.word(
        tok,
        "colors",
        PALETTES.map((entry) => entry.id),
      ),
    };
  }
}
