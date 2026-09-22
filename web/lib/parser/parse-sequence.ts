import { DSLError } from "@/lib/types";
import { tokenize, type Token } from "@/lib/parser/tokens";
import { Reader } from "@/lib/parser/reader";
import {
  FRAGMENT_KINDS,
  SEQUENCE_HEADS,
  SEQUENCE_STYLES,
  defaultSequenceOptions,
  messagesOf,
  type FragmentKind,
  type MessageKind,
  type SequenceHead,
  type SequenceSection,
  type SequenceSpec,
  type SequenceStep,
} from "@/lib/sequence/spec";

/**
 * A sequence diagram, written down.
 *
 * Participants first, then the messages in the order they are sent — which is
 * the order they are written, because in this notation those are the same
 * thing. A combined fragment is a block, so `alt { … } else { … }` nests the
 * way it reads and the layout never has to be told how deep anything is.
 */

const HEADS = new Set(SEQUENCE_HEADS.map((entry) => entry.id));
const FRAGMENTS = new Set(FRAGMENT_KINDS.map((entry) => entry.id));
const SETTINGS = new Set([
  "numbers",
  "activations",
  "style",
  "colors",
  "colours",
  "text",
  "spacing",
  "step",
  "size",
]);

class SequenceParser extends Reader {
  private steps = 0;

  parse(): SequenceSpec {
    const { title, line } = this.open("sequence");
    const options = defaultSequenceOptions();
    const spec: SequenceSpec = {
      kind: "sequence",
      title,
      participants: [],
      steps: [],
      options,
    };

    spec.steps = this.parseSteps(spec, line, true);
    this.close(line);

    const known = new Set(spec.participants.map((entry) => entry.id));
    for (const message of messagesOf(spec.steps)) {
      for (const id of [message.from, message.to]) {
        if (!known.has(id)) {
          throw new DSLError(
            `"${id}" has not been declared — write it first, e.g. object ${id} ":${id}"`,
            0,
          );
        }
      }
    }
    if (spec.participants.length === 0) {
      throw new DSLError(
        'A sequence diagram needs participants, e.g. actor A "Customer"',
        line,
      );
    }
    return spec;
  }

  /** Everything inside one pair of braces: declarations, settings and steps. */
  private parseSteps(
    spec: SequenceSpec,
    opened: number,
    top: boolean,
  ): SequenceStep[] {
    const steps: SequenceStep[] = [];
    while (!this.peekIs("rbrace")) {
      if (this.pos >= this.tokens.length) {
        throw new DSLError('Missing closing "}"', opened);
      }
      const tok = this.peek() as Token;
      if (tok.kind !== "id") {
        throw new DSLError(
          `Expected a participant, a message or a setting, got "${tok.value}"`,
          tok.line,
        );
      }
      const ahead = this.tokens[this.pos + 1];
      const arrow =
        ahead !== undefined &&
        (ahead.kind === "arrow" ||
          ahead.kind === "dashed-arrow" ||
          ahead.kind === "async-arrow");
      if (arrow) {
        steps.push(this.parseMessage());
        continue;
      }
      if (tok.value === "create" || tok.value === "destroy") {
        this.advance();
        steps.push(this.parseMessage(tok.value));
        continue;
      }
      if (FRAGMENTS.has(tok.value as FragmentKind)) {
        steps.push(this.parseFragment(spec));
        continue;
      }
      if (HEADS.has(tok.value as SequenceHead)) {
        if (!top) {
          throw new DSLError(
            "Participants are declared at the top of the diagram, not inside a fragment",
            tok.line,
          );
        }
        this.parseParticipant(spec);
        continue;
      }
      if (SETTINGS.has(tok.value)) {
        if (!top) {
          throw new DSLError(
            `"${tok.value}" is a setting for the whole diagram, so it belongs outside the fragment`,
            tok.line,
          );
        }
        this.parseSetting(spec);
        continue;
      }
      throw new DSLError(
        `"${tok.value}" is neither a participant, a message, a fragment nor a setting`,
        tok.line,
      );
    }
    return steps;
  }

  private parseParticipant(spec: SequenceSpec): void {
    const kind = this.advance().value as SequenceHead;
    const idTok = this.eat("id", `Expected a handle after "${kind}", e.g. ${kind} A "Name"`);
    if (spec.participants.some((entry) => entry.id === idTok.value)) {
      throw new DSLError(`Duplicate participant "${idTok.value}"`, idTok.line);
    }
    const label = this.peekIs("string") ? this.advance().value : idTok.value;
    const colour =
      this.peekIs("string") && /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/.test(this.peek()!.value)
        ? this.advance().value.toLowerCase()
        : undefined;
    spec.participants.push({
      id: idTok.value,
      label,
      kind,
      ...(colour ? { color: colour } : {}),
    });
  }

  private parseMessage(forced?: "create" | "destroy"): SequenceStep {
    const from = this.eat("id", "A message is written A -> B \"label\"");
    const arrow = this.advance();
    const to = this.eat("id", `Expected who "${from.value}" is writing to`);
    const label = this.peekIs("string") ? this.advance().value : "";
    const kind: MessageKind =
      forced ??
      (arrow.kind === "dashed-arrow"
        ? "reply"
        : arrow.kind === "async-arrow"
          ? "async"
          : "sync");
    this.steps += 1;
    return {
      type: "message",
      id: `s${this.steps}`,
      from: from.value,
      to: to.value,
      label,
      kind,
    };
  }

  private parseFragment(spec: SequenceSpec): SequenceStep {
    const head = this.advance();
    this.steps += 1;
    const id = `s${this.steps}`;
    const sections: SequenceSection[] = [];
    const read = (): SequenceSection => {
      const guard = this.peekIs("string") ? this.advance().value : "";
      this.eat("lbrace", `Expected "{" after ${head.value}`);
      const steps = this.parseSteps(spec, head.line, false);
      this.eat("rbrace", `Missing "}" for ${head.value}`);
      return { guard, steps };
    };
    sections.push(read());
    // `else` reads right on an alt, `and` on a par; both open the next section
    for (
      let next = this.peek();
      next?.kind === "id" && (next.value === "else" || next.value === "and");
      next = this.peek()
    ) {
      this.advance();
      sections.push(read());
    }
    return { type: "fragment", id, kind: head.value as FragmentKind, sections };
  }

  private parseSetting(spec: SequenceSpec): void {
    const tok = this.advance();
    const options = spec.options;
    switch (tok.value) {
      case "numbers":
        options.numbers = this.flag(tok, "numbers");
        break;
      case "activations":
        options.activations = this.flag(tok, "activations");
        break;
      case "style":
        options.style = this.word(
          tok,
          "style",
          SEQUENCE_STYLES.map((entry) => entry.id),
        ) as SequenceSpec["options"]["style"];
        break;
      case "colors":
      case "colours": {
        const picked = this.palette(tok);
        options.palette = picked.palette as SequenceSpec["options"]["palette"];
        if (picked.color) {
          options.color = picked.color;
        }
        break;
      }
      case "text":
        options.fontSize = this.amount(tok, "text", 8, 28);
        break;
      case "spacing":
        options.spacing = this.amount(tok, "spacing", 90, 480);
        break;
      case "step":
        options.step = this.amount(tok, "step", 26, 160);
        break;
      default:
        // the only setting left, and the gate above lets nothing else through
        options.width = this.amount(tok, "size", 280, 3200);
        options.height = this.amount(tok, "size", 200, 3200);
        break;
    }
  }
}

export function parseSequence(code: string): SequenceSpec {
  return new SequenceParser(tokenize(code)).parse();
}
