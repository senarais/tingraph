/**
 * The sheet is black on white. One setting is free to change, and it changes
 * everywhere at once. A preset holds two values because a notation uses them
 * differently: the ink is the stroke a flowchart and a BPMN diagram are drawn
 * in, and the wash is the fill behind the role bands of an org chart.
 */
export interface Ink {
  color: string;
  tint: string;
}

export const INK_PRESETS = [
  { id: "mono", name: "Monochrome", color: "#1e1e1e", tint: "#e5e7eb" },
  { id: "white", name: "White band", color: "#1e1e1e", tint: "#ffffff" },
  { id: "blue", name: "Formal Blue", color: "#1e3a8a", tint: "#7dd3fc" },
  { id: "red", name: "Formal Red", color: "#991b1b", tint: "#fca5a5" },
  { id: "green", name: "Formal Green", color: "#065f46", tint: "#6ee7b7" },
] as const;

export type InkId = (typeof INK_PRESETS)[number]["id"];

export const DEFAULT_INK: InkId = "mono";

export function inkFor(id: InkId): Ink {
  const preset = INK_PRESETS.find((entry) => entry.id === id) ?? INK_PRESETS[0];
  return { color: preset.color, tint: preset.tint };
}

export const MONOCHROME: Ink = inkFor("mono");
