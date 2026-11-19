import type { FigureSize } from "@/lib/figures/spec";

/**
 * What a Gantt chart is.
 *
 * A run of numbered time units — week 1, week 2, … — across the top, and one
 * row per task under it, grouped into sections. A task is a bar that starts
 * in one unit and lasts a whole number of them; a milestone is a diamond at
 * the start of a unit and lasts none. A task may start where others finish
 * (`after`), which is the only dependency a schedule like this needs, and the
 * chart draws that as an arrow from the end of one bar to the next.
 *
 * Units rather than calendar dates on purpose: a proposal's schedule is
 * written "weeks 3 to 6", and it stays right whatever date the work begins.
 */

export interface GanttTask {
  id: string;
  label: string;
  /** the section it is listed under, by its place in `sections`; -1 for none */
  section: number;
  /** the unit it starts in, from 1; null when it starts after others */
  start: number | null;
  /** the tasks it starts after; it begins in the unit after the last of them ends */
  after: string[];
  /** how many units it lasts; 0 is a milestone */
  length: number;
  /** how much of it is done, 0 to 100 */
  done: number;
}

export interface GanttOptions extends FigureSize {
  /** what one unit is called in the header: Week, Month, Day */
  unit: string;
  /** the unit the chart is read in, drawn as a dashed line; null for none */
  today: number | null;
  color: string;
  fontSize: number;
}

export interface GanttSpec {
  kind: "gantt";
  title: string;
  sections: string[];
  tasks: GanttTask[];
  options: GanttOptions;
}

/** A row on the chart: a section's name, or one task. */
export type GanttRow = { kind: "section"; index: number } | { kind: "task"; index: number };

/** Every row in the order it is drawn: each section's name, then its tasks. */
export function ganttRows(spec: GanttSpec): GanttRow[] {
  const rows: GanttRow[] = [];
  const loose = spec.tasks.map((task, index) => ({ task, index })).filter(({ task }) => task.section < 0);
  for (const { index } of loose) rows.push({ kind: "task", index });
  spec.sections.forEach((_, section) => {
    rows.push({ kind: "section", index: section });
    spec.tasks.forEach((task, index) => {
      if (task.section === section) rows.push({ kind: "task", index });
    });
  });
  return rows;
}

/** How tall a chart of this many rows is drawn when nobody has sized it. */
export function ganttHeight(rows: number, titled: boolean): number {
  return Math.round(36 + (titled ? 31 : 0) + 30 + Math.max(1, rows) * 30);
}

/**
 * When each task starts, with every `after` worked out: the unit after the
 * last of the tasks it follows ends. A task whose predecessors loop back to it
 * cannot be placed; the parser refuses those, and a sheet that has one anyway
 * puts it at unit 1 rather than not drawing.
 */
export function ganttStarts(spec: GanttSpec): number[] {
  const byId = new Map(spec.tasks.map((task, index) => [task.id, index]));
  const starts: Array<number | undefined> = spec.tasks.map(() => undefined);
  const visiting = new Set<number>();
  const startOf = (index: number): number => {
    const known = starts[index];
    if (known !== undefined) return known;
    const task = spec.tasks[index];
    if (task.start !== null || task.after.length === 0 || visiting.has(index)) {
      starts[index] = task.start ?? 1;
      return starts[index] as number;
    }
    visiting.add(index);
    const begins = Math.max(
      1,
      ...task.after.map((id) => {
        const other = byId.get(id);
        return other === undefined ? 1 : startOf(other) + spec.tasks[other].length;
      }),
    );
    visiting.delete(index);
    starts[index] = begins;
    return begins;
  };
  return spec.tasks.map((_, index) => startOf(index));
}

/** How many units the header runs to: past the last thing on the chart. */
export function ganttSpan(spec: GanttSpec): number {
  const starts = ganttStarts(spec);
  const ends = spec.tasks.map((task, index) => starts[index] + Math.max(1, task.length) - 1);
  return Math.max(1, spec.options.today ?? 1, ...ends);
}

export function defaultGanttOptions(): GanttOptions {
  return { unit: "Week", today: null, color: "#2a78d6", fontSize: 12, width: 760, height: 300 };
}

export function blankGantt(): GanttSpec {
  const spec: GanttSpec = {
    kind: "gantt",
    title: "Project plan",
    sections: ["Plan", "Build"],
    tasks: [
      { id: "T1", label: "Scope", section: 0, start: 1, after: [], length: 2, done: 100 },
      { id: "T2", label: "Design", section: 0, start: null, after: ["T1"], length: 3, done: 40 },
      { id: "T3", label: "Build", section: 1, start: null, after: ["T2"], length: 4, done: 0 },
      { id: "M1", label: "Launch", section: 1, start: null, after: ["T3"], length: 0, done: 0 },
    ],
    options: defaultGanttOptions(),
  };
  spec.options.height = ganttHeight(ganttRows(spec).length, true);
  return spec;
}

/**
 * The spec with its rows changed, grown or shrunk by a row's height for every
 * row gained or lost, so a task added from the panel or the sheet gets a row
 * of its own rather than squeezing the others.
 */
export function withRows(before: GanttSpec, after: GanttSpec): GanttSpec {
  const grown = ganttRows(after).length - ganttRows(before).length;
  return grown === 0
    ? after
    : { ...after, options: { ...after.options, height: Math.max(160, after.options.height + grown * ROW_STEP) } };
}

/** The height one row adds to a chart drawn at its natural size. */
export const ROW_STEP = 30;

/** An id no task has yet: T1, T2, … or M1, M2, … */
export function freshTaskId(spec: GanttSpec, milestone: boolean): string {
  const prefix = milestone ? "M" : "T";
  let n = 1;
  while (spec.tasks.some((task) => task.id === `${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/** A task taken out, and every task that started after it starting where it did. */
export function dropTask(spec: GanttSpec, index: number): GanttSpec {
  const gone = spec.tasks[index];
  const starts = ganttStarts(spec);
  return withRows(spec, {
    ...spec,
    tasks: spec.tasks
      .filter((_, at) => at !== index)
      .map((task) => {
        if (!task.after.includes(gone.id)) return task;
        const after = task.after.filter((id) => id !== gone.id);
        // a task that followed only this one keeps its place on the chart
        return after.length > 0 ? { ...task, after } : { ...task, after, start: starts[spec.tasks.indexOf(task)] };
      }),
  });
}
