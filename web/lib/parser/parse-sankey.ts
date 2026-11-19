import { DSLError } from "@/lib/types";
import { tokenize, type Token } from "@/lib/parser/tokens";
import { HEX, Reader } from "@/lib/parser/reader";
import { defaultSankeyOptions, sankeyLoop, type SankeySpec } from "@/lib/sankey/spec";

/**
 * `sankey "Energy" { unit "PJ"  "Gas" -> "Power" 120  "Power" -> "Homes" 70 }`.
 *
 * A flow is a source, an arrow, a target and how much: the names make the
 * nodes, in the order they are first written. `node "Coal" "#555555"` pins a
 * node's colour. Flows run one way — one that loops back is refused.
 */

const SETTINGS = new Set(["unit", "values", "colors", "colours", "text", "size", "node"]);

class SankeyParser extends Reader {
  private readonly spec: SankeySpec = { kind: "sankey", title: "", nodes: [], flows: [], options: defaultSankeyOptions() };
  private readonly index = new Map<string, number>();

  private nodeOf(name: string): number {
    const known = this.index.get(name);
    if (known !== undefined) return known;
    this.spec.nodes.push({ label: name });
    this.index.set(name, this.spec.nodes.length - 1);
    return this.spec.nodes.length - 1;
  }

  private name(tok: Token | undefined, what: string): string {
    if (!tok || (tok.kind !== "id" && tok.kind !== "string")) {
      throw new DSLError(`Expected ${what}, e.g. "Coal" -> "Power" 80`, tok?.line ?? 0);
    }
    this.advance();
    return tok.value;
  }

  parse(): SankeySpec {
    const { title, line } = this.open("sankey");
    this.spec.title = title;
    const flowLines: number[] = [];
    while (!this.peekIs("rbrace")) {
      const tok = this.peek();
      if (!tok) {
        throw new DSLError(`Missing closing "}" for the block opened on line ${line}`, line);
      }
      const next = this.tokens[this.pos + 1];
      if (tok.kind === "id" && SETTINGS.has(tok.value) && next?.kind !== "arrow") {
        this.advance();
        this.setting(tok);
        continue;
      }
      const from = this.name(tok, "a source");
      const arrow = this.peek();
      if (!arrow || arrow.kind !== "arrow") {
        throw new DSLError(
          arrow?.kind === "dashed-arrow" || arrow?.kind === "async-arrow"
            ? 'A flow is written with a plain arrow, e.g. "Coal" -> "Power" 80'
            : `Expected "->" after "${from}", e.g. "${from}" -> "Power" 80`,
          tok.line,
        );
      }
      this.advance();
      const to = this.name(this.peek(), "a target");
      const amount = this.eat("number", `A flow needs how much, e.g. "${from}" -> "${to}" 80`);
      const value = Number(amount.value);
      if (!(value > 0)) {
        throw new DSLError(`A flow carries more than nothing; "${from}" -> "${to}" needs a value above 0`, amount.line);
      }
      if (from === to) {
        throw new DSLError(`"${from}" cannot flow into itself`, tok.line);
      }
      const a = this.nodeOf(from);
      const b = this.nodeOf(to);
      const same = this.spec.flows.find((flow) => flow.from === a && flow.to === b);
      if (same) {
        // two flows between one pair are one band, as wide as both
        same.value += value;
      } else {
        this.spec.flows.push({ from: a, to: b, value });
        flowLines.push(tok.line);
      }
    }
    this.close(line);
    const loop = sankeyLoop(this.spec);
    if (loop) {
      throw new DSLError(
        `A Sankey's flows run one way, but "${this.spec.nodes[loop.from].label}" -> "${this.spec.nodes[loop.to].label}" flows back round to where it started`,
        flowLines[this.spec.flows.indexOf(loop)] ?? line,
      );
    }
    return this.spec;
  }

  private setting(tok: Token): void {
    switch (tok.value) {
      case "unit":
        this.spec.options.unit = this.eat("string", 'unit takes what the values are counted in, e.g. unit "PJ"').value;
        return;
      case "values":
        this.spec.options.values = this.flag(tok, "values");
        return;
      case "colors":
      case "colours":
        this.spec.options.palette = this.word(tok, tok.value, ["ink", "colorful"]) as SankeySpec["options"]["palette"];
        return;
      case "text":
        this.spec.options.fontSize = this.amount(tok, "text", 9, 22);
        return;
      case "size":
        this.spec.options.width = this.amount(tok, "size", 280, 2400);
        this.spec.options.height = this.amount(tok, "size", 200, 2400);
        return;
      default: {
        const name = this.name(this.peek(), "a node's name");
        const hex = this.eat("string", `node takes a name and a colour, e.g. node "${name}" "#555555"`);
        if (!HEX.test(hex.value)) {
          throw new DSLError(`"${hex.value}" is not a colour; write it as "#555555"`, hex.line);
        }
        this.spec.nodes[this.nodeOf(name)].color = hex.value.toLowerCase();
      }
    }
  }
}

export function parseSankey(code: string): SankeySpec {
  return new SankeyParser(tokenize(code)).parse();
}
