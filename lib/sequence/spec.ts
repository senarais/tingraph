import type { PaletteId } from "@/lib/chart/spec";
import type { FigureSize } from "@/lib/figures/spec";

/**
 * What a sequence diagram is.
 *
 * A row of participants, and the messages that pass between them in order.
 * The order is the whole notation — a message is not somewhere on the sheet,
 * it is third — so the messages are a list rather than a bag of arrows, and
 * everything drawn from them follows: the numbering, the execution bars, the
 * boxes a combined fragment wraps round a run of them.
 *
 * Nothing here draws or measures, so all of it runs under `tsx`.
 */

/** What a participant is drawn as at the top of its lifeline. */
export type SequenceHead =
  | "actor"
  | "object"
  | "boundary"
  | "control"
  | "entity"
  | "database";

export const SEQUENCE_HEADS: Array<{ id: SequenceHead; name: string; hint: string }> = [
  { id: "object", name: "Object", hint: "a named box, the usual lifeline" },
  { id: "actor", name: "Actor", hint: "a stick figure outside the system" },
  { id: "boundary", name: "Boundary", hint: "what the outside world touches" },
  { id: "control", name: "Control", hint: "what runs the work" },
  { id: "entity", name: "Entity", hint: "what is stored" },
  { id: "database", name: "Database", hint: "a store drawn as a drum" },
];

export interface SequenceParticipant {
  /** short handle the messages name it by */
  id: string;
  label: string;
  kind: SequenceHead;
  color?: string;
}

/**
 * The five lines a message can be.
 *
 * `sync` is a call and opens an execution on whatever it reaches; `reply` is
 * the answer and closes the one the replier was running; `create` brings a
 * participant onto the sheet where the message lands, and `destroy` takes it
 * off with a cross at the end of its lifeline.
 */
export type MessageKind = "sync" | "async" | "reply" | "create" | "destroy";

export const MESSAGE_KINDS: Array<{ id: MessageKind; name: string; hint: string }> = [
  { id: "sync", name: "Call", hint: "solid line, filled head" },
  { id: "async", name: "Signal", hint: "solid line, open head" },
  { id: "reply", name: "Reply", hint: "dashed, and ends an execution" },
  { id: "create", name: "Create", hint: "brings the lifeline onto the sheet" },
  { id: "destroy", name: "Destroy", hint: "ends the lifeline with a cross" },
];

export interface SequenceMessage {
  type: "message";
  id: string;
  from: string;
  to: string;
  label: string;
  kind: MessageKind;
}

/** The combined fragments worth drawing; each wraps a run of messages. */
export type FragmentKind = "alt" | "opt" | "loop" | "par" | "break" | "critical";

export const FRAGMENT_KINDS: Array<{
  id: FragmentKind;
  name: string;
  hint: string;
  /** whether a second section means anything to this operator */
  sections: boolean;
}> = [
  { id: "alt", name: "alt", hint: "one section runs, whichever guard holds", sections: true },
  { id: "opt", name: "opt", hint: "runs only if the guard holds", sections: false },
  { id: "loop", name: "loop", hint: "runs again while the guard holds", sections: false },
  { id: "par", name: "par", hint: "the sections run alongside each other", sections: true },
  { id: "break", name: "break", hint: "runs instead of the rest", sections: false },
  { id: "critical", name: "critical", hint: "runs without interruption", sections: false },
];

export interface SequenceSection {
  /** the condition written in brackets on the section's own line */
  guard: string;
  steps: SequenceStep[];
}

export interface SequenceFragment {
  type: "fragment";
  id: string;
  kind: FragmentKind;
  sections: SequenceSection[];
}

export type SequenceStep = SequenceMessage | SequenceFragment;

export type SequenceStyleId = "formal" | "tinted" | "bold";

export interface SequenceStyle {
  id: SequenceStyleId;
  name: string;
  hint: string;
  /** the head box and the execution bars carry the participant's colour */
  coloured: boolean;
  /** how solid that fill is, 0 for white */
  fill: number;
  edgeWidth: number;
  lineWidth: number;
}

/**
 * Formal first, as everywhere: white boxes, black rules, and the lifelines
 * carrying nothing but their own dashes. The washed bars a sequence diagram
 * is usually printed with are a choice the reader makes.
 */
export const SEQUENCE_STYLES: SequenceStyle[] = [
  {
    id: "formal",
    name: "Formal",
    hint: "white boxes, black rules",
    coloured: false,
    fill: 0,
    edgeWidth: 1.5,
    lineWidth: 1.5,
  },
  {
    id: "tinted",
    name: "Tinted",
    hint: "a colour per participant, washed",
    coloured: true,
    fill: 30,
    edgeWidth: 1.5,
    lineWidth: 1.5,
  },
  {
    id: "bold",
    name: "Bold",
    hint: "heavy rules over washed boxes",
    coloured: true,
    fill: 36,
    edgeWidth: 2.5,
    lineWidth: 2,
  },
];

export function sequenceStyle(id: SequenceStyleId): SequenceStyle {
  return SEQUENCE_STYLES.find((entry) => entry.id === id) ?? SEQUENCE_STYLES[0];
}

export interface SequenceOptions extends FigureSize {
  style: SequenceStyleId;
  palette: PaletteId;
  color: string;
  /** every message numbered in the order it is sent */
  numbers: boolean;
  /** the bars down a lifeline that say when it is running */
  activations: boolean;
  fontSize: number;
  /** least distance between two lifelines */
  spacing: number;
  /** distance from one message to the next */
  step: number;
}

export interface SequenceSpec {
  kind: "sequence";
  title: string;
  participants: SequenceParticipant[];
  steps: SequenceStep[];
  options: SequenceOptions;
}

