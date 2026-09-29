import { routeBetween } from "@/lib/canvas/connect";
import type { AST, LayoutDirection, PositionedAST, PositionedNode } from "@/lib/types";

/** Architecture is a placed graph: zones are backdrops, not ranking constraints. */
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
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return {
    category: "architecture",
    title: ast.title,
    // A containing zone must be behind the components placed inside it.
    nodes: [...nodes].sort((a, b) => (a.type === "zone" ? -1 : 0) - (b.type === "zone" ? -1 : 0)),
    edges: ast.edges.map((edge) => ({
      ...edge,
      points: routeBetween(byId.get(edge.from)!, byId.get(edge.to)!, {
        category: "architecture",
        direction,
      }),
    })),
  };
}
