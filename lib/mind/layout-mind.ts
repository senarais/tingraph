/**
 * Where every node of a mind map goes.
 *
 * A mind map is laid out by the shape of its own tree: a branch is given room
 * in proportion to how much hangs off it, so a heavy branch spreads and a
 * light one stays tight. Three arrangements, and each is a different answer to
 * the same question — a radial map fans the branches round the idea, a
 * two-sided one stacks them left and right, and a downward one is a tree.
 *
 * A node the reader has pinned is moved to where they put it, and its whole
 * subtree moves with it. That is what makes the sheet the main place to build
 * one of these: the layout arranges everything you have not touched, round
 * everything you have.
 *
 * No Excalidraw here, so all of it runs under `tsx`.
 */

import { textWidth, wrapByWidth } from "@/lib/layout/compute-layout";
import { markColor, type PaletteId } from "@/lib/chart/spec";
import {
  mindStyle,
  walkMind,
  type MindNode,
  type MindShape,
  type MindSpec,
} from "@/lib/mind/spec";

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MindPlaced {
  id: string;
  node: MindNode;
  depth: number;
  /** the middle of the node, in sheet units */
  at: Pt;
  box: Rect;
  shape: MindShape;
  color: string;
  lines: string[];
  /** which way this node faces away from its parent, for a new child */
  angle: number;
  parent: string | null;
}

export interface MindLink {
  points: Pt[];
  color: string;
  from: string;
  to: string;
}

export interface MindDrawing {
  box: Rect;
  nodes: MindPlaced[];
  links: MindLink[];
  /** the middle of the map, which the idea sits on unless it was pinned */
  centre: Pt;
  /**
   * How the arrangement was carried into the frame. Worked out from the map as
   * the layout would draw it, *before* any pin is applied, so dragging a node
   * never shifts the rest of the map under the hand.
   */
  origin: Pt;
  scale: number;
}

const PAD_X = 14;
const PAD_Y = 9;
const LINE = 1.35;
/** the widest a label is set before it wraps */
const WRAP = 132;
/** how much bigger the idea in the middle is set than a branch */
const ROOT_SCALE = 1.25;

const round = (value: number) => Math.round(value * 100) / 100;

// ------------------------------------------------------------------- sizing

function shapeOf(spec: MindSpec, node: MindNode, depth: number): MindShape {
  if (node.shape) {
    return node.shape;
  }
  if (node.image) {
    return "box";
  }
  // the idea in the middle of a radial map reads as a hub, so it is round
  if (depth === 0 && spec.options.layout === "radial" && spec.options.shape === "round") {
    return "circle";
  }
  return spec.options.shape;
}

function sizeOf(
  spec: MindSpec,
  node: MindNode,
  depth: number,
  shape: MindShape,
): { box: { width: number; height: number }; lines: string[] } {
  if (node.image) {
    return { box: { width: node.image.width, height: node.image.height }, lines: [] };
  }
  const size = spec.options.fontSize * (depth === 0 ? ROOT_SCALE : 1);
  const lines = wrapByWidth(node.label, WRAP * (depth === 0 ? 1.2 : 1), size);
  const text = Math.max(
    16,
    lines.reduce((most, line) => Math.max(most, textWidth(line, size)), 0),
  );
  const tall = Math.max(size, lines.length * size * LINE);
  if (shape === "none") {
    return { box: { width: text, height: tall }, lines };
  }
  if (shape === "circle") {
    const across = Math.max(text * 1.35, tall * 1.9, 54);
    return { box: { width: across, height: across }, lines };
  }
  if (shape === "diamond") {
    return { box: { width: text * 1.8 + PAD_X, height: tall * 2.1 + PAD_Y }, lines };
  }
  if (shape === "hex") {
    return { box: { width: text + PAD_X * 3, height: tall + PAD_Y * 2 }, lines };
  }
  return { box: { width: text + PAD_X * 2, height: tall + PAD_Y * 2 }, lines };
}

// ------------------------------------------------------------------ colours

/**
 * What colour a node takes. A branch keeps one hue all the way down when the
 * reader asks for it, which is what lets the eye follow a branch; otherwise
 * the hue steps with the level.
 */
function colourOf(
  spec: MindSpec,
  node: MindNode,
  depth: number,
  branch: number,
  ink: string,
): string {
  if (node.color) {
    return node.color;
  }
  if (depth === 0) {
    return spec.options.palette === "single" ? spec.options.color : ink;
  }
  const index = spec.options.branchColors ? branch : depth - 1;
  return markColor(spec.options.palette as PaletteId, spec.options, index);
}

