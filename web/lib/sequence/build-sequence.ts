import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { marked } from "@/lib/canvas/units";
import { MONOCHROME, type Ink } from "@/lib/ink";
import { FORMAL, type SheetStyle } from "@/lib/sheet";
import { markColor, toPaper, type PaletteId } from "@/lib/chart/spec";
import {
  HEAD_H,
  planSequence,
  type Pt,
  type Rect,
  type SequencePlan,
} from "@/lib/sequence/layout-sequence";
import {
  sequenceStyle,
  type SequenceHead,
  type SequenceSpec,
} from "@/lib/sequence/spec";

/**
 * A sequence diagram, as shapes on the sheet.
 *
 * Order of drawing is order of stacking: the lifelines go down first so they
 * pass behind everything, then the heads, then the execution bars, then the
 * fragment boxes — whose operator tab is filled, so it stays readable where it
 * crosses a bar — and the messages last of all so an arrow is never hidden by
 * the bar it lands on.
 *
 * Every caption is a text element of its own rather than a caption bound to a
 * shape. A figure is drawn again from its spec on every edit, and a bound
 * caption would be left behind by that: `redrawFigure` takes away the pieces
 * that carry the figure's mark, and Excalidraw does not put a mark on a
 * caption it binds for you.
 */

const BASE = {
  fillStyle: "solid",
  strokeStyle: "solid",
  roundness: null,
  angle: 0,
  opacity: 100,
} as const;

const WHITE = "#ffffff";
const TITLE = 17;
/** the icon above a participant's name, when it is not drawn as a box */
const ICON = 32;

interface Paper {
  ink: string;
  font: number;
  lineHeight: number;
  roughness: number;
  unit: string;
  id: (part: string) => string;
}

function piece(paper: Paper, body: Record<string, unknown>): ExcalidrawElementSkeleton {
  return {
    ...BASE,
    strokeColor: paper.ink,
    backgroundColor: "transparent",
    strokeWidth: 1.5,
    roughness: paper.roughness,
    groupIds: [paper.unit],
    ...marked({ unit: paper.unit, kind: "figure" }),
    ...body,
  } as unknown as ExcalidrawElementSkeleton;
}

function text(
  paper: Paper,
  content: string,
  at: Pt,
  options: { size: number; align?: "left" | "center" | "right"; color?: string },
): ExcalidrawElementSkeleton {
  return piece(paper, {
    type: "text",
    id: paper.id("text"),
    text: content,
    x: Math.round(at.x),
    y: Math.round(at.y),
    strokeColor: options.color ?? paper.ink,
    strokeWidth: 1,
    fontFamily: paper.font,
    fontSize: options.size,
    lineHeight: paper.lineHeight,
    textAlign: options.align ?? "center",
    verticalAlign: "middle",
  });
}

function polyline(
  paper: Paper,
  points: Pt[],
  options: { width?: number; dashed?: boolean; fill?: string; color?: string },
): ExcalidrawElementSkeleton {
  const [first] = points;
  const local = points.map((point) => [point.x - first.x, point.y - first.y]);
  const xs = local.map((point) => point[0]);
  const ys = local.map((point) => point[1]);
  return piece(paper, {
    type: "line",
    id: paper.id("line"),
    x: Math.round(first.x),
    y: Math.round(first.y),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    points: local,
    strokeColor: options.color ?? paper.ink,
    backgroundColor: options.fill ?? "transparent",
    strokeWidth: options.width ?? 1.5,
    strokeStyle: options.dashed ? "dashed" : "solid",
  });
}

/** Points along part of an ellipse, for the drum a database is drawn as. */
function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number): Pt[] {
  const steps = 10;
  return Array.from({ length: steps + 1 }, (_, at) => {
    const angle = from + ((to - from) * at) / steps;
    return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
  });
}

/**
 * The icon a participant that is not a plain box is drawn as: the stick figure
 * of an actor, and the three analysis marks — boundary, control, entity — that
 * a sequence diagram is so often read alongside.
 */
