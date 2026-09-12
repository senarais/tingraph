import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { marked } from "@/lib/canvas/units";
import { MONOCHROME, type Ink } from "@/lib/ink";
import { FORMAL, type SheetStyle } from "@/lib/sheet";
import { markColor, readableOn, type PaletteId } from "@/lib/chart/spec";
import { textWidth, wrapByWidth } from "@/lib/layout/compute-layout";
import { fishboneStyle, type FishboneSpec } from "@/lib/fishbone/spec";

/**
 * A fishbone, laid out and drawn.
 *
 * The spine runs to the head on the right. The bones lean back towards it, so
 * a bone and everything on it reads as running *into* the effect rather than
 * away from it, and they alternate above and below so the two halves fill
 * evenly. A cause is a short rule into its bone with its name over the top,
 * which is how the method is drawn by hand and why it stays legible when there
 * are twenty of them.
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

const BASE = {
  fillStyle: "solid",
  strokeStyle: "solid",
  opacity: 100,
  roundness: null,
  angle: 0,
} as const;

const PAD = 16;
/** the shortest a rule into a bone is drawn */
const CAUSE_RUN = 64;
/** how wide a cause's caption is set before it wraps */
const CAUSE_WRAP = 150;

export interface CausePlan {
  label: string;
  /** the caption, already broken to the width its rule will be */
  lines: string[];
  /** where the rule meets the bone */
  at: Pt;
  /** where the rule starts, and the caption with it */
  from: Pt;
  /** the caption's own box, which is what a reader points at */
  text: Rect;
  causes: string[];
}

export interface BonePlan {
  index: number;
  label: string;
  color: string;
  /** where the bone meets the spine */
  root: Pt;
  /** the far end, where its name sits */
  tip: Pt;
  up: boolean;
  /** the box the bone's name is written in, at the tip */
  name: Rect;
  causes: CausePlan[];
}

export interface FishbonePlan {
  spine: { from: Pt; to: Pt };
  head: Rect;
  bones: BonePlan[];
}

/** Where the spine, the head and every bone sit. */
export function planFishbone(spec: FishboneSpec, at: Rect): FishbonePlan {
  const size = spec.options.fontSize;
  const headText = wrapByWidth(spec.title, 130, size + 1);
  const headWidth = Math.max(
    96,
    headText.reduce((most, line) => Math.max(most, textWidth(line, size + 1)), 0) + 34,
  );
  const headHeight = Math.max(58, headText.length * size * 1.35 + 26);
  const middle = at.y + at.height / 2;
  const left = at.x + PAD;
  const right = at.x + at.width - PAD - headWidth;

  const head: Rect = {
    x: right,
    y: middle - headHeight / 2,
    width: headWidth,
    height: headHeight,
  };
  const spine = {
    from: { x: left, y: middle },
    to: { x: right, y: middle },
  };

  const radians = (Math.max(25, Math.min(80, spec.options.angle)) * Math.PI) / 180;
  const reach = Math.min(at.height / 2 - PAD - size - 10, 190);
  const run = reach / Math.tan(radians);
  const palette = spec.options.palette as PaletteId;

  const above = spec.bones.filter((_, index) => index % 2 === 0);
  const below = spec.bones.filter((_, index) => index % 2 === 1);
  const lane = (count: number, offset: number) => {
    const usable = spine.to.x - spine.from.x - run - 30;
    const step = count > 0 ? usable / count : 0;
    return (index: number) =>
      spine.from.x + run + 20 + step * (index + 0.5) + offset * step * 0.25;
  };
  const topAt = lane(above.length, 0);
  const lowAt = lane(below.length, 0.6);

  const bones: BonePlan[] = spec.bones.map((bone, index) => {
    const up = index % 2 === 0;
    const place = up ? above.indexOf(bone) : below.indexOf(bone);
    const rootX = Math.round(up ? topAt(place) : lowAt(place));
    const root = { x: rootX, y: middle };
    const tip = {
      x: Math.round(rootX - run),
      y: Math.round(middle + (up ? -reach : reach)),
    };
    const causes = bone.causes.map((cause, at2) => {
      const t =
        bone.causes.length === 1
          ? 0.55
          : 0.28 + (0.62 * at2) / Math.max(1, bone.causes.length - 1);
      const on = {
        x: Math.round(root.x + (tip.x - root.x) * t),
        y: Math.round(root.y + (tip.y - root.y) * t),
      };
      // the rule is as long as the caption sitting on it, so the caption ends
      // where the rule meets the bone rather than running across it
      const lines = wrapByWidth(cause.label, CAUSE_WRAP, size - 1);
      const width = Math.max(
        CAUSE_RUN,
        lines.reduce((most, line) => Math.max(most, textWidth(line, size - 1)), 0) + 6,
      );
      const from = { x: Math.round(on.x - width), y: on.y };
      const tall = lines.length * (size - 1) * 1.3;
      return {
        label: cause.label,
        lines,
        causes: cause.causes,
        at: on,
        from,
        text: {
          x: from.x,
          y: Math.round(from.y - tall - 4),
          width,
          height: Math.round(tall + 4),
        },
      };
    });
    const nameLines = wrapByWidth(bone.label, 126, size);
    const nameWide =
      nameLines.reduce((most, entry) => Math.max(most, textWidth(entry, size)), 0) + 20;
    const nameTall = nameLines.length * size * 1.3 + 12;
    const nameMiddle = up ? tip.y - nameTall / 2 - 4 : tip.y + nameTall / 2 + 4;
    return {
      index,
      label: bone.label,
      color: markColor(palette, spec.options, index, bone.color),
      root,
      tip,
      up,
      name: {
        x: Math.round(tip.x - nameWide / 2),
        y: Math.round(nameMiddle - nameTall / 2),
        width: Math.round(nameWide),
        height: Math.round(nameTall),
      },
      causes,
    };
  });

  return { spine, head, bones };
}

