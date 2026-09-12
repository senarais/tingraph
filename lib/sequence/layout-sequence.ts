import { textWidth } from "@/lib/layout/compute-layout";
import {
  messagesOf,
  type FragmentKind,
  type MessageKind,
  type SequenceHead,
  type SequenceSpec,
  type SequenceStep,
} from "@/lib/sequence/spec";

/**
 * Where every mark of a sequence diagram goes.
 *
 * Two things are worked out here and nowhere else. Across the sheet: one
 * lifeline per participant, spread to fill whatever room the figure has.
 * Down it: one row per message, in order, with a combined fragment's box cut
 * from the rows it wraps rather than placed on its own.
 *
 * The execution bars are not written down anywhere — they are read off the
 * messages. A call opens one on whatever it reaches, a reply closes the one
 * its sender was running, and a call to oneself opens another a level deeper.
 * That is the whole rule, and it is why a diagram never has to say where a bar
 * starts and stops.
 *
 * Nothing here touches Excalidraw, so all of it runs under `tsx`.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Pt {
  x: number;
  y: number;
}

const MARGIN = 26;
const TITLE = 17;
/** the head band: the icon or the box, and the name under or inside it */
export const HEAD_H = 56;
const BOX_H = 40;
const ICON = 32;
/** how far down the head band the drawing is centred, for a created lifeline */
const HEAD_MID = HEAD_H - BOX_H / 2;
const ACT_W = 12;
/** from the bottom of the head band to the first message */
const FIRST = 32;
const SELF_W = 36;
const SELF_H = 30;
/** From a fragment's top rule to the first message inside it: room for the
 * operator tab and the guard written beside it, and the caption under both. */
const FRAG_HEAD = 50;
const FRAG_CLOSE = 24;
const FRAG_PAD = 26;
/** And the same again under the rule that opens each later section. */
const SECTION_GAP = 50;
const TAB_H = 19;
/** how far a caption is lifted off the line it belongs to */
const LIFT = 6;
/** how far a lifeline runs past the last message */
const TAIL = 30;

export interface HeadPlan {
  index: number;
  id: string;
  label: string;
  kind: SequenceHead;
  /** the whole head band, name included */
  box: Rect;
  /** the name on its own, which is what the pointer reaches for */
  caption: Rect;
  /** the lifeline */
  x: number;
  top: number;
  bottom: number;
  /** the lifeline is cut short by a destroy message */
  destroyed: boolean;
}

export interface MessagePlan {
  id: string;
  /** its place in the order, counting messages only */
  number: number;
  label: string;
  kind: MessageKind;
  from: number;
  to: number;
  self: boolean;
  y: number;
  points: Pt[];
  /** the caption's own box, which is what the pointer reaches for */
  caption: Rect;
}

export interface BarPlan extends Rect {
  participant: number;
}

export interface FragmentPlan {
  id: string;
  kind: FragmentKind;
  box: Rect;
  /** the tab in the top-left corner that names the operator */
  tab: Rect;
  /** every section's own rule and guard; the first one has no rule drawn */
  sections: Array<{ y: number; guard: string }>;
}

export interface SequencePlan {
  heads: HeadPlan[];
  messages: MessagePlan[];
  bars: BarPlan[];
  fragments: FragmentPlan[];
  /** where a destroyed lifeline is crossed out */
  crosses: Pt[];
  title: Rect;
  /** the room the drawing actually needs */
  natural: { width: number; height: number };
  /** where the pair that adds and drops a participant sits */
  addHead: Pt;
  /** and the pair that adds and drops a message */
  addStep: Pt;
}

/** How wide one participant's head is drawn. */
function headWidth(label: string, fontSize: number): number {
  return Math.max(96, Math.round(textWidth(label, fontSize + 1) + 28));
}

interface Rows {
  /** message id to the y its line sits on */
  at: Map<string, number>;
  boxes: Array<{
    id: string;
    kind: FragmentKind;
    top: number;
    bottom: number;
    sections: Array<{ y: number; guard: string }>;
    /** the messages it wraps, for working out how wide its box is */
    holds: string[];
  }>;
  bottom: number;
}

