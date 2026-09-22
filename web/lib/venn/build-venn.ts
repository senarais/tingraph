import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { marked } from "@/lib/canvas/units";
import { MONOCHROME, type Ink } from "@/lib/ink";
import { FORMAL, type SheetStyle } from "@/lib/sheet";
import { markColor, type PaletteId } from "@/lib/chart/spec";
import { wrapByWidth } from "@/lib/layout/compute-layout";
import { vennRegions, vennStyle, type VennSpec } from "@/lib/venn/spec";

/**
 * A Venn diagram, laid out and drawn.
 *
 * Three rings of one size on the corners of an equilateral triangle, or two on
 * a line: that is the whole geometry, and every region's label is placed from
 * it rather than guessed. A region between two rings sits on the line between
 * their middles, pushed away from the third; the region in all three sits in
 * the middle of the lot. The fills are laid on washed, so an overlap deepens
 * on its own instead of needing a shape cut for it.
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
  roundness: null,
  angle: 0,
} as const;

const PAD = 18;
const TITLE = 17;

export interface VennPlan {
  /** the middle of each ring, and how big they all are */
  centres: Pt[];
  radius: number;
  middle: Pt;
  /** where each region's label goes, keyed the way the spec keys them */
  spots: Record<string, Pt>;
  /** where each set's own name goes, and which way it grows from there */
  names: Array<{ at: Pt; align: "left" | "center" | "right" }>;
  outside: Pt;
  /** the box the title is written in, whether or not there is one */
  title: Rect;
}

/**
 * Where everything sits. Kept apart from the drawing so the panel and the
 * handles on the sheet can ask the same question the renderer asks.
 */
export function planVenn(spec: VennSpec, at: Rect): VennPlan {
  const three = spec.sets.length >= 3;
  const top = at.y + (spec.title ? TITLE + 14 : 0) + PAD;
  const room = {
    x: at.x + PAD,
    y: top,
    width: Math.max(60, at.width - PAD * 2),
    height: Math.max(60, at.y + at.height - PAD - top),
  };
  const middle = { x: room.x + room.width / 2, y: room.y + room.height / 2 };
  // the room the whole arrangement has: a ring's own radius plus how far its
  // middle sits out from the centre, which is what has to fit
  const reach = Math.min(room.width, room.height) / 2 - 4;
  // how far a ring's middle sits out, as a share of its radius; a wider
  // overlap pulls them in
  const spread = 0.36 + (1 - spec.options.overlap) * 0.5;
  const radius = Math.round(reach / (1 + spread));
  const away = radius * spread;

  const centres: Pt[] = three
    ? [-90, 30, 150].map((deg) => {
        const angle = (deg * Math.PI) / 180;
        return {
          x: Math.round(middle.x + Math.cos(angle) * away),
          y: Math.round(middle.y + Math.sin(angle) * away),
        };
      })
    : [
        { x: Math.round(middle.x - away), y: Math.round(middle.y) },
        { x: Math.round(middle.x + away), y: Math.round(middle.y) },
      ];

  const push = (from: Pt, by: number): Pt => {
    const dx = from.x - middle.x;
    const dy = from.y - middle.y;
    const length = Math.hypot(dx, dy) || 1;
    return {
      x: Math.round(from.x + (dx / length) * by),
      y: Math.round(from.y + (dy / length) * by),
    };
  };

  const spots: Record<string, Pt> = {};
  centres.forEach((centre, index) => {
    spots["ABC".charAt(index)] = push(centre, radius * (three ? 0.45 : 0.42));
  });
  const pair = (a: number, b: number) => ({
    x: (centres[a].x + centres[b].x) / 2,
    y: (centres[a].y + centres[b].y) / 2,
  });
  if (three) {
    // the lens two rings make runs out from the midpoint of their middles, and
    // the third ring covers the inner half of it; the label belongs in what is
    // left, which is the outer half
    const lens = radius * 0.45;
    spots.AB = push(pair(0, 1), lens);
    spots.AC = push(pair(0, 2), lens);
    spots.BC = push(pair(1, 2), lens);
    spots.ABC = { ...middle };
  } else {
    spots.AB = { ...middle };
  }

  return {
    centres,
    radius,
    middle,
    spots,
    // a set's name grows away from its ring rather than over it
    names: centres.map((centre) => {
      const at = push(centre, radius + 9);
      const dx = at.x - middle.x;
      const dy = at.y - middle.y;
      const align =
        Math.abs(dx) < Math.abs(dy) * 0.5 ? "center" : dx > 0 ? "left" : "right";
      return { at, align: align as "left" | "center" | "right" };
    }),
    outside: {
      x: at.x + at.width - PAD,
      y: at.y + at.height - PAD - spec.options.fontSize,
    },
    title: {
      x: at.x + at.width / 2 - 110,
      y: at.y + PAD - (TITLE + 6) / 2,
      width: 220,
      height: TITLE + 6,
    },
  };
}