interface Paper {
  ink: string;
  font: number;
  lineHeight: number;
  roughness: number;
  unit: string;
  id: (part: string) => string;
}

function line(
  paper: Paper,
  from: Pt,
  to: Pt,
  options: { stroke: string; width: number; arrow?: boolean },
): ExcalidrawElementSkeleton {
  return {
    type: options.arrow ? "arrow" : "line",
    id: paper.id("line"),
    x: Math.round(from.x),
    y: Math.round(from.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
    points: [
      [0, 0],
      [Math.round(to.x - from.x), Math.round(to.y - from.y)],
    ],
    ...BASE,
    strokeColor: options.stroke,
    backgroundColor: "transparent",
    strokeWidth: options.width,
    roughness: paper.roughness,
    ...(options.arrow
      ? { startArrowhead: null, endArrowhead: "triangle" }
      : { startArrowhead: null, endArrowhead: null }),
    groupIds: [paper.unit],
    ...marked({ unit: paper.unit, kind: "figure" }),
  } as unknown as ExcalidrawElementSkeleton;
}

function text(
  paper: Paper,
  content: string,
  at: Pt,
  options: { size: number; align?: "left" | "center" | "right"; color?: string; middle?: boolean },
): ExcalidrawElementSkeleton {
  return {
    type: "text",
    id: paper.id("text"),
    text: content,
    x: Math.round(at.x),
    y: Math.round(at.y),
    ...BASE,
    strokeColor: options.color ?? paper.ink,
    backgroundColor: "transparent",
    strokeWidth: 1,
    roughness: paper.roughness,
    fontFamily: paper.font,
    fontSize: options.size,
    lineHeight: paper.lineHeight,
    textAlign: options.align ?? "center",
    verticalAlign: options.middle ? "middle" : "top",
    groupIds: [paper.unit],
    ...marked({ unit: paper.unit, kind: "figure" }),
  } as unknown as ExcalidrawElementSkeleton;
}

function box(
  paper: Paper,
  rect: Rect,
  options: { stroke: string; fill: string; width: number; round?: number },
): ExcalidrawElementSkeleton {
  return {
    type: "rectangle",
    id: paper.id("box"),
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
    ...BASE,
    strokeColor: options.stroke,
    backgroundColor: options.fill,
    strokeWidth: options.width,
    roundness: options.round ? { type: 3, value: options.round } : null,
    roughness: paper.roughness,
    groupIds: [paper.unit],
    ...marked({ unit: paper.unit, kind: "figure" }),
  } as unknown as ExcalidrawElementSkeleton;
}

export function buildFishboneSkeletons(
  spec: FishboneSpec,
  at: Rect,
  ink: Ink = MONOCHROME,
  sheet: SheetStyle = FORMAL,
  unit = "fishbone-1",
): ExcalidrawElementSkeleton[] {
  let n = 0;
  const paper: Paper = {
    ink: ink.color,
    font: sheet.fontFamily,
    lineHeight: sheet.lineHeight,
    roughness: sheet.roughness,
    unit,
    id: (part) => `${unit}-${part}-${n++}`,
  };
  const style = fishboneStyle(spec.options.style);
  const size = spec.options.fontSize;
  const plan = planFishbone(spec, at);

  const out: ExcalidrawElementSkeleton[] = [
    {
      type: "rectangle",
      id: `${unit}-frame`,
      x: Math.round(at.x),
      y: Math.round(at.y),
      width: Math.round(at.width),
      height: Math.round(at.height),
      ...BASE,
      strokeColor: "transparent",
      backgroundColor: "transparent",
      strokeWidth: 1,
      roughness: 0,
      groupIds: [unit],
      ...marked({ unit, kind: "figure", core: true, figure: spec }),
    } as unknown as ExcalidrawElementSkeleton,
  ];

  const spineColour = style.coloured ? spec.options.color : paper.ink;

  // --- the spine, running into the head
  out.push(
    line(paper, plan.spine.from, plan.spine.to, {
      stroke: spineColour,
      width: style.spineWidth,
      arrow: spec.options.head === "arrow",
    }),
  );

  // --- the head, and the effect written in it
  const headLines = wrapByWidth(spec.title, plan.head.width - 26, size + 1);
  if (spec.options.head === "box") {
    out.push(
      box(paper, plan.head, {
        stroke: spineColour,
        fill: "#ffffff",
        width: style.spineWidth,
        round: 6,
      }),
    );
  } else if (spec.options.head === "curve") {
    // the tail-fin curve a fishbone is usually drawn with
    const { x, y, width: w, height: h } = plan.head;
    const points: Pt[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const angle = -Math.PI / 2 + t * Math.PI;
      points.push({
        x: Math.round(x + Math.sin(angle) * w * 0.9),
        y: Math.round(y + h / 2 - Math.cos(angle) * (h / 2)),
      });
    }
    const [first] = points;
    out.push({
      type: "line",
      id: paper.id("head"),
      x: first.x,
      y: first.y,
      width: Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
      height: Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)),
      points: points.map((p) => [p.x - first.x, p.y - first.y] as [number, number]),
      ...BASE,
      strokeColor: spineColour,
      backgroundColor: "transparent",
      strokeWidth: style.spineWidth,
      roughness: paper.roughness,
      groupIds: [unit],
      ...marked({ unit, kind: "figure" }),
    } as unknown as ExcalidrawElementSkeleton);
  }
  out.push(
    text(
      paper,
      headLines.join("\n"),
      { x: plan.head.x + plan.head.width / 2 + 6, y: plan.head.y + plan.head.height / 2 },
      { size: size + 1, middle: true },
    ),
  );

  // --- the bones, their names, and the causes on them
  for (const bone of plan.bones) {
    const colour = style.coloured ? bone.color : paper.ink;
    out.push(
      line(paper, bone.tip, bone.root, {
        stroke: colour,
        width: style.boneWidth,
        arrow: spec.options.arrows,
      }),
    );

    const nameLines = wrapByWidth(bone.label, 126, size);
    const nameAt = {
      x: bone.name.x + bone.name.width / 2,
      y: bone.name.y + bone.name.height / 2,
    };
    if (style.boxedNames) {
      out.push(
        box(
          paper,
          bone.name,
          {
            stroke: style.coloured ? colour : paper.ink,
            fill: style.coloured ? colour : "#ffffff",
            width: 1.5,
          },
        ),
      );
    }
    out.push(
      text(paper, nameLines.join("\n"), nameAt, {
        size,
        middle: true,
        color: style.boxedNames && style.coloured ? readableOn(colour) : paper.ink,
      }),
    );

    for (const cause of bone.causes) {
      out.push(
        line(paper, cause.from, cause.at, {
          stroke: colour,
          width: 1,
          arrow: spec.options.arrows,
        }),
      );
      // the caption sits on top of its rule, however many lines it runs to
      out.push(
        text(
          paper,
          cause.lines.join("\n"),
          {
            x: cause.from.x,
            y: cause.from.y - cause.lines.length * (size - 1) * 1.3 - 4,
          },
          { size: size - 1, align: "left" },
        ),
      );
      cause.causes.forEach((deeper, index) => {
        out.push(
          text(
            paper,
            `· ${deeper}`,
            { x: cause.from.x + 10, y: cause.from.y + 3 + index * (size + 2) },
            { size: size - 2, align: "left" },
          ),
        );
      });
    }
  }

  if (spec.options.head !== "box" && spec.options.head !== "curve") {
    // nothing more to draw: an arrow head is the spine's own end
  }

  return out;
}