/**
 * One pass down the outline, giving every message its row. A fragment has no
 * row of its own: its box is opened before its first message and closed after
 * its last, which is what lets it wrap a nested one without any arithmetic
 * about how deep it is.
 */
function placeRows(steps: readonly SequenceStep[], top: number, step: number): Rows {
  const at = new Map<string, number>();
  const boxes: Rows["boxes"] = [];
  let y = top;

  const walk = (list: readonly SequenceStep[], holds: string[] | null): void => {
    for (const entry of list) {
      if (entry.type === "message") {
        at.set(entry.id, Math.round(y));
        holds?.push(entry.id);
        y += step + (entry.from === entry.to ? SELF_H : 0);
        continue;
      }
      const boxTop = Math.max(top, y - step * 0.5);
      const mine: string[] = [];
      const sections: Array<{ y: number; guard: string }> = [];
      y = boxTop + FRAG_HEAD;
      entry.sections.forEach((section, index) => {
        if (index === 0) {
          sections.push({ y: boxTop, guard: section.guard });
        } else {
          const rule = Math.round(y - step * 0.5);
          sections.push({ y: rule, guard: section.guard });
          y = rule + SECTION_GAP;
        }
        walk(section.steps, mine);
      });
      const bottom = Math.max(boxTop + 64, Math.round(y - step + FRAG_CLOSE));
      boxes.push({ id: entry.id, kind: entry.kind, top: boxTop, bottom, sections, holds: mine });
      holds?.push(...mine);
      y = bottom + step * 0.6;
    }
  };

  walk(steps, null);
  return { at, boxes, bottom: y };
}

/**
 * Everything drawn, worked out from the spec and the box it sits in.
 *
 * Kept apart from the drawing so the panel and the handles on the sheet ask
 * the same question the renderer asks — a message's caption is picked at
 * exactly the box its words were written in.
 */
