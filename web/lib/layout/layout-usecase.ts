import { routeBetween, type Box } from "@/lib/canvas/connect";
import { linesWidth, wrapByWidth } from "@/lib/layout/text";
import type {
  AST,
  DSLEdge,
  DSLNode,
  LayoutDirection,
  PositionedAST,
  PositionedEdge,
  PositionedNode,
  PositionedPool,
} from "@/lib/types";

/**
 * A use case diagram, laid out.
 *
 * The whole arrangement is one idea: the system's use cases stand in a column
 * inside its boundary, and the actors stand outside it on the side they belong
 * on — the ones that start something on the left, the ones that only answer on
 * the right. That is the convention every readable use case diagram follows,
 * and it is the one thing the layout has to get right, because everything else
 * is a straight line between two of them.
 *
 * An actor with no side written for it takes the left when it starts anything
 * at all, and the right otherwise, which is what makes `Customer -> Withdraw
 * Cash` and `Withdraw Cash -> Bank` come out as the picture a reader expects.
 */

export const USECASE_FONT_SIZE = 13;
export const USECASE_LINE_HEIGHT = USECASE_FONT_SIZE * 1.25;
const USECASE_MAX_LABEL = 132;

/** The stick figure and the name written under it. */
export const ACTOR_WIDTH = 84;
export const ACTOR_ICON = 48;
export const ACTOR_HEIGHT = 78;

const MARGIN = 60;
const UC_GAP = 26;
const BOUNDARY_PAD_X = 46;
/** room at the top of a boundary for the system's own name */
export const BOUNDARY_HEAD = 42;
const BOUNDARY_PAD_BOTTOM = 30;
const ACTOR_GAP = 104;
const ACTOR_SPREAD = ACTOR_HEIGHT + 26;

/** The oval one use case is drawn in. */
export function usecaseSize(label: string): { width: number; height: number } {
  const lines = wrapByWidth(label, USECASE_MAX_LABEL, USECASE_FONT_SIZE);
  const text = linesWidth(lines, USECASE_FONT_SIZE);
  return {
    width: Math.round(Math.max(124, text + 58)),
    height: Math.round(Math.max(56, Math.max(1, lines.length) * USECASE_LINE_HEIGHT + 34)),
  };
}

export function usecaseNodeSize(
  type: string,
  label: string,
): { width: number; height: number } {
  return type === "actor"
    ? { width: ACTOR_WIDTH, height: ACTOR_HEIGHT }
    : usecaseSize(label);
}

/**
 * The order the use cases stand in the column.
 *
 * Declaration order, except that a use case another one includes or extends
 * follows straight after it. The routing cuts a line from the two ovals it
 * joins and cannot see a third, so an include reaching three rows down the
 * column would be drawn straight through whatever stands between — putting
 * the pair side by side is what stops that happening at all.
 */
function readingOrder(cases: DSLNode[], edges: readonly DSLEdge[]): DSLNode[] {
  const byId = new Map(cases.map((node) => [node.id, node]));
  const tied = new Map<string, string[]>();
  const child = new Set<string>();
  for (const edge of edges) {
    if (edge.line !== "include" && edge.line !== "extend") {
      continue;
    }
    // an extend points at what it adds to, so the pair reads the other way
    const [parent, held] =
      edge.line === "extend" ? [edge.to, edge.from] : [edge.from, edge.to];
    if (!byId.has(parent) || !byId.has(held) || parent === held) {
      continue;
    }
    tied.set(parent, [...(tied.get(parent) ?? []), held]);
    child.add(held);
  }
  const out: DSLNode[] = [];
  const done = new Set<string>();
  const take = (node: DSLNode) => {
    if (done.has(node.id)) {
      return;
    }
    done.add(node.id);
    out.push(node);
    for (const id of tied.get(node.id) ?? []) {
      const next = byId.get(id);
      if (next) {
        take(next);
      }
    }
  };
  for (const node of cases) {
    if (!child.has(node.id)) {
      take(node);
    }
  }
  // anything left is in a ring of includes; it still has to be drawn
  for (const node of cases) {
    take(node);
  }
  return out;
}

/** Pushes a sorted run of actors apart until none of them overlaps. */
function spread(ys: number[]): number[] {
  const out = [...ys];
  for (let at = 1; at < out.length; at += 1) {
    out[at] = Math.max(out[at], out[at - 1] + ACTOR_SPREAD);
  }
  return out;
}

