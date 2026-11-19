import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import { marked } from "@/lib/canvas/units";
import { CATEGORICAL } from "@/lib/chart/spec";
import { MONOCHROME, type Ink } from "@/lib/ink";
import { textWidth } from "@/lib/layout/text";
import { FORMAL, type SheetStyle } from "@/lib/sheet";
import type { SankeySpec } from "@/lib/sankey/spec";

/**
 * A Sankey diagram, laid out and drawn.
 *
 * Nodes stand in columns, a source in the first and a node with nothing going
 * out in the last; everything else one column right of the furthest node that
 * feeds it. Every node is a bar as tall as what passes through it, on one
 * scale for the whole diagram, and every flow a band leaving the right of its
 * source and entering the left of its target as wide as its value — so where
 * the bands leave a node they add up to it, and where they arrive they do
 * too. Within a column the nodes are ordered to cross as few bands as they
 * can, and the bands on a node are stacked in the order of where they go.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Rect extends Pt {
  width: number;
  height: number;
}

export interface PlannedNode {
  box: Rect;
  column: number;
  /** what passes through it: the larger of what comes in and what goes out */
  total: number;
  color: string;
  /** where its name is written, and which way it runs from there */
  label: Rect;
  align: "left" | "right";
}

export interface PlannedFlow {
  /** the band, closed, ready to fill */
  outline: Pt[];
  color: string;
  /** the middle of the band, for a value written on it */
  mid: Pt;
  width: number;
}

export interface SankeyPlan {
  title: Rect;
  nodes: PlannedNode[];
  flows: PlannedFlow[];
  /** where a new flow would be added, for the `+` on the sheet */
  next: Pt;
}

const PAD = 18;
const TITLE = 16;
const BAR = 12;
/** between two nodes in one column, as a share of the column's height */
const GAP = 14;
/** how finely a band's curve is cut into straight runs */
const STEPS = 18;

const round = (value: number) => Math.round(value * 100) / 100;

/** What a node is drawn in when the reader has chosen no colour: the ink. */
const INK = "ink";
/** The light grey an uncoloured band is laid in, so every crossing shows. */
const BAND = "#9ca3af";

function captionOf(spec: SankeySpec, index: number, total: number): string[] {
  const name = spec.nodes[index].label;
  if (!spec.options.values) return [name];
  const value = Number.isInteger(total) ? String(total) : String(round(total));
  return [name, spec.options.unit ? `${value} ${spec.options.unit}` : value];
}

