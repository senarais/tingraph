import type { FigureSize } from "@/lib/figures/spec";

/**
 * What a timeline is.
 *
 * One axis, and a run of events placed along it, each a point in time with a
 * caption: when, what, and a line more if it needs one. No durations — a thing
 * that lasts is a bar, and bars are a Gantt chart's.
 *
 * A timeline is either drawn **to scale**, where the gap between two events is
 * the time between them, or **in sequence**, where every event takes the same
 * room and only the order is read. To scale needs a number for every event (a
 * year, a day of a project); an event whose time is written as words — "March
 * 2024", "Phase 2" — can only be placed in sequence, and the timeline says so
 * rather than guessing.
 */

export type TimelineOrientation = "horizontal" | "vertical";
export type TimelineScale = "time" | "even";

export interface TimelineEvent {
  /** the time as written: 1969, "Mar 2024", "Phase 2" */
  when: string;
  /** that time as a number, when it is one; null when it is words */
  at: number | null;
  label: string;
  /** a line more under the caption; empty for none */
  note: string;
}

export interface TimelineOptions extends FigureSize {
  orientation: TimelineOrientation;
  /** what the reader asked for; `scaleOf` says what can actually be drawn */
  scale: TimelineScale;
  color: string;
  fontSize: number;
}

export interface TimelineSpec {
  kind: "timeline";
  title: string;
  events: TimelineEvent[];
  options: TimelineOptions;
}

/**
 * The scale the timeline is drawn on: to scale only when every event has a
 * number and there are at least two different ones.
 */
export function scaleOf(spec: TimelineSpec): TimelineScale {
  if (spec.options.scale === "even") return "even";
  const times = spec.events.map((event) => event.at);
  if (times.some((at) => at === null)) return "even";
  return new Set(times).size >= 2 ? "time" : "even";
}

/** The number a written time stands for, when it is a plain number. */
export function timeOf(when: string): number | null {
  const value = Number(when.trim());
  return when.trim() !== "" && Number.isFinite(value) ? value : null;
}

export function defaultTimelineOptions(): TimelineOptions {
  return {
    orientation: "horizontal",
    scale: "time",
    color: "#2a78d6",
    fontSize: 12,
    width: 820,
    height: 360,
  };
}

export function blankTimeline(): TimelineSpec {
  return {
    kind: "timeline",
    title: "Timeline",
    events: [
      { when: "2020", at: 2020, label: "Started", note: "" },
      { when: "2022", at: 2022, label: "First release", note: "" },
      { when: "2023", at: 2023, label: "Second release", note: "" },
      { when: "2026", at: 2026, label: "Today", note: "" },
    ],
    options: defaultTimelineOptions(),
  };
}