export function computeUseCaseLayout(
  ast: AST,
  direction: LayoutDirection = "down",
): PositionedAST {
  const cases = ast.nodes.filter((node) => node.type !== "actor");
  const actors = ast.nodes.filter((node) => node.type === "actor");
  const sizes = new Map(
    ast.nodes.map((node) => [node.id, usecaseNodeSize(node.type, node.label)]),
  );

  // --- the column of use cases, one boundary's worth at a time
  const widest = Math.max(124, ...cases.map((node) => sizes.get(node.id)?.width ?? 0));
  const colX = MARGIN + ACTOR_WIDTH + ACTOR_GAP + BOUNDARY_PAD_X + widest / 2;
  const ordered = readingOrder(cases, ast.edges);
  const boundaries = (ast.pools ?? []).map((pool) => ({
    id: pool.id,
    label: pool.label,
    members: ordered.filter((node) => node.lane === pool.id),
  }));
  const loose = ordered.filter(
    (node) => !node.lane || !boundaries.some((entry) => entry.id === node.lane),
  );

  const placed = new Map<string, PositionedNode>();
  const pools: PositionedPool[] = [];
  let cursor = MARGIN;

  const column = (nodes: typeof cases, top: number): number => {
    let y = top;
    for (const node of nodes) {
      const size = sizes.get(node.id) as { width: number; height: number };
      placed.set(node.id, {
        ...node,
        x: Math.round(colX - size.width / 2),
        y: Math.round(y),
        width: size.width,
        height: size.height,
        rank: 0,
      });
      y += size.height + UC_GAP;
    }
    return nodes.length > 0 ? y - UC_GAP : top;
  };

  for (const boundary of boundaries) {
    const top = cursor + BOUNDARY_HEAD;
    const bottom = column(boundary.members, top);
    const height = Math.max(
      BOUNDARY_HEAD + 60,
      bottom - cursor + BOUNDARY_PAD_BOTTOM,
    );
    pools.push({
      id: boundary.id,
      label: boundary.label,
      x: Math.round(colX - widest / 2 - BOUNDARY_PAD_X),
      y: Math.round(cursor),
      width: Math.round(widest + BOUNDARY_PAD_X * 2),
      height: Math.round(height),
      headerWidth: 0,
      headerHeight: BOUNDARY_HEAD,
      lanes: [],
    });
    cursor += height + 40;
  }
  cursor = column(loose, cursor);

  // --- the actors, on the side their lines say they belong
  const starts = new Set(ast.edges.map((edge) => edge.from));
  const middle = new Map<string, number>();
  for (const actor of actors) {
    const touched = ast.edges
      .filter((edge) => edge.from === actor.id || edge.to === actor.id)
      .map((edge) => (edge.from === actor.id ? edge.to : edge.from))
      .map((id) => placed.get(id))
      .filter((node): node is PositionedNode => Boolean(node));
    middle.set(
      actor.id,
      touched.length > 0
        ? touched.reduce((sum, node) => sum + node.y + node.height / 2, 0) / touched.length
        : MARGIN + ACTOR_HEIGHT,
    );
  }

  const box = pools[0];
  const left = box ? box.x : colX - widest / 2 - BOUNDARY_PAD_X;
  const right = box ? box.x + box.width : colX + widest / 2 + BOUNDARY_PAD_X;

  for (const side of ["left", "right"] as const) {
    const mine = actors
      .filter((actor) => (actor.side ?? (starts.has(actor.id) ? "left" : "right")) === side)
      .sort((a, b) => (middle.get(a.id) ?? 0) - (middle.get(b.id) ?? 0));
    const ys = spread(
      mine.map((actor) => (middle.get(actor.id) ?? 0) - ACTOR_HEIGHT / 2),
    );
    mine.forEach((actor, at) => {
      placed.set(actor.id, {
        ...actor,
        x: Math.round(side === "left" ? left - ACTOR_GAP - ACTOR_WIDTH : right + ACTOR_GAP),
        y: Math.round(ys[at]),
        width: ACTOR_WIDTH,
        height: ACTOR_HEIGHT,
        rank: 0,
      });
    });
  }

  const nodes = ast.nodes
    .map((node) => placed.get(node.id))
    .filter((node): node is PositionedNode => Boolean(node));

  // --- everything is joined by a straight line, cut by the router the sheet
  // uses, so a line drawn by hand lands exactly where a generated one does
  // an actor is met on the figure, not on the name written under it, which is
  // exactly the box the mapper lays over the figure for a line to tie to
  const outline = (node: PositionedNode): Box =>
    node.type === "actor"
      ? { x: node.x, y: node.y, width: node.width, height: ACTOR_ICON }
      : { x: node.x, y: node.y, width: node.width, height: node.height, round: true };
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges: PositionedEdge[] = ast.edges.map((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) {
      return { ...edge, points: [] };
    }
    return {
      ...edge,
      points: routeBetween(outline(from), outline(to), {
        category: "usecase",
        direction,
      }),
    };
  });

  return { category: ast.category, title: ast.title, nodes, edges, pools };
}
