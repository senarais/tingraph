import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { FileId } from "@excalidraw/excalidraw/element/types";
import { marked } from "@/lib/canvas/units";
import { MONOCHROME, type Ink } from "@/lib/ink";
import { FORMAL, type SheetStyle } from "@/lib/sheet";
import { readableOn } from "@/lib/chart/spec";
import { mindStyle, type MindShape, type MindSpec } from "@/lib/mind/spec";
import {
  layoutMind,
  type MindPlaced,
  type Pt,
  type Rect,
} from "@/lib/mind/layout-mind";

/**
 * A mind map, as shapes on the sheet.
 *
 * The nodes go down after the lines so a branch passes behind the thing it
 * joins rather than across it, and the frame goes down first of all because it
 * carries the map. Everything a node is drawn as — its outline, its fill, the
 * colour of its caption — comes from the style, and the style is the reader's.
 */

const BASE = {
  fillStyle: "solid",
  strokeStyle: "solid",
  opacity: 100,
  angle: 0,
} as const;

/** A colour taken most of the way to paper, for a fill under black writing. */
function toPaper(hex: string, amount: number): string {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const mixed = [0, 2, 4]
    .map((at) => parseInt(full.slice(at, at + 2), 16))
    .map((channel) => Math.round(channel + (255 - channel) * amount))
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("");
  return `#${mixed}`;
}

interface Paper {
  ink: string;
  font: number;
  lineHeight: number;
  roughness: number;
}

/** The six corners of a hexagon drawn inside a box. */
function hexPoints(box: Rect): Pt[] {
  const cut = Math.min(box.width * 0.22, box.height * 0.6);
  const { x, y, width: w, height: h } = box;
  return [
    { x: x + cut, y },
    { x: x + w - cut, y },
    { x: x + w, y: y + h / 2 },
    { x: x + w - cut, y: y + h },
    { x: x + cut, y: y + h },
    { x, y: y + h / 2 },
    { x: x + cut, y },
  ];
}

function polyline(
  id: string,
  points: Pt[],
  options: { stroke: string; width: number; fill?: string },
  paper: Paper,
  unit: string,
): ExcalidrawElementSkeleton {
  const [first] = points;
  const local = points.map(
    (point) =>
      [Math.round(point.x - first.x), Math.round(point.y - first.y)] as [number, number],
  );
  const xs = local.map((p) => p[0]);
  const ys = local.map((p) => p[1]);
  return {
    type: "line",
    id,
    x: Math.round(first.x),
    y: Math.round(first.y),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    points: local,
    ...BASE,
    strokeColor: options.stroke,
    strokeWidth: options.width,
    backgroundColor: options.fill ?? "transparent",
    roundness: null,
    roughness: paper.roughness,
    groupIds: [unit],
    ...marked({ unit, kind: "figure" }),
  } as unknown as ExcalidrawElementSkeleton;
}

/** The shape one node is drawn as, or nothing when it is drawn as a label. */
function nodeShape(
  id: string,
  entry: MindPlaced,
  shape: MindShape,
  colours: { stroke: string; fill: string; width: number },
  paper: Paper,
  unit: string,
): ExcalidrawElementSkeleton | null {
  if (shape === "none" || colours.width === 0) {
    return null;
  }
  if (shape === "hex") {
    return polyline(
      id,
      hexPoints(entry.box),
      { stroke: colours.stroke, width: colours.width, fill: colours.fill },
      paper,
      unit,
    );
  }
  const type = shape === "circle" ? "ellipse" : shape === "diamond" ? "diamond" : "rectangle";
  const roundness =
    type !== "rectangle"
      ? null
      : shape === "pill"
        ? { type: 3, value: Math.round(entry.box.height / 2) }
        : shape === "round"
          ? { type: 3, value: 10 }
          : null;
  return {
    type,
    id,
    x: Math.round(entry.box.x),
    y: Math.round(entry.box.y),
    width: Math.max(1, Math.round(entry.box.width)),
    height: Math.max(1, Math.round(entry.box.height)),
    ...BASE,
    strokeColor: colours.stroke,
    backgroundColor: colours.fill,
    strokeWidth: colours.width,
    roundness,
    roughness: paper.roughness,
    groupIds: [unit],
    ...marked({ unit, kind: "figure" }),
  } as unknown as ExcalidrawElementSkeleton;
}