function headIcon(
  paper: Paper,
  kind: SequenceHead,
  cx: number,
  top: number,
  colour: string,
  edge: number,
): ExcalidrawElementSkeleton[] {
  const ring = (x: number, y: number, size: number) =>
    piece(paper, {
      type: "ellipse",
      id: paper.id("icon"),
      x: Math.round(x),
      y: Math.round(y),
      width: size,
      height: size,
      strokeColor: colour,
      backgroundColor: WHITE,
      strokeWidth: edge,
    });

  if (kind === "actor") {
    return [
      ring(cx - 6, top, 12),
      polyline(paper, [{ x: cx, y: top + 12 }, { x: cx, y: top + 22 }], {
        color: colour,
        width: edge,
      }),
      polyline(paper, [{ x: cx - 9, y: top + 16 }, { x: cx + 9, y: top + 16 }], {
        color: colour,
        width: edge,
      }),
      polyline(
        paper,
        [
          { x: cx - 8, y: top + ICON },
          { x: cx, y: top + 22 },
          { x: cx + 8, y: top + ICON },
        ],
        { color: colour, width: edge },
      ),
    ];
  }
  if (kind === "boundary") {
    return [
      polyline(paper, [{ x: cx - 15, y: top + 3 }, { x: cx - 15, y: top + 29 }], {
        color: colour,
        width: edge,
      }),
      polyline(paper, [{ x: cx - 15, y: top + 16 }, { x: cx - 7, y: top + 16 }], {
        color: colour,
        width: edge,
      }),
      ring(cx - 7, top + 5, 22),
    ];
  }
  if (kind === "control") {
    return [
      ring(cx - 11, top + 5, 22),
      polyline(
        paper,
        [
          { x: cx - 5, y: top + 1 },
          { x: cx + 1, y: top + 6 },
          { x: cx - 5, y: top + 11 },
        ],
        { color: colour, width: edge },
      ),
    ];
  }
  if (kind === "entity") {
    return [
      ring(cx - 11, top + 2, 22),
      polyline(paper, [{ x: cx - 11, y: top + 28 }, { x: cx + 11, y: top + 28 }], {
        color: colour,
        width: edge,
      }),
    ];
  }
  // a drum: an ellipse for the lid, two sides, and the curve of the base
  return [
    piece(paper, {
      type: "ellipse",
      id: paper.id("icon"),
      x: Math.round(cx - 13),
      y: top + 1,
      width: 26,
      height: 9,
      strokeColor: colour,
      backgroundColor: WHITE,
      strokeWidth: edge,
    }),
    polyline(paper, [{ x: cx - 13, y: top + 6 }, { x: cx - 13, y: top + 24 }], {
      color: colour,
      width: edge,
    }),
    polyline(paper, [{ x: cx + 13, y: top + 6 }, { x: cx + 13, y: top + 24 }], {
      color: colour,
      width: edge,
    }),
    polyline(paper, arc(cx, top + 24, 13, 5, 0, Math.PI), {
      color: colour,
      width: edge,
    }),
  ];
}

const HEADS: Record<string, "triangle" | "arrow"> = {
  sync: "triangle",
  async: "arrow",
  reply: "arrow",
  create: "arrow",
  destroy: "triangle",
};