// -------------------------------------------------------------- walking it

/** Every message, in the order it is sent, whatever it is nested inside. */
export function messagesOf(steps: readonly SequenceStep[]): SequenceMessage[] {
  return steps.flatMap((step) =>
    step.type === "message"
      ? [step]
      : step.sections.flatMap((section) => messagesOf(section.steps)),
  );
}

export interface SequenceRow {
  step: SequenceStep;
  depth: number;
  /** which section of its parent it sits in, and the parent itself */
  parent: string | null;
  section: number;
}

/** The whole outline, flattened, for a panel that lists it one line per step. */
export function walkSequence(
  steps: readonly SequenceStep[],
  depth = 0,
  parent: string | null = null,
  section = 0,
): SequenceRow[] {
  return steps.flatMap((step) => {
    const row: SequenceRow = { step, depth, parent, section };
    if (step.type === "message") {
      return [row];
    }
    return [
      row,
      ...step.sections.flatMap((entry, index) =>
        walkSequence(entry.steps, depth + 1, step.id, index),
      ),
    ];
  });
}

/**
 * One step rewritten wherever it sits, and every other step left alone.
 * Returning null takes it out, which is how a message or a fragment is
 * deleted from the middle of a nest.
 */
export function rewriteSteps(
  steps: readonly SequenceStep[],
  id: string,
  change: (found: SequenceStep) => SequenceStep | null,
): SequenceStep[] {
  const out: SequenceStep[] = [];
  for (const step of steps) {
    if (step.id === id) {
      const next = change(step);
      if (next) {
        out.push(next);
      }
      continue;
    }
    if (step.type === "fragment") {
      out.push({
        ...step,
        sections: step.sections.map((section) => ({
          ...section,
          steps: rewriteSteps(section.steps, id, change),
        })),
      });
      continue;
    }
    out.push(step);
  }
  return out;
}

/** A step put in directly after `id`, in whatever list `id` is in. */
export function insertAfter(
  steps: readonly SequenceStep[],
  id: string | null,
  added: SequenceStep,
): SequenceStep[] {
  if (id === null) {
    return [...steps, added];
  }
  const out: SequenceStep[] = [];
  let found = false;
  for (const step of steps) {
    if (step.type === "fragment" && step.id !== id) {
      let inner = false;
      const sections = step.sections.map((section) => {
        const next = insertAfter(section.steps, id, added);
        if (next.length !== section.steps.length) {
          inner = true;
        }
        return { ...section, steps: next };
      });
      out.push(inner ? { ...step, sections } : step);
      found = found || inner;
      continue;
    }
    out.push(step);
    if (step.id === id) {
      out.push(added);
      found = true;
    }
  }
  return found ? out : [...steps];
}

/** A step moved one place up or down among its own siblings. */
export function moveStep(
  steps: readonly SequenceStep[],
  id: string,
  by: -1 | 1,
): SequenceStep[] {
  const at = steps.findIndex((step) => step.id === id);
  if (at >= 0) {
    const to = at + by;
    if (to < 0 || to >= steps.length) {
      return [...steps];
    }
    const out = [...steps];
    [out[at], out[to]] = [out[to], out[at]];
    return out;
  }
  return steps.map((step) =>
    step.type === "fragment"
      ? {
          ...step,
          sections: step.sections.map((section) => ({
            ...section,
            steps: moveStep(section.steps, id, by),
          })),
        }
      : step,
  );
}

/** Every message that mentions a participant, taken out along with it. */
export function withoutParticipant(
  steps: readonly SequenceStep[],
  id: string,
): SequenceStep[] {
  const out: SequenceStep[] = [];
  for (const step of steps) {
    if (step.type === "message") {
      if (step.from !== id && step.to !== id) {
        out.push(step);
      }
      continue;
    }
    out.push({
      ...step,
      sections: step.sections.map((section) => ({
        ...section,
        steps: withoutParticipant(section.steps, id),
      })),
    });
  }
  return out;
}

/** A name nothing else in this diagram answers to. */
export function freshStepId(steps: readonly SequenceStep[]): string {
  const taken = new Set(walkSequence(steps).map((row) => row.step.id));
  let n = taken.size + 1;
  while (taken.has(`s${n}`)) {
    n += 1;
  }
  return `s${n}`;
}

/** A handle nothing else on the diagram answers to. */
export function freshParticipantId(spec: SequenceSpec): string {
  const taken = new Set(spec.participants.map((entry) => entry.id));
  let n = taken.size + 1;
  while (taken.has(`P${n}`)) {
    n += 1;
  }
  return `P${n}`;
}

export function defaultSequenceOptions(): SequenceOptions {
  return {
    style: "formal",
    palette: "single",
    color: "#1e1e1e",
    numbers: true,
    activations: true,
    fontSize: 12,
    spacing: 150,
    step: 46,
    width: 700,
    height: 420,
  };
}

export function blankSequence(): SequenceSpec {
  return {
    kind: "sequence",
    title: "Sequence diagram",
    participants: [
      { id: "A", label: "Customer", kind: "actor" },
      { id: "B", label: ":Order", kind: "object" },
      { id: "C", label: ":Item", kind: "object" },
    ],
    steps: [
      { type: "message", id: "s1", from: "A", to: "B", label: "place()", kind: "sync" },
      { type: "message", id: "s2", from: "B", to: "C", label: "getPrice()", kind: "sync" },
      { type: "message", id: "s3", from: "C", to: "B", label: "price", kind: "reply" },
      { type: "message", id: "s4", from: "B", to: "A", label: "total", kind: "reply" },
    ],
    options: defaultSequenceOptions(),
  };
}