// ------------------------------------------------------------------ the tree

/** How many ends a branch has, which is how much room it is given. */
function leafCount(node: MindNode): number {
  return node.children.length === 0
    ? 1
    : node.children.reduce((sum, child) => sum + leafCount(child), 0);
}

interface Sized {
  node: MindNode;
  depth: number;
  branch: number;
  shape: MindShape;
  size: { width: number; height: number };
  lines: string[];
  color: string;
  children: Sized[];
}

function measure(
  spec: MindSpec,
  node: MindNode,
  depth: number,
  branch: number,
  ink: string,
): Sized {
  const shape = shapeOf(spec, node, depth);
  const { box, lines } = sizeOf(spec, node, depth, shape);
  return {
    node,
    depth,
    branch,
    shape,
    size: box,
    lines,
    color: colourOf(spec, node, depth, branch, ink),
    children: node.children.map((child, index) =>
      measure(spec, child, depth + 1, depth === 0 ? index : branch, ink),
    ),
  };
}

// ---------------------------------------------------------------- radial fan

/**
 * How far out each ring sits.
 *
 * Far enough that everything on it fits round it: the ring has to be at least
 * as long as the captions standing on it, or two branches that meet at the top
 * of the fan print over each other. The reader's spread is the floor, never the
 * ceiling — a map with a lot on one level simply grows, and the whole thing is
 * scaled back into its frame afterwards.
 */
function radialRings(root: Sized, spread: number): number[] {
  const needed = new Map<number, number>();
  const walk = (entry: Sized) => {
    needed.set(
      entry.depth,
      (needed.get(entry.depth) ?? 0) + entry.size.width + 44,
    );
    entry.children.forEach(walk);
  };
  walk(root);
  const rings = [0];
  let last = 0;
  for (let depth = 1; needed.has(depth); depth++) {
    const base = spread * (depth === 1 ? 1 : 1 + (depth - 1) * 0.78);
    const room = (needed.get(depth) as number) / (2 * Math.PI);
    const radius = Math.max(base, room, last + 92);
    rings.push(radius);
    last = radius;
  }
  return rings;
}

function placeRadial(
  root: Sized,
  spread: number,
  into: Map<string, MindPlaced>,
): void {
  const rings = radialRings(root, spread);
  const ring = (depth: number) => rings[depth] ?? rings[rings.length - 1];
  const put = (
    entry: Sized,
    from: number,
    to: number,
    parent: string | null,
  ): void => {
    const middle = (from + to) / 2;
    const radius = entry.depth === 0 ? 0 : ring(entry.depth);
    const at = {
      x: round(Math.cos(middle) * radius),
      y: round(Math.sin(middle) * radius),
    };
    into.set(entry.node.id, {
      id: entry.node.id,
      node: entry.node,
      depth: entry.depth,
      at,
      box: {
        x: round(at.x - entry.size.width / 2),
        y: round(at.y - entry.size.height / 2),
        width: entry.size.width,
        height: entry.size.height,
      },
      shape: entry.shape,
      color: entry.color,
      lines: entry.lines,
      angle: entry.depth === 0 ? -Math.PI / 2 : middle,
      parent,
    });
    const total = entry.children.reduce((sum, child) => sum + leafCount(child.node), 0);
    let cursor = from;
    for (const child of entry.children) {
      const share = total > 0 ? leafCount(child.node) / total : 0;
      const span = (to - from) * share;
      put(child, cursor, cursor + span, entry.node.id);
      cursor += span;
    }
  };
  // the fan opens at twelve o'clock, so the first branch is the one on top
  put(root, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, null);
}

// ------------------------------------------------------- two sides, and down

/**
 * A branch is given a band as deep as everything hanging off it needs, and
 * sits in the middle of its own band. The same walk serves the two-sided map
 * and the downward one, with `across` naming whichever axis the tree grows
 * along.
 */
function stack(
  entry: Sized,
  gap: number,
  along: (size: { width: number; height: number }) => number,
): number {
  if (entry.children.length === 0) {
    return along(entry.size);
  }
  const inner =
    entry.children.reduce((sum, child) => sum + stack(child, gap, along), 0) +
    gap * (entry.children.length - 1);
  return Math.max(along(entry.size), inner);
}