export function planSankey(spec: SankeySpec, at: Rect): SankeyPlan {
  const size = spec.options.fontSize;
  const count = spec.nodes.length;
  const into = spec.nodes.map(() => 0);
  const outOf = spec.nodes.map(() => 0);
  for (const flow of spec.flows) {
    outOf[flow.from] += flow.value;
    into[flow.to] += flow.value;
  }
  const total = spec.nodes.map((_, node) => Math.max(into[node], outOf[node]));

  // --- columns: one right of the furthest node that feeds it; a node with
  // nothing going out stands in the last column, where the flows end
  const column = spec.nodes.map(() => 0);
  for (let pass = 0; pass < count; pass++) {
    let moved = false;
    for (const flow of spec.flows) {
      if (column[flow.to] < column[flow.from] + 1) {
        column[flow.to] = column[flow.from] + 1;
        moved = true;
      }
    }
    if (!moved) break;
  }
  const last = Math.max(0, ...column);
  spec.nodes.forEach((_, node) => {
    if (outOf[node] === 0 && into[node] > 0) column[node] = last;
  });
  const columns = Array.from({ length: last + 1 }, () => [] as number[]);
  spec.nodes.forEach((_, node) => columns[column[node]].push(node));

  // --- the room: names stand outside the first and last columns
  const lines = (node: number) => captionOf(spec, node, total[node]);
  const reach = (node: number) => Math.max(...lines(node).map((text) => textWidth(text, size))) + 10;
  const leftRoom = Math.max(0, ...columns[0].map(reach));
  const rightRoom = last > 0 ? Math.max(0, ...columns[last].map(reach)) : 0;
  const top = at.y + PAD + (spec.title ? TITLE + 14 : 0);
  const plot: Rect = {
    x: at.x + PAD + leftRoom,
    y: top,
    width: Math.max(BAR * 2, at.width - 2 * PAD - leftRoom - rightRoom),
    height: Math.max(40, at.y + at.height - PAD - top),
  };
  const spacing = last > 0 ? (plot.width - BAR) / last : 0;

  // one scale for the whole diagram: the column that needs the most room sets it
  const scale = Math.min(
    ...columns.map((nodes) => {
      const sum = nodes.reduce((acc, node) => acc + total[node], 0);
      return sum > 0 ? (plot.height - GAP * Math.max(0, nodes.length - 1)) / sum : Infinity;
    }),
  );
  const unit = Number.isFinite(scale) ? Math.max(0, scale) : 1;

  // --- order within each column: by where the nodes they trade with stand,
  // swept right then left a few times, which is what keeps the bands untangled
  const centre = spec.nodes.map(() => 0);
  const place = () =>
    columns.forEach((nodes) => {
      const height = nodes.reduce((acc, node) => acc + total[node] * unit, 0) + GAP * Math.max(0, nodes.length - 1);
      let y = plot.y + (plot.height - height) / 2;
      for (const node of nodes) {
        centre[node] = y + (total[node] * unit) / 2;
        y += total[node] * unit + GAP;
      }
    });
  place();
  const weighted = (node: number, toward: "in" | "out") => {
    let sum = 0;
    let weight = 0;
    for (const flow of spec.flows) {
      const other = toward === "in" ? (flow.to === node ? flow.from : -1) : flow.from === node ? flow.to : -1;
      if (other < 0) continue;
      sum += centre[other] * flow.value;
      weight += flow.value;
    }
    return weight > 0 ? sum / weight : centre[node];
  };
  for (let sweep = 0; sweep < 4; sweep++) {
    for (let col = 1; col <= last; col++) columns[col].sort((a, b) => weighted(a, "in") - weighted(b, "in"));
    place();
    for (let col = last - 1; col >= 0; col--) columns[col].sort((a, b) => weighted(a, "out") - weighted(b, "out"));
    place();
  }

  const colorOf = (node: number) =>
    spec.nodes[node].color ?? (spec.options.palette === "colorful" ? CATEGORICAL[node % CATEGORICAL.length] : INK);
  const boxes = spec.nodes.map((_, node) => {
    const height = Math.max(1, total[node] * unit);
    return { x: round(plot.x + column[node] * spacing), y: round(centre[node] - height / 2), width: BAR, height: round(height) };
  });

  // --- the bands, stacked on each node in the order of where they go
  const leaving = spec.nodes.map((_, node) => boxes[node].y);
  const arriving = spec.nodes.map((_, node) => boxes[node].y);
  const order = spec.flows
    .map((flow, index) => ({ flow, index }))
    .sort((a, b) => centre[a.flow.to] - centre[b.flow.to] || centre[a.flow.from] - centre[b.flow.from]);
  const arrivals = spec.flows
    .map((flow, index) => ({ flow, index }))
    .sort((a, b) => centre[a.flow.from] - centre[b.flow.from] || centre[a.flow.to] - centre[b.flow.to]);
  const starts = new Map<number, number>();
  for (const { flow, index } of order) {
    starts.set(index, leaving[flow.from]);
    leaving[flow.from] += flow.value * unit;
  }
  const ends = new Map<number, number>();
  for (const { flow, index } of arrivals) {
    ends.set(index, arriving[flow.to]);
    arriving[flow.to] += flow.value * unit;
  }
  const flows: PlannedFlow[] = spec.flows.map((flow, index) => {
    const width = flow.value * unit;
    const x0 = boxes[flow.from].x + BAR;
    const x1 = boxes[flow.to].x;
    const y0 = starts.get(index) ?? 0;
    const y1 = ends.get(index) ?? 0;
    // a band is two cubic curves, its top and its bottom, with their handles
    // half way across, so it leaves and enters level
    const curve = (from: number, to: number) =>
      Array.from({ length: STEPS + 1 }, (_, step) => {
        const t = step / STEPS;
        const mt = 1 - t;
        const xm = (x0 + x1) / 2;
        return {
          x: round(mt ** 3 * x0 + 3 * mt * mt * t * xm + 3 * mt * t * t * xm + t ** 3 * x1),
          y: round(mt ** 3 * from + 3 * mt * mt * t * from + 3 * mt * t * t * to + t ** 3 * to),
        };
      });
    const upper = curve(y0, y1);
    const lower = curve(y0 + width, y1 + width).reverse();
    const half = upper[Math.floor(STEPS / 2)];
    return {
      outline: [...upper, ...lower, upper[0]],
      color: colorOf(flow.from),
      mid: { x: half.x, y: round(half.y + width / 2) },
      width,
    };
  });

  const nodes: PlannedNode[] = spec.nodes.map((_, node) => {
    const box = boxes[node];
    const text = lines(node);
    const width = Math.max(...text.map((line) => textWidth(line, size)));
    const height = text.length * size * 1.25;
    // the first column is named on its left, every other on its right
    const leftSide = column[node] === 0 && last > 0;
    return {
      box,
      column: column[node],
      total: total[node],
      color: colorOf(node),
      align: leftSide ? "right" : "left",
      label: {
        x: round(leftSide ? box.x - 6 - width : box.x + BAR + 6),
        y: round(box.y + box.height / 2 - height / 2),
        width,
        height,
      },
    };
  });

  return {
    title: { x: at.x + at.width / 2 - 140, y: at.y + PAD - (TITLE + 6) / 2, width: 280, height: TITLE + 6 },
    nodes,
    flows,
    next: { x: at.x + at.width - PAD, y: at.y + at.height - 6 },
  };
}