/**
 * Every shape one mind map is made of. The frame comes first and carries the
 * whole of it, so redrawing is a matter of throwing the rest away and building
 * them again from the spec it holds.
 */
export function buildMindSkeletons(
  spec: MindSpec,
  at: Rect,
  ink: Ink = MONOCHROME,
  sheet: SheetStyle = FORMAL,
  unit = "mind-1",
): ExcalidrawElementSkeleton[] {
  const paper: Paper = {
    ink: ink.color,
    font: sheet.fontFamily,
    lineHeight: sheet.lineHeight,
    roughness: sheet.roughness,
  };
  const style = mindStyle(spec.options.style);
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
      roundness: null,
      roughness: 0,
      groupIds: [unit],
      ...marked({ unit, kind: "figure", core: true, figure: spec }),
    } as unknown as ExcalidrawElementSkeleton,
  ];

  // the title takes a band off the top, so the map is arranged in what is left
  const inner = spec.title
    ? { x: at.x, y: at.y + 28, width: at.width, height: Math.max(80, at.height - 28) }
    : at;
  const drawing = layoutMind(spec, inner, paper.ink);
  let n = 0;
  const id = (part: string) => `${unit}-${part}-${n++}`;

  // --- the branches, under everything they join
  for (const link of drawing.links) {
    out.push(
      polyline(
        id("branch"),
        link.points,
        { stroke: link.color, width: style.lineWidth },
        paper,
        unit,
      ),
    );
  }

  // --- the nodes themselves
  for (const entry of drawing.nodes) {
    const shape = entry.shape;
    const picture = entry.node.image;
    if (picture) {
      out.push({
        type: "image",
        id: id("picture"),
        x: Math.round(entry.box.x),
        y: Math.round(entry.box.y),
        width: Math.max(1, Math.round(entry.box.width)),
        height: Math.max(1, Math.round(entry.box.height)),
        fileId: picture.fileId as FileId,
        ...BASE,
        strokeColor: "transparent",
        backgroundColor: "transparent",
        strokeWidth: 1,
        roundness: null,
        groupIds: [unit],
        ...marked({ unit, kind: "figure" }),
      } as unknown as ExcalidrawElementSkeleton);
      continue;
    }

    const fill =
      style.wash === 0 ? "#ffffff" : toPaper(entry.color, style.wash);
    const stroke = style.inkOutline ? paper.ink : entry.color;
    const drawn = nodeShape(
      id("node"),
      entry,
      shape,
      { stroke, fill, width: style.edgeWidth * (entry.depth === 0 ? 1.4 : 1) },
      paper,
      unit,
    );
    if (drawn) {
      out.push(drawn);
    }
    const size =
      spec.options.fontSize * (entry.depth === 0 ? 1.25 : 1) * drawing.scale;
    out.push({
      type: "text",
      id: id("label"),
      text: entry.lines.join("\n") || entry.node.label,
      x: Math.round(entry.at.x),
      y: Math.round(entry.at.y),
      ...BASE,
      strokeColor:
        drawn && style.wash > 0 && style.wash < 0.5 ? readableOn(fill) : paper.ink,
      backgroundColor: "transparent",
      strokeWidth: 1,
      roundness: null,
      roughness: paper.roughness,
      fontFamily: paper.font,
      fontSize: Math.max(8, Math.round(size)),
      lineHeight: paper.lineHeight,
      textAlign: "center",
      verticalAlign: "middle",
      groupIds: [unit],
      ...marked({ unit, kind: "figure" }),
    } as unknown as ExcalidrawElementSkeleton);
  }

  if (spec.title) {
    out.push({
      type: "text",
      id: id("title"),
      text: spec.title,
      x: Math.round(at.x + at.width / 2),
      y: Math.round(at.y + 8),
      ...BASE,
      strokeColor: paper.ink,
      backgroundColor: "transparent",
      strokeWidth: 1,
      roundness: null,
      roughness: paper.roughness,
      fontFamily: paper.font,
      fontSize: 15,
      lineHeight: paper.lineHeight,
      textAlign: "center",
      verticalAlign: "top",
      groupIds: [unit],
      ...marked({ unit, kind: "figure" }),
    } as unknown as ExcalidrawElementSkeleton);
  }

  return out;
}