function placeSides(
  root: Sized,
  spec: MindSpec,
  into: Map<string, MindPlaced>,
): void {
  const down = spec.options.layout === "down";
  const gap = 16;
  const step = spec.options.spread;
  const along = (size: { width: number; height: number }) =>
    down ? size.width + gap : size.height + gap;

  const put = (
    entry: Sized,
    depth: number,
    side: number,
    slot: number,
    span: number,
    parent: string | null,
  ): void => {
    const middle = slot + span / 2;
    const out = depth === 0 ? 0 : step * depth * side;
    const at = down
      ? { x: round(middle), y: round(out) }
      : { x: round(out), y: round(middle) };
    into.set(entry.node.id, {
      id: entry.node.id,
      node: entry.node,
      depth,
      at,
      box: {
        x: round(at.x - entry.size.width / 2),
        y: round(at.y - entry.size.height / 2),
        width: entry.size.width,
        height: entry.size.height,
      },
      shape: entry.shape,
      color: entry.color,
      lines: entry.lines,
      angle: down
        ? side >= 0
          ? Math.PI / 2
          : -Math.PI / 2
        : side >= 0
          ? 0
          : Math.PI,
      parent,
    });
    const inner =
      entry.children.reduce((sum, child) => sum + stack(child, gap, along), 0) +
      gap * Math.max(0, entry.children.length - 1);
    let cursor = middle - inner / 2;
    for (const child of entry.children) {
      const room = stack(child, gap, along);
      put(child, depth + 1, side, cursor, room, entry.node.id);
      cursor += room + gap;
    }
  };

  // the branches are split between the two sides, heaviest first so the map
  // comes out about even
  const half = down ? root.children.length : Math.ceil(root.children.length / 2);
  const sides: Array<{ list: Sized[]; side: number }> = down
    ? [{ list: root.children, side: 1 }]
    : [
        { list: root.children.slice(0, half), side: 1 },
        { list: root.children.slice(half), side: -1 },
      ];

  into.set(root.node.id, {
    id: root.node.id,
    node: root.node,
    depth: 0,
    at: { x: 0, y: 0 },
    box: {
      x: round(-root.size.width / 2),
      y: round(-root.size.height / 2),
      width: root.size.width,
      height: root.size.height,
    },
    shape: root.shape,
    color: root.color,
    lines: root.lines,
    angle: down ? Math.PI / 2 : 0,
    parent: null,
  });

  for (const { list, side } of sides) {
    const inner =
      list.reduce((sum, child) => sum + stack(child, gap, along), 0) +
      gap * Math.max(0, list.length - 1);
    let cursor = -inner / 2;
    for (const child of list) {
      const room = stack(child, gap, along);
      put(child, 1, side, cursor, room, root.node.id);
      cursor += room + gap;
    }
  }
}

// ------------------------------------------------------------------ the pins

/** A node the reader moved takes its whole subtree with it. */
function applyPins(spec: MindSpec, placed: Map<string, MindPlaced>): void {
  for (const { node } of walkMind(spec.root)) {
    const pin = node.at;
    const entry = pin ? placed.get(node.id) : undefined;
    if (!pin || !entry) {
      continue;
    }
    const dx = pin.x - entry.at.x;
    const dy = pin.y - entry.at.y;
    if (dx === 0 && dy === 0) {
      continue;
    }
    for (const { node: moved } of walkMind(node)) {
      const target = placed.get(moved.id);
      if (target) {
        target.at = { x: round(target.at.x + dx), y: round(target.at.y + dy) };
        target.box = {
          ...target.box,
          x: round(target.box.x + dx),
          y: round(target.box.y + dy),
        };
      }
    }
  }
}

// ------------------------------------------------------------------- joining

/** Where a line leaves a node: the outline, in the direction of the other one. */
function edgePoint(entry: MindPlaced, toward: Pt): Pt {
  const dx = toward.x - entry.at.x;
  const dy = toward.y - entry.at.y;
  if (dx === 0 && dy === 0) {
    return entry.at;
  }
  const halfW = entry.box.width / 2;
  const halfH = entry.box.height / 2;
  if (entry.shape === "circle") {
    const length = Math.hypot(dx, dy);
    return {
      x: round(entry.at.x + (dx / length) * halfW),
      y: round(entry.at.y + (dy / length) * halfH),
    };
  }
  const scale = Math.min(
    halfW / Math.max(1e-6, Math.abs(dx)),
    halfH / Math.max(1e-6, Math.abs(dy)),
  );
  return { x: round(entry.at.x + dx * scale), y: round(entry.at.y + dy * scale) };
}

function bezier(from: Pt, to: Pt, outFrom: Pt, outTo: Pt): Pt[] {
  const points: Pt[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const u = 1 - t;
    points.push({
      x: round(
        u * u * u * from.x + 3 * u * u * t * outFrom.x + 3 * u * t * t * outTo.x + t * t * t * to.x,
      ),
      y: round(
        u * u * u * from.y + 3 * u * u * t * outFrom.y + 3 * u * t * t * outTo.y + t * t * t * to.y,
      ),
    });
  }
  return points;
}