export function planSequence(spec: SequenceSpec, at: Rect): SequencePlan {
  const size = spec.options.fontSize;
  const count = spec.participants.length;
  const widths = spec.participants.map((entry) => headWidth(entry.label, size));

  // --- across: one lifeline each, no closer than the reader asked for
  const xs: number[] = [];
  let run = MARGIN + (widths[0] ?? 0) / 2;
  for (let index = 0; index < count; index += 1) {
    if (index > 0) {
      run += Math.max(
        spec.options.spacing,
        widths[index - 1] / 2 + widths[index] / 2 + 34,
      );
    }
    xs.push(run);
  }
  const naturalWidth = Math.round(run + (widths[count - 1] ?? 0) / 2 + MARGIN);
  const slack = count > 1 ? Math.max(0, at.width - naturalWidth) / (count - 1) : 0;
  const lineX = xs.map((value, index) => Math.round(at.x + value + slack * index));

  // --- down: one row per message, then again once the room is known
  const headTop = at.y + (spec.title ? TITLE + 14 : 0) + MARGIN;
  const first = headTop + HEAD_H + FIRST;
  const flat = messagesOf(spec.steps);
  let step = spec.options.step;
  let rows = placeRows(spec.steps, first, step);
  const naturalHeight = Math.round(rows.bottom + TAIL + MARGIN - at.y);
  if (at.height > naturalHeight && flat.length > 0) {
    step += (at.height - naturalHeight) / flat.length;
    rows = placeRows(spec.steps, first, step);
  }

  const index = new Map(spec.participants.map((entry, slot) => [entry.id, slot]));
  const ordered = flat
    .map((message) => ({ message, y: rows.at.get(message.id) ?? 0 }))
    .sort((a, b) => a.y - b.y);
  const lastRow = ordered.length > 0 ? ordered[ordered.length - 1].y : first;
  const foot = Math.round(Math.max(lastRow + TAIL, at.y + at.height - MARGIN));

  // --- the bars, read off the messages rather than written down
  const bars: BarPlan[] = [];
  const stacks = new Map<number, number[]>();
  const born = new Map<number, number>();
  const died = new Map<number, number>();
  const open = (who: number, y: number) => {
    const stack = stacks.get(who) ?? [];
    stack.push(y);
    stacks.set(who, stack);
  };
  const close = (who: number, y: number) => {
    const stack = stacks.get(who) ?? [];
    const held = stack.pop();
    if (held === undefined) {
      return;
    }
    // a created lifeline does not exist above its own box, so the execution
    // the create message opens starts where the lifeline does
    const made = born.get(who);
    const top = made === undefined ? held : Math.max(held, made + BOX_H / 2);
    // whatever is left under it is how deep this one was, so a nested bar
    // steps half its own width to the right of the one holding it
    bars.push({
      participant: who,
      x: Math.round(lineX[who] - ACT_W / 2 + stack.length * (ACT_W / 2)),
      y: top,
      width: ACT_W,
      height: Math.max(16, y - top),
    });
  };
  if (spec.options.activations) {
    for (const { message, y } of ordered) {
      const from = index.get(message.from);
      const to = index.get(message.to);
      if (from === undefined || to === undefined) {
        continue;
      }
      if (message.kind === "reply") {
        close(from, y);
        continue;
      }
      if (message.kind === "destroy") {
        while ((stacks.get(to)?.length ?? 0) > 0) {
          close(to, y);
        }
        died.set(to, y);
        continue;
      }
      if (message.kind === "create") {
        born.set(to, y);
      }
      if (from === to) {
        // a call to oneself runs for exactly as long as its own loop: nothing
        // replies to it, so leaving it open would swallow the reply meant for
        // the execution underneath it
        open(to, y);
        close(to, y + SELF_H);
        continue;
      }
      open(to, y);
    }
    for (const [who, stack] of stacks) {
      while (stack.length > 0) {
        close(who, foot);
      }
    }
  } else {
    for (const { message, y } of ordered) {
      const to = index.get(message.to);
      if (to === undefined) {
        continue;
      }
      if (message.kind === "destroy") {
        died.set(to, y);
      } else if (message.kind === "create") {
        born.set(to, y);
      }
    }
  }

  /**
   * The x a line leaves or meets a lifeline at, outside any bar running there.
   * `running` leaves out a bar that opens on this very row, which is what a
   * call to oneself needs: it leaves the execution already running and comes
   * back to the one it has just started.
   */
  const edge = (who: number, y: number, way: number, running = false): number => {
    let held: BarPlan | null = null;
    for (const bar of bars) {
      if (bar.participant !== who || y < bar.y - 1 || y > bar.y + bar.height + 1) {
        continue;
      }
      if (running && bar.y >= y - 1) {
        continue;
      }
      if (!held || bar.x > held.x) {
        held = bar;
      }
    }
    if (!held) {
      return lineX[who];
    }
    return way >= 0 ? held.x + held.width : held.x;
  };

  // --- the heads, and the lifelines under them
  const heads: HeadPlan[] = spec.participants.map((entry, slot) => {
    const width = widths[slot];
    const born_ = born.get(slot);
    // a created lifeline is drawn where the message that made it lands
    const top = born_ === undefined ? headTop : Math.round(born_ - HEAD_MID);
    const boxed = entry.kind === "object";
    return {
      index: slot,
      id: entry.id,
      label: entry.label,
      kind: entry.kind,
      box: { x: Math.round(lineX[slot] - width / 2), y: top, width, height: HEAD_H },
      caption: boxed
        ? {
            x: Math.round(lineX[slot] - width / 2),
            y: top + HEAD_H - BOX_H,
            width,
            height: BOX_H,
          }
        : {
            x: Math.round(lineX[slot] - width / 2),
            y: top + ICON + 4,
            width,
            height: HEAD_H - ICON - 4,
          },
      x: lineX[slot],
      top: top + HEAD_H,
      bottom: died.get(slot) ?? foot,
      destroyed: died.has(slot),
    };
  });

  // --- the messages themselves
  const messages: MessagePlan[] = ordered.map(({ message, y }, order) => {
    const from = index.get(message.from) ?? 0;
    const to = index.get(message.to) ?? 0;
    const self = from === to;
    const caption = spec.options.numbers
      ? `${order + 1}: ${message.label}`
      : message.label;
    const width = Math.max(20, textWidth(caption, size));
    if (self) {
      const start = edge(from, y, 1, true);
      const turn = start + SELF_W;
      const back = edge(from, y + SELF_H, 1);
      return {
        id: message.id,
        number: order + 1,
        label: message.label,
        kind: message.kind,
        from,
        to,
        self: true,
        y,
        points: [
          { x: start, y },
          { x: turn, y },
          { x: turn, y: y + SELF_H },
          { x: back, y: y + SELF_H },
        ],
        caption: {
          x: turn + 8,
          y: Math.round(y + SELF_H / 2 - size * 0.75),
          width,
          height: Math.round(size * 1.3),
        },
      };
    }
    const way = lineX[to] >= lineX[from] ? 1 : -1;
    const start = edge(from, y, way);
    const stop =
      message.kind === "create"
        ? Math.round(lineX[to] - (way * widths[to]) / 2)
        : edge(to, y, -way);
    return {
      id: message.id,
      number: order + 1,
      label: message.label,
      kind: message.kind,
      from,
      to,
      self: false,
      y,
      points: [
        { x: start, y },
        { x: stop, y },
      ],
      caption: {
        x: Math.round((start + stop) / 2 - width / 2),
        y: Math.round(y - LIFT - size * 1.3),
        width,
        height: Math.round(size * 1.3),
      },
    };
  });

  // --- a fragment's box is cut from the lifelines its messages touch
  const held = new Map(messages.map((message) => [message.id, message]));
  const fragments: FragmentPlan[] = rows.boxes.map((box) => {
    const touched = box.holds
      .map((id) => held.get(id))
      .filter((message): message is MessagePlan => Boolean(message))
      .flatMap((message) => [lineX[message.from], lineX[message.to]]);
    const left = touched.length > 0 ? Math.min(...touched) : lineX[0] ?? at.x;
    const right =
      touched.length > 0 ? Math.max(...touched) : lineX[count - 1] ?? at.x + at.width;
    const inner = touched.length > 0 && left === right ? SELF_W + 60 : 0;
    return {
      id: box.id,
      kind: box.kind,
      box: {
        x: Math.round(left - FRAG_PAD),
        y: box.top,
        width: Math.round(right - left + inner + FRAG_PAD * 2),
        height: box.bottom - box.top,
      },
      tab: {
        x: Math.round(left - FRAG_PAD),
        y: box.top,
        width: Math.max(52, Math.round(textWidth(box.kind, size) + 26)),
        height: TAB_H,
      },
      sections: box.sections,
    };
  });

  const crosses = heads
    .filter((head) => head.destroyed)
    .map((head) => ({ x: head.x, y: head.bottom }));

  const rightmost = heads[heads.length - 1];
  return {
    heads,
    messages,
    bars,
    fragments,
    crosses,
    title: {
      x: at.x + at.width / 2 - 130,
      y: at.y + MARGIN - (TITLE + 6) / 2,
      width: 260,
      height: TITLE + 6,
    },
    natural: { width: naturalWidth, height: naturalHeight },
    addHead: rightmost
      ? { x: rightmost.box.x + rightmost.box.width + 20, y: headTop + HEAD_H / 2 }
      : { x: at.x + MARGIN, y: headTop + HEAD_H / 2 },
    addStep: {
      x: heads.length > 0 ? (heads[0].x + rightmost.x) / 2 : at.x + at.width / 2,
      y: lastRow + TAIL - 6,
    },
  };
}

/**
 * The same diagram, sized to what it now holds. Adding a participant or a
 * message makes the drawing bigger, and a figure carries its own size, so
 * every edit that changes what is on it goes through here.
 */
export function fitSequence(spec: SequenceSpec): SequenceSpec {
  return { ...spec, options: { ...spec.options, ...sequenceSize(spec) } };
}

/** The room a diagram needs when nothing is stretching it. */
export function sequenceSize(spec: SequenceSpec): { width: number; height: number } {
  const plan = planSequence(spec, { x: 0, y: 0, width: 0, height: 0 });
  return {
    width: Math.max(320, plan.natural.width),
    height: Math.max(240, plan.natural.height),
  };
}
