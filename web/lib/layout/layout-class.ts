import dagre from "@dagrejs/dagre";
import { routeAll, spreadEnds } from "@/lib/layout/graph";
import { textWidth } from "@/lib/layout/text";
import type {
  AST,
  DSLNode,
  LayoutDirection,
  PositionedAST,
  PositionedNode,
} from "@/lib/types";

/**
 * A UML class diagram, laid out.
 *
 * A classifier is three compartments in one box: its name, its attributes and
 * its operations, in that order, and the order is the notation. The whole
 * geometry of one box is worked out in `classBoxLayout`, and the mapper and
 * the shape palette both read it from there.
 *
 * Where the boxes go is dagre's job, with one rule laid over it: a
 * generalisation is written child first (`inherit Cat -> Animal`) but read
 * parent first, so those edges are ranked the other way round and a parent
 * always stands above what specialises it.
 */

export const CLASS_NAME_FONT_SIZE = 13;
export const CLASS_ROW_FONT_SIZE = 11.5;
export const CLASS_STEREOTYPE_FONT_SIZE = 10.5;
export const CLASS_ROW_HEIGHT = 20;
export const CLASS_PAD_X = 10;
/** room above the first and under the last row of a compartment */
const COMPARTMENT_PAD = 5;
/** an empty compartment is still drawn: its absence would say "not shown" */
const EMPTY_COMPARTMENT = 14;
const NAME_HEIGHT = 30;
const STEREOTYPE_HEIGHT = 14;
const MIN_WIDTH = 150;
const MAX_WIDTH = 380;
const MARGIN = 60;

/** The word in guillemets above the name; a plain class has none. */
export function classStereotype(type: string): string {
  switch (type) {
    case "interface":
      return "«interface»";
    case "abstract":
      return "«abstract»";
    case "enum":
      return "«enumeration»";
    default:
      return "";
  }
}

export interface ClassRow {
  text: string;
  /** distance from the top of the box to the top of this row */
  top: number;
}

export interface ClassLayout {
  width: number;
  height: number;
  /** the name compartment, stereotype included */
  headerHeight: number;
  stereotype: string;
  /** top of the rule between the attributes and the operations; the height when there is none */
  split: number;
  attributes: ClassRow[];
  methods: ClassRow[];
}

/** How one classifier box is cut up: its name, then its two lists. */
export function classBoxLayout(node: DSLNode): ClassLayout {
  const stereotype = classStereotype(node.type);
  const headerHeight = NAME_HEIGHT + (stereotype ? STEREOTYPE_HEIGHT : 0);
  const members = node.entries ?? [];
  const attributeText = members.filter((entry) => entry.label !== "method");
  const methodText = members.filter((entry) => entry.label === "method");

  const compartment = (count: number) =>
    count === 0 ? EMPTY_COMPARTMENT : count * CLASS_ROW_HEIGHT + COMPARTMENT_PAD * 2;
  const attributesHeight = compartment(attributeText.length);
  const split = headerHeight + attributesHeight;

  const attributes = attributeText.map((entry, at) => ({
    text: entry.name ?? "",
    top: headerHeight + COMPARTMENT_PAD + at * CLASS_ROW_HEIGHT,
  }));
  const methods = methodText.map((entry, at) => ({
    text: entry.name ?? "",
    top: split + COMPARTMENT_PAD + at * CLASS_ROW_HEIGHT,
  }));

  const widest = Math.max(
    textWidth(node.label, CLASS_NAME_FONT_SIZE) + 28,
    textWidth(stereotype, CLASS_STEREOTYPE_FONT_SIZE) + 28,
    ...[...attributes, ...methods].map(
      (row) => textWidth(row.text, CLASS_ROW_FONT_SIZE) + CLASS_PAD_X * 2,
    ),
  );
  // an enumeration lists its literals; it only grows an operations
  // compartment when it has operations to put in it
  const bare = node.type === "enum" && methodText.length === 0;
  return {
    width: Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, widest))),
    height: split + (bare ? 0 : compartment(methodText.length)),
    headerHeight,
    stereotype,
    split,
    attributes,
    methods,
  };
}

export function classShapeSize(node: DSLNode): { width: number; height: number } {
  const box = classBoxLayout(node);
  return { width: box.width, height: box.height };
}

/** The relations read from their far end: the parent stands above the child. */
const READ_BACKWARDS = new Set(["class-inherit", "class-implement"]);

export function computeClassLayout(
  ast: AST,
  direction: LayoutDirection = "down",
): PositionedAST {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({
    rankdir: direction === "right" ? "LR" : "TB",
    nodesep: 60,
    // a diamond or an open head needs 50 straight, and a caption sits beside it
    ranksep: 110,
    marginx: MARGIN,
    marginy: MARGIN,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of ast.nodes) {
    const size = classShapeSize(node);
    graph.setNode(node.id, { width: size.width, height: size.height });
  }
  ast.edges.forEach((edge, index) => {
    if (edge.from === edge.to) {
      return;
    }
    if (READ_BACKWARDS.has(edge.line ?? "")) {
      graph.setEdge(edge.to, edge.from, {}, `e${index}`);
    } else {
      graph.setEdge(edge.from, edge.to, {}, `e${index}`);
    }
  });
  dagre.layout(graph);

  const nodes: PositionedNode[] = ast.nodes.map((node) => {
    const laid = graph.node(node.id);
    return {
      ...node,
      width: laid.width,
      height: laid.height,
      x: Math.round(laid.x - laid.width / 2),
      y: Math.round(laid.y - laid.height / 2),
      rank: 0,
    };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return {
    category: ast.category,
    title: ast.title,
    nodes,
    edges: spreadEnds(routeAll(ast.edges, byId, nodes, "class", direction), byId, "class"),
  };
}