function joinNodes(spec: MindSpec, placed: Map<string, MindPlaced>): MindLink[] {
  const links: MindLink[] = [];
  for (const entry of placed.values()) {
    const parent = entry.parent ? placed.get(entry.parent) : null;
    if (!parent) {
      continue;
    }
    const from = edgePoint(parent, entry.at);
    const to = edgePoint(entry, parent.at);
    const kind = spec.options.line;
    let points: Pt[];
    if (kind === "straight") {
      points = [from, to];
    } else if (kind === "elbow") {
      const middle = spec.options.layout === "down" ? (from.y + to.y) / 2 : (from.x + to.x) / 2;
      points =
        spec.options.layout === "down"
          ? [from, { x: from.x, y: round(middle) }, { x: to.x, y: round(middle) }, to]
          : [from, { x: round(middle), y: from.y }, { x: round(middle), y: to.y }, to];
    } else {
      // out of the parent the way it faces, and into the child the same way,
      // which is what gives a mind map its S-shaped branches
      const reach = Math.hypot(to.x - from.x, to.y - from.y) * 0.42;
      const lead = parent.depth === 0 ? entry.angle : parent.angle;
      points = bezier(
        from,
        to,
        { x: from.x + Math.cos(lead) * reach, y: from.y + Math.sin(lead) * reach },
        { x: to.x - Math.cos(entry.angle) * reach, y: to.y - Math.sin(entry.angle) * reach },
      );
    }
    links.push({ points, color: entry.color, from: parent.id, to: entry.id });
  }
  return links;
}

// ----------------------------------------------------------------------- api

/**
 * The whole map, drawn into `box`. The tree is arranged around the origin
 * first and then carried into the box, so a map that has grown lopsided under
 * the reader's hand still sits in the middle of its own frame.
 */
export function layoutMind(spec: MindSpec, box: Rect, ink = "#1e1e1e"): MindDrawing {
  const root = measure(spec, spec.root, 0, 0, ink);
  const placed = new Map<string, MindPlaced>();
  if (spec.options.layout === "radial") {
    placeRadial(root, spec.options.spread, placed);
  } else {
    placeSides(root, spec, placed);
  }
  // --- carry the map into its frame, scaled down if it has outgrown it. The
  // frame is worked out from the arrangement alone, so pinning a node moves
  // that node rather than everything else
  const style = mindStyle(spec.options.style);
  const pad = 18 + style.edgeWidth;
  const xs = [...placed.values()].flatMap((entry) => [
    entry.box.x,
    entry.box.x + entry.box.width,
  ]);
  const ys = [...placed.values()].flatMap((entry) => [
    entry.box.y,
    entry.box.y + entry.box.height,
  ]);
  const left = Math.min(...xs, 0);
  const right = Math.max(...xs, 0);
  const top = Math.min(...ys, 0);
  const bottom = Math.max(...ys, 0);
  const scale = Math.min(
    1,
    (box.width - pad * 2) / Math.max(1, right - left),
    (box.height - pad * 2) / Math.max(1, bottom - top),
  );
  const originX = box.x + box.width / 2 - ((left + right) / 2) * scale;
  const originY = box.y + box.height / 2 - ((top + bottom) / 2) * scale;
  const carry = (point: Pt): Pt => ({
    x: round(originX + point.x * scale),
    y: round(originY + point.y * scale),
  });
  applyPins(spec, placed);

  for (const entry of placed.values()) {
    const middle = carry(entry.at);
    entry.at = middle;
    entry.box = {
      x: round(middle.x - (entry.box.width * scale) / 2),
      y: round(middle.y - (entry.box.height * scale) / 2),
      width: round(entry.box.width * scale),
      height: round(entry.box.height * scale),
    };
  }
  const links = joinNodes(spec, placed);

  return {
    box,
    nodes: [...placed.values()].sort((a, b) => a.depth - b.depth),
    links,
    centre: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    origin: { x: round(originX), y: round(originY) },
    scale,
  };
}

/**
 * Where a node the reader is dragging should be pinned. The point on the sheet
 * is carried back into the arrangement's own coordinates, which is exactly the
 * inverse of the carry above, so a node let go of under the pointer is drawn
 * back under the pointer.
 */
export function pinAt(drawing: MindDrawing, at: Pt): Pt {
  return {
    x: round((at.x - drawing.origin.x) / drawing.scale),
    y: round((at.y - drawing.origin.y) / drawing.scale),
  };
}