interface Paper {
  ink: string;
  font: number;
  lineHeight: number;
  roughness: number;
  unit: string;
  id: (part: string) => string;
}

function text(
  paper: Paper,
  content: string,
  at: Pt,
  options: { size: number; align?: "left" | "center" | "right"; color?: string },
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
    opacity: 100,
    roughness: paper.roughness,
    fontFamily: paper.font,
    fontSize: options.size,
    lineHeight: paper.lineHeight,
    textAlign: options.align ?? "center",
    verticalAlign: "middle",
    groupIds: [paper.unit],
    ...marked({ unit: paper.unit, kind: "figure" }),
  } as unknown as ExcalidrawElementSkeleton;
}

export function buildVennSkeletons(
  spec: VennSpec,
  at: Rect,
  ink: Ink = MONOCHROME,
  sheet: SheetStyle = FORMAL,
  unit = "venn-1",
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
  const style = vennStyle(spec.options.style);
  const palette = spec.options.palette as PaletteId;
  const plan = planVenn(spec, at);
  const size = spec.options.fontSize;

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
      opacity: 100,
      roughness: 0,
      groupIds: [unit],
      ...marked({ unit, kind: "figure", core: true, figure: spec }),
    } as unknown as ExcalidrawElementSkeleton,
  ];

  if (spec.title) {
    out.push(
      text(paper, spec.title, { x: at.x + at.width / 2, y: at.y + PAD }, { size: TITLE }),
    );
  }

  // --- the rings
  plan.centres.forEach((centre, index) => {
    const hue = markColor(palette, spec.options, index, spec.sets[index]?.color);
    out.push({
      type: "ellipse",
      id: paper.id("ring"),
      x: Math.round(centre.x - plan.radius),
      y: Math.round(centre.y - plan.radius),
      width: plan.radius * 2,
      height: plan.radius * 2,
      ...BASE,
      strokeColor: style.inkOutline ? paper.ink : hue,
      backgroundColor: style.fill > 0 ? hue : "transparent",
      strokeWidth: style.edgeWidth,
      opacity: style.fill > 0 ? style.fill : 100,
      roughness: paper.roughness,
      groupIds: [unit],
      ...marked({ unit, kind: "figure" }),
    } as unknown as ExcalidrawElementSkeleton);
  });

  // --- what is in each region
  for (const key of vennRegions(spec.sets.length)) {
    const content = spec.regions[key];
    const shown = content || (spec.options.zeros ? "0" : "");
    const spot = plan.spots[key];
    if (!shown || !spot) {
      continue;
    }
    const lines = wrapByWidth(shown, plan.radius * 0.85, size);
    out.push(
      text(
        paper,
        lines.join("\n"),
        { x: spot.x, y: spot.y - (lines.length - 1) * size * 0.65 },
        { size },
      ),
    );
  }

  // --- the names of the sets themselves
  spec.sets.forEach((set, index) => {
    const spot = plan.names[index];
    if (!set.label || !spot) {
      return;
    }
    const hue = markColor(palette, spec.options, index, set.color);
    out.push(
      text(paper, set.label, spot.at, {
        size: size + 1,
        align: spot.align,
        color: style.inkOutline ? paper.ink : hue,
      }),
    );
  });

  const outside = spec.regions.out;
  if (outside) {
    out.push(
      text(paper, outside, plan.outside, { size, align: "right" }),
    );
  }

  return out;
}