// ------------------------------------------------------------------- shapes

const BASE = { fillStyle: "solid", strokeStyle: "solid", roundness: null, angle: 0 } as const;

export function buildSankeySkeletons(
  spec: SankeySpec,
  at: Rect,
  ink: Ink = MONOCHROME,
  sheet: SheetStyle = FORMAL,
  unit = "sankey-1",
): ExcalidrawElementSkeleton[] {
  let n = 0;
  const id = (part: string) => `${unit}-${part}-${n++}`;
  const mark = { groupIds: [unit], ...marked({ unit, kind: "figure" }) };
  const out: ExcalidrawElementSkeleton[] = [
    {
      type: "rectangle",
      id: `${unit}-frame`,
      x: Math.round(at.x),
      y: Math.round(at.y),
      width: Math.round(at.width),
      height: Math.round(at.height),
      ...BASE,
      opacity: 100,
      strokeColor: "transparent",
      backgroundColor: "transparent",
      strokeWidth: 1,
      roughness: 0,
      groupIds: [unit],
      ...marked({ unit, kind: "figure", core: true, figure: spec }),
    } as unknown as ExcalidrawElementSkeleton,
  ];
  if (spec.nodes.length === 0) return out;
  const plan = planSankey(spec, at);
  const size = spec.options.fontSize;
  const text = (content: string, point: Pt, fontSize: number, align: "left" | "center" | "right", color = ink.color, middle = false) =>
    ({
      type: "text",
      id: id("text"),
      text: content,
      x: Math.round(point.x),
      y: Math.round(point.y),
      ...BASE,
      opacity: 100,
      strokeColor: color,
      backgroundColor: "transparent",
      strokeWidth: 1,
      roughness: sheet.roughness,
      fontFamily: sheet.fontFamily,
      fontSize,
      lineHeight: sheet.lineHeight,
      textAlign: align,
      verticalAlign: middle ? "middle" : "top",
      ...mark,
    }) as unknown as ExcalidrawElementSkeleton;

  if (spec.title) {
    out.push(text(spec.title, { x: at.x + at.width / 2, y: at.y + PAD }, TITLE, "center", ink.color, true));
  }
  // the bands first, so the node bars stand over their ends
  for (const flow of plan.flows) {
    const [first] = flow.outline;
    const local = flow.outline.map((p) => [Math.round(p.x - first.x), Math.round(p.y - first.y)] as [number, number]);
    const xs = local.map((p) => p[0]);
    const ys = local.map((p) => p[1]);
    out.push({
      type: "line",
      id: id("band"),
      x: Math.round(first.x),
      y: Math.round(first.y),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      points: local,
      ...BASE,
      strokeColor: "transparent",
      // an uncoloured band is light grey, translucent so every crossing shows;
      // a coloured one takes its source's hue the same way
      backgroundColor: flow.color === INK ? BAND : flow.color,
      opacity: flow.color === INK ? 55 : 40,
      strokeWidth: 1,
      roughness: sheet.roughness,
      ...mark,
    } as unknown as ExcalidrawElementSkeleton);
  }
  plan.nodes.forEach((node, index) => {
    out.push({
      type: "rectangle",
      id: id("node"),
      x: Math.round(node.box.x),
      y: Math.round(node.box.y),
      width: Math.round(node.box.width),
      height: Math.max(1, Math.round(node.box.height)),
      ...BASE,
      opacity: 100,
      strokeColor: node.color === INK ? ink.color : node.color,
      backgroundColor: node.color === INK ? ink.color : node.color,
      strokeWidth: 1,
      roughness: sheet.roughness,
      ...mark,
    } as unknown as ExcalidrawElementSkeleton);
    const lines = captionOf(spec, index, node.total);
    let y = node.label.y;
    lines.forEach((line, at2) => {
      const x = node.align === "right" ? node.label.x + node.label.width : node.label.x;
      out.push(text(line, { x, y }, at2 === 0 ? size : size - 1, node.align, at2 === 0 ? ink.color : "#6b7280"));
      y += size * 1.25;
    });
  });
  return out;
}
