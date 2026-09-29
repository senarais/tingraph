import { routeBetween } from "@/lib/canvas/connect";
import type { AST, LayoutDirection, PositionedAST, PositionedNode } from "@/lib/types";

const GAP = 56; // enough room for the router's stubs, even between adjacent boxes
const SIDE = 24;
const TOP = 44; // zone title + breathing room

/** Coordinates suggest rows and columns; only Generate arranges them. */
export function computeArchitectureLayout(ast: AST, direction: LayoutDirection): PositionedAST {
  let index = 0;
  const nodes: PositionedNode[] = ast.nodes.map((node) => {
    const zone = node.type === "zone";
    const slot = zone ? 0 : index++;
    return {
      ...node,
      x: node.at?.x ?? (zone ? 40 : 100 + (slot % 4) * 210),
      y: node.at?.y ?? (zone ? 40 : 100 + Math.floor(slot / 4) * 180),
      width: node.width ?? (zone ? 900 : 150),
      height: node.height ?? (zone ? 480 : 110),
      rank: 0,
    };
  });
  const zones = nodes.filter((node) => node.type === "zone");
  const area = (node: PositionedNode) => node.width * node.height;
  const children = new Map(zones.map((zone) => [zone, [] as PositionedNode[]]));
  const roots: PositionedNode[] = [];
  // ponytail: zone membership uses the original centre; overlapping zones need an explicit parent keyword.
  for (const node of nodes) {
    const x = node.x + node.width / 2;
    const y = node.y + node.height / 2;
    const parent = node.type !== "zone" && !node.at && zones.length === 1
      ? zones[0]
      : zones
        .filter((zone) => zone !== node &&
          (node.type !== "zone" || area(zone) > area(node)) &&
          x >= zone.x && x <= zone.x + zone.width &&
          y >= zone.y && y <= zone.y + zone.height)
        .sort((a, b) => area(a) - area(b))[0];
    if (parent) children.get(parent)!.push(node);
    else roots.push(node);
  }

  const move = (node: PositionedNode, dx: number, dy: number): void => {
    node.x += dx;
    node.y += dy;
    for (const child of children.get(node) ?? []) move(child, dx, dy);
  };

  const arrange = (members: PositionedNode[], parent?: PositionedNode): void => {
    if (members.length === 0) return;
    // Nearby x coordinates mean a column; separated columns leave a clear
    // horizontal channel even when their components have different widths.
    const columns: PositionedNode[][] = [];
    const columnOf = new Map<PositionedNode, number>();
    for (const node of [...members].sort((a, b) => a.x - b.x || a.y - b.y)) {
      let column = columns.findIndex((group) => {
        const first = group[0];
        const dx = Math.abs(node.x - first.x);
        return dx <= Math.min(node.width, first.width) * 0.5 &&
          (dx <= 24 || Math.abs(node.y - first.y) > 24);
      });
      if (column < 0) column = columns.push([]) - 1;
      columns[column].push(node);
      columnOf.set(node, column);
    }
    let nextX = parent ? parent.x + SIDE : -Infinity;
    for (const column of columns) {
      const x = Math.max(nextX, Math.min(...column.map((node) => node.x)));
      for (const node of column) move(node, x - node.x, 0);
      nextX = x + Math.max(...column.map((node) => node.width)) + GAP;
    }

    // Similar y coordinates are a row. Give the entire row one baseline, then
    // advance each column independently so stacked cards cannot overlap.
    const rows: Array<{ y: number; members: PositionedNode[] }> = [];
    for (const node of [...members].sort((a, b) => a.y - b.y || a.x - b.x)) {
      const row = rows.findLast((entry) =>
        Math.abs(node.y - entry.y) <= 24 &&
        entry.members.every((other) => columnOf.get(other) !== columnOf.get(node)),
      );
      if (row) row.members.push(node);
      else rows.push({ y: node.y, members: [node] });
    }
    const bottoms = new Map<number, number>();
    for (const row of rows) {
      const y = Math.max(
        parent ? parent.y + TOP : -Infinity,
        ...row.members.map((node) => node.y),
        ...row.members.map((node) => (bottoms.get(columnOf.get(node)!) ?? -Infinity) + GAP),
      );
      for (const node of row.members) {
        move(node, 0, y - node.y);
        bottoms.set(columnOf.get(node)!, y + node.height);
      }
    }
  };

  // Small zones first. Packing a nested zone can enlarge it; its parent then
  // places that whole zone, children and all, without squeezing its contents.
  for (const zone of [...zones].sort((a, b) => area(a) - area(b))) {
    const members = children.get(zone)!;
    arrange(members, zone);
    const source = ast.nodes.find((node) => node.id === zone.id)!;
    zone.width = Math.max(source.width ?? 240, ...members.map((node) => node.x + node.width + SIDE - zone.x));
    zone.height = Math.max(source.height ?? 160, ...members.map((node) => node.y + node.height + SIDE - zone.y));
  }
  arrange(roots);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return {
    category: "architecture",
    title: ast.title,
    // Draw outer regions first, even when the source declared the inner one first.
    nodes: [...zones].sort((a, b) => area(b) - area(a)).concat(nodes.filter((node) => node.type !== "zone")),
    edges: ast.edges.map((edge) => ({
      ...edge,
      points: routeBetween(byId.get(edge.from)!, byId.get(edge.to)!, {
        category: "architecture",
        direction,
      }),
    })),
  };
}
