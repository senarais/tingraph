import { routeAll } from "@/lib/layout/graph";
import { linesWidth, wrapByWidth } from "@/lib/layout/text";
import type {
  AST,
  DSLNode,
  LayoutDirection,
  PositionedAST,
  PositionedNode,
} from "@/lib/types";

/**
 * A tree, laid out: a decision tree, a work breakdown structure, a hierarchy.
 *
 * The arrangement is the one a tree is always drawn in. A leaf takes its own
 * width; a branch takes the width of everything under it and stands centred
 * over that; and each level is a row, as tall as the tallest box on it. So no
 * two subtrees ever overlap and every parent sits over the middle of its
 * children, which is the whole of what makes a tree read as one.
 *
 * A tree turned sideways is the same drawing with its axes swapped: levels
 * become columns, and a branch stands level with the middle of its children.
 *
 * Only the solid branches place anything. A dashed cross link joins two boxes
 * that are already where the hierarchy put them.
 */

export const TREE_FONT_SIZE = 13;
export const TREE_LINE_HEIGHT = TREE_FONT_SIZE * 1.25;
const MAX_LABEL = 150;
const MARGIN = 60;
/** between two siblings, and between two subtrees */
const SIBLING_GAP = 26;
/** between two levels: the rail a parent's children hang off, and a caption on it */
const LEVEL_GAP = 72;

/** The caption inside a tree box, already wrapped. */
export function wrapTreeLabel(label: string): string[] {
  return wrapByWidth(label, MAX_LABEL, TREE_FONT_SIZE);
}

export function treeShapeSize(node: DSLNode): { width: number; height: number } {
  const lines = wrapTreeLabel(node.label);
  return {
    width: Math.round(Math.max(110, linesWidth(lines, TREE_FONT_SIZE) + 32)),
    height: Math.round(Math.max(44, Math.max(1, lines.length) * TREE_LINE_HEIGHT + 22)),
  };
}

/** The branches that make the hierarchy: every solid edge, in written order. */
function branches(ast: AST): Array<{ from: string; to: string }> {
  return ast.edges.filter((edge) => edge.kind !== "association" && edge.from !== edge.to);
}

export function computeTreeLayout(
  ast: AST,
  direction: LayoutDirection = "down",
): PositionedAST {
  const sideways = direction === "right";
  // along: the axis siblings are spread on; across: the axis levels step on
  const size = new Map(
    ast.nodes.map((node) => {
      const box = treeShapeSize(node);
      return [node.id, box] as const;
    }),
  );
  const along = (id: string) => (sideways ? size.get(id)!.height : size.get(id)!.width);
  const across = (id: string) => (sideways ? size.get(id)!.width : size.get(id)!.height);

  const children = new Map<string, string[]>(ast.nodes.map((node) => [node.id, []]));
  const parented = new Set<string>();
  for (const edge of branches(ast)) {
    // the first branch into a box is the one that places it; the parser has
    // already refused a second, so this only guards a sheet read back by hand
    if (parented.has(edge.to) || !children.has(edge.from) || !children.has(edge.to)) {
      continue;
    }
    parented.add(edge.to);
    children.get(edge.from)!.push(edge.to);
  }
  const roots = ast.nodes.filter((node) => !parented.has(node.id)).map((node) => node.id);

  const depth = new Map<string, number>();
  const span = new Map<string, number>();
  const seen = new Set<string>();
  const measure = (id: string, level: number): number => {
    seen.add(id);
    depth.set(id, level);
    const kids = children.get(id)!.filter((kid) => !seen.has(kid));
    children.set(id, kids);
    const under =
      kids.reduce((sum, kid) => sum + measure(kid, level + 1), 0) +
      Math.max(0, kids.length - 1) * SIBLING_GAP;
    const own = Math.max(along(id), under);
    span.set(id, own);
    return own;
  };
  for (const root of roots) {
    measure(root, 0);
  }
  // a cycle with no way in has no root of its own; stand what is left in a row
  for (const node of ast.nodes) {
    if (!seen.has(node.id)) {
      roots.push(node.id);
      measure(node.id, 0);
    }
  }

  const levels = Math.max(1, ...[...depth.values()].map((level) => level + 1));
  const levelSize = Array.from({ length: levels }, (_, level) =>
    Math.max(0, ...ast.nodes.filter((node) => depth.get(node.id) === level).map((node) => across(node.id))),
  );
  const levelStart: number[] = [];
  let cursor = MARGIN;
  for (let level = 0; level < levels; level += 1) {
    levelStart.push(cursor);
    cursor += levelSize[level] + LEVEL_GAP;
  }

  const placed = new Map<string, { along: number; across: number }>();
  const place = (id: string, start: number): void => {
    const own = span.get(id)!;
    const level = depth.get(id)!;
    placed.set(id, {
      along: start + (own - along(id)) / 2,
      // every box on a level starts on the same line, the way a chart is ruled
      across: levelStart[level],
    });
    const kids = children.get(id)!;
    const under =
      kids.reduce((sum, kid) => sum + span.get(kid)!, 0) +
      Math.max(0, kids.length - 1) * SIBLING_GAP;
    let at = start + (own - under) / 2;
    for (const kid of kids) {
      place(kid, at);
      at += span.get(kid)! + SIBLING_GAP;
    }
  };
  let start = MARGIN;
  for (const root of roots) {
    place(root, start);
    start += span.get(root)! + SIBLING_GAP * 2;
  }

  const nodes: PositionedNode[] = ast.nodes.map((node) => {
    const at = placed.get(node.id)!;
    const box = size.get(node.id)!;
    return {
      ...node,
      width: box.width,
      height: box.height,
      x: Math.round(sideways ? at.across : at.along),
      y: Math.round(sideways ? at.along : at.across),
      rank: depth.get(node.id) ?? 0,
    };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return {
    category: ast.category,
    title: ast.title,
    nodes,
    edges: routeAll(ast.edges, byId, nodes, "tree", direction),
  };
}
