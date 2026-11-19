import { DSLError } from "@/lib/types";
import { tokenize } from "@/lib/parser/tokens";
import { HEX, Reader } from "@/lib/parser/reader";
import { timelineSize } from "@/lib/timeline/build-timeline";
import { defaultTimelineOptions, timeOf, type TimelineSpec } from "@/lib/timeline/spec";

/**
 * `timeline "Space race" { event 1957 "Sputnik 1" "first satellite"  event 1969 "Apollo 11" }`.
 *
 * An event is its time, then its caption, then a note if it has one. A time
 * written as a number puts the event to scale; one written in quotes — "Mar
 * 2024", "Phase 2" — can only be placed in sequence.
 */
class TimelineParser extends Reader {
  parse(): TimelineSpec {
    const { title, line } = this.open("timeline");
    const spec: TimelineSpec = { kind: "timeline", title, events: [], options: defaultTimelineOptions() };
    let sized = false;
    while (!this.peekIs("rbrace")) {
      const tok = this.peek();
      if (!tok) {
        throw new DSLError(`Missing closing "}" for the block opened on line ${line}`, line);
      }
      if (tok.kind !== "id") {
        throw new DSLError(`Expected an event, e.g. event 1969 "Apollo 11", got "${tok.value}"`, tok.line);
      }
      this.advance();
      switch (tok.value) {
        case "event": {
          const when = this.peek();
          if (!when || (when.kind !== "number" && when.kind !== "string")) {
            throw new DSLError('An event starts with its time, e.g. event 1969 "Apollo 11" or event "Mar 2024" "Kick-off"', tok.line);
          }
          this.advance();
          const label = this.eat("string", `Expected the event's caption in quotes, e.g. event ${when.kind === "number" ? when.value : `"${when.value}"`} "Apollo 11"`).value;
          const note = this.peekIs("string") && this.peek()?.line === tok.line ? this.advance().value : "";
          spec.events.push({ when: when.value, at: when.kind === "number" ? timeOf(when.value) : null, label, note });
          break;
        }
        case "orientation":
          spec.options.orientation = this.word(tok, "orientation", ["horizontal", "vertical"]) as TimelineSpec["options"]["orientation"];
          break;
        case "scale":
          spec.options.scale = this.word(tok, "scale", ["time", "even"]) as TimelineSpec["options"]["scale"];
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
          spec.options.fontSize = this.amount(tok, "text", 9, 22);
          break;
        case "size":
          spec.options.width = this.amount(tok, "size", 280, 2400);
          spec.options.height = this.amount(tok, "size", 160, 2400);
          sized = true;
          break;
        default:
          throw new DSLError(
            `"${tok.value}" is not part of a timeline — write event, orientation, scale, color, text or size`,
            tok.line,
          );
      }
    }
    this.close(line);
    if (!sized) {
      spec.options = { ...spec.options, ...timelineSize(spec) };
    }
    return spec;
  }
}

export function parseTimeline(code: string): TimelineSpec {
  return new TimelineParser(tokenize(code)).parse();
}