export function buildSequenceSkeletons(
  spec: SequenceSpec,
  at: Rect,
  ink: Ink = MONOCHROME,
  sheet: SheetStyle = FORMAL,
  unit = "sequence-1",
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
  const style = sequenceStyle(spec.options.style);
  const palette = spec.options.palette as PaletteId;
  const size = spec.options.fontSize;
  const plan: SequencePlan = planSequence(spec, at);
  const hue = (index: number) =>
    markColor(palette, spec.options, index, spec.participants[index]?.color);

  const out: ExcalidrawElementSkeleton[] = [
    piece(paper, {
      type: "rectangle",
      id: `${unit}-frame`,
      x: Math.round(at.x),
      y: Math.round(at.y),
      width: Math.round(at.width),
      height: Math.round(at.height),
      strokeColor: "transparent",
      strokeWidth: 1,
      roughness: 0,
      ...marked({ unit, kind: "figure", core: true, figure: spec }),
    }),
  ];

  if (spec.title) {
    out.push(
      text(
        paper,
        spec.title,
        { x: at.x + at.width / 2, y: plan.title.y + plan.title.height / 2 },
        { size: TITLE },
      ),
    );
  }

  // --- the lifelines, first so everything else passes over them
  for (const head of plan.heads) {
    if (head.bottom <= head.top) {
      continue;
    }
    out.push(
      polyline(paper, [{ x: head.x, y: head.top }, { x: head.x, y: head.bottom }], {
        width: 1,
        dashed: true,
      }),
    );
  }

  // --- the heads
  plan.heads.forEach((head, index) => {
    const colour = style.coloured ? hue(index) : paper.ink;
    const fill = style.fill > 0 ? toPaper(hue(index), 1 - style.fill / 100) : WHITE;
    if (head.kind === "object") {
      out.push(
        piece(paper, {
          type: "rectangle",
          id: paper.id("head"),
          x: head.caption.x,
          y: head.caption.y,
          width: head.caption.width,
          height: head.caption.height,
          strokeColor: paper.ink,
          backgroundColor: fill,
          strokeWidth: style.edgeWidth,
        }),
      );
    } else {
      out.push(...headIcon(paper, head.kind, head.x, head.box.y, colour, style.edgeWidth));
    }
    out.push(
      text(
        paper,
        head.label,
        { x: head.x, y: head.caption.y + head.caption.height / 2 },
        { size: size + 1 },
      ),
    );
  });

  // --- the execution bars
  for (const bar of plan.bars) {
    out.push(
      piece(paper, {
        type: "rectangle",
        id: paper.id("bar"),
        x: bar.x,
        y: bar.y,
        width: bar.width,
        height: bar.height,
        backgroundColor:
          style.fill > 0 ? toPaper(hue(bar.participant), 1 - style.fill / 100) : WHITE,
        strokeWidth: 1,
      }),
    );
  }

  // --- the combined fragments
  for (const fragment of plan.fragments) {
    out.push(
      piece(paper, {
        type: "rectangle",
        id: paper.id("frag"),
        x: fragment.box.x,
        y: fragment.box.y,
        width: fragment.box.width,
        height: fragment.box.height,
        strokeWidth: 1,
      }),
    );
    out.push(
      polyline(
        paper,
        [
          { x: fragment.tab.x, y: fragment.tab.y },
          { x: fragment.tab.x + fragment.tab.width, y: fragment.tab.y },
          { x: fragment.tab.x + fragment.tab.width, y: fragment.tab.y + fragment.tab.height - 6 },
          { x: fragment.tab.x + fragment.tab.width - 8, y: fragment.tab.y + fragment.tab.height },
          { x: fragment.tab.x, y: fragment.tab.y + fragment.tab.height },
          { x: fragment.tab.x, y: fragment.tab.y },
        ],
        { width: 1, fill: WHITE },
      ),
    );
    out.push(
      text(
        paper,
        fragment.kind,
        { x: fragment.tab.x + 9, y: fragment.tab.y + fragment.tab.height / 2 },
        { size: size - 1, align: "left" },
      ),
    );
    fragment.sections.forEach((section, index) => {
      if (index > 0) {
        out.push(
          polyline(
            paper,
            [
              { x: fragment.box.x, y: section.y },
              { x: fragment.box.x + fragment.box.width, y: section.y },
            ],
            { width: 1, dashed: true },
          ),
        );
      }
      if (!section.guard) {
        return;
      }
      out.push(
        text(
          paper,
          `[${section.guard}]`,
          {
            x: index === 0 ? fragment.tab.x + fragment.tab.width + 8 : fragment.box.x + 10,
            y: index === 0 ? fragment.tab.y + fragment.tab.height / 2 : section.y + 10,
          },
          { size: size - 1, align: "left" },
        ),
      );
    });
  }

  // --- the messages
  for (const message of plan.messages) {
    const [first] = message.points;
    const local = message.points.map((point) => [point.x - first.x, point.y - first.y]);
    const xs = local.map((point) => point[0]);
    const ys = local.map((point) => point[1]);
    out.push(
      piece(paper, {
        type: "arrow",
        id: paper.id("msg"),
        x: Math.round(first.x),
        y: Math.round(first.y),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
        points: local,
        strokeWidth: style.lineWidth,
        strokeStyle:
          message.kind === "reply" || message.kind === "create" ? "dashed" : "solid",
        startArrowhead: null,
        endArrowhead: HEADS[message.kind] ?? "triangle",
      }),
    );
    const caption = spec.options.numbers
      ? `${message.number}: ${message.label}`
      : message.label;
    if (caption.trim()) {
      out.push(
        text(
          paper,
          caption,
          {
            x: message.self
              ? message.caption.x
              : message.caption.x + message.caption.width / 2,
            y: message.caption.y + message.caption.height / 2,
          },
          { size, align: message.self ? "left" : "center" },
        ),
      );
    }
  }

  // --- and the crosses where a lifeline was ended
  for (const cross of plan.crosses) {
    out.push(
      polyline(
        paper,
        [
          { x: cross.x - 8, y: cross.y - 8 },
          { x: cross.x + 8, y: cross.y + 8 },
        ],
        { width: style.lineWidth },
      ),
    );
    out.push(
      polyline(
        paper,
        [
          { x: cross.x + 8, y: cross.y - 8 },
          { x: cross.x - 8, y: cross.y + 8 },
        ],
        { width: style.lineWidth },
      ),
    );
  }

  return out;
}

/** The head band's height, for anything that needs to reach over it. */
export { HEAD_H };
