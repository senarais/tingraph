import { DSLError } from "@/lib/types";

/**
 * One reader for every Tingraph source, whatever it draws.
 *
 * The graph notations and the charts are parsed by different rules but read
 * the same characters: quoted captions, bare identifiers, braces, comments.
 * Keeping the reader in one place is what stops the two drifting apart over
 * what a comment is or where a caption may break.
 *
 * A comma is whitespace here. It separates a pair of coordinates or a run of
 * numbers for anyone who wants it to, and means nothing to anyone who does
 * not. A `#` opens a comment, so a colour is always written quoted.
 */

export type TokenKind =
  | "keyword"
  | "id"
  | "number"
  | "string"
  | "arrow"
  | "dashed-arrow"
  | "async-arrow"
  | "lbrace"
  | "rbrace"
  | "lbracket"
  | "rbracket"
  | "lparen"
  | "rparen";

export interface Token {
  kind: TokenKind;
  value: string;
  line: number;
}

const TOKEN_RE =
  /([\s,]+)|((?:#|\/\/)[^\n]*)|("(?:[^"\\\n]|\\.)*")|(-\.->|-\.{2,}->|->>|-->|->|→)|(-?\d+(?:\.\d+)?)|([A-Za-z_$][\w$]*(?:[-.](?![.>])[\w$]+)*)|([{}[\]()])/y;

const BRACKETS: Record<string, TokenKind> = {
  "{": "lbrace",
  "}": "rbrace",
  "[": "lbracket",
  "]": "rbracket",
  "(": "lparen",
  ")": "rparen",
};

export function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let line = 1;
  while (pos < code.length) {
    TOKEN_RE.lastIndex = pos;
    const m = TOKEN_RE.exec(code);
    if (!m || m.index !== pos) {
      throw new DSLError(`Unexpected character "${code[pos]}"`, line);
    }
    const [, ws, comment, str, arrow, number, id, bracket] = m;
    pos = TOKEN_RE.lastIndex;
    if (ws) {
      line += (ws.match(/\n/g) ?? []).length;
      continue;
    }
    if (comment) {
      continue;
    }
    if (str) {
      tokens.push({ kind: "string", value: JSON.parse(str), line });
    } else if (arrow) {
      // three lines, because three notations need to tell them apart: a solid
      // call, an open-headed one, and a dashed reply
      const dashed = arrow.startsWith("-.") || arrow === "-->";
      const open = arrow === "->>";
      tokens.push({
        kind: dashed ? "dashed-arrow" : open ? "async-arrow" : "arrow",
        value: dashed ? "-.->" : open ? "->>" : "->",
        line,
      });
    } else if (number) {
      tokens.push({ kind: "number", value: number, line });
    } else if (id) {
      tokens.push({ kind: "id", value: id, line });
    } else if (bracket) {
      tokens.push({ kind: BRACKETS[bracket], value: bracket, line });
    }
  }
  return tokens;
}
