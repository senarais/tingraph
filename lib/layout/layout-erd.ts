import dagre from "@dagrejs/dagre";
import { routeBetween } from "@/lib/canvas/connect";
import { textWidth } from "@/lib/layout/text";
import type {
  AST,
  DSLField,
  DSLNode,
  LayoutDirection,
  PositionedAST,
  PositionedEdge,
  PositionedNode,
} from "@/lib/types";

/**
 * An entity relationship diagram, laid out.
 *
 * An entity is a table: a name in a band, and one row per attribute under it.
 * The row is the unit of measurement here — how wide the box is, how tall it
 * is, where a key marker goes — so the whole geometry is worked out in
 * `erdBoxLayout` and both the mapper and the shape palette read it from there
 * rather than each guessing at it.
 *
 * Where the tables go is dagre's job, over the relations: an ERD has no
 * reading order of its own, so the only useful arrangement is the one that
 * puts related tables near each other.
 */

export const ERD_NAME_FONT_SIZE = 13;
export const ERD_ROW_FONT_SIZE = 11.5;
export const ERD_HEADER_HEIGHT = 28;
export const ERD_ROW_HEIGHT = 22;
/** the column on the left that PK and FK are written in */
export const ERD_GUTTER = 32;
export const ERD_PAD_X = 10;

const MIN_WIDTH = 176;
const MAX_WIDTH = 330;
const MARGIN = 60;

export interface ErdRow {
  name: string;
  type: string;
  /** PK, FK, PFK or U, written in the gutter; empty when the row has no mark */
  mark: string;
  /** distance from the top of the box to the top of this row */
  top: number;
}

export interface ErdLayout {
  width: number;
  height: number;
  headerHeight: number;
  /** 0 when no row in this box carries a key, so no rule is drawn */
  gutter: number;
  rowHeight: number;
  rows: ErdRow[];
}

const MARKS: Record<string, string> = { pk: "PK", fk: "FK", pfk: "PFK" };

/** How one entity box is cut up: its band, its gutter, and its rows. */
export function erdBoxLayout(node: DSLNode): ErdLayout {
  const fields = node.fields ?? [];
  const rows: ErdRow[] = fields.map((field, at) => ({
    name: field.name,
    type: field.optional && field.type ? `${field.type}?` : (field.type ?? ""),
    mark: field.key ? MARKS[field.key] : field.unique ? "U" : "",
    top: ERD_HEADER_HEIGHT + at * ERD_ROW_HEIGHT,
  }));
  const gutter = rows.some((row) => row.mark) ? ERD_GUTTER : 0;
  const widest = Math.max(
    textWidth(node.label, ERD_NAME_FONT_SIZE) + 26,
    ...rows.map(
      (row) =>
        gutter +
        textWidth(row.name, ERD_ROW_FONT_SIZE) +
        (row.type ? textWidth(row.type, ERD_ROW_FONT_SIZE) + 22 : 0) +
        ERD_PAD_X * 2,
    ),
  );
  return {
    width: Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, widest))),
    height: ERD_HEADER_HEIGHT + rows.length * ERD_ROW_HEIGHT,
    headerHeight: ERD_HEADER_HEIGHT,
    gutter,
    rowHeight: ERD_ROW_HEIGHT,
    rows,
  };
}

export function erdShapeSize(node: DSLNode): { width: number; height: number } {
  const box = erdBoxLayout(node);
  return { width: box.width, height: box.height };
}

// ---------------------------------------------------------------------- ports

/**
 * The height of every attribute in a table, measured from the top of its box.
 *
 * A relation is between two *columns* — a primary key and the foreign key that
 * copies it — so the line has to leave one row and meet another rather than
 * the middle of a side. These are the points it uses; the sheet reads them
 * back off the drawn box through `portsOf` in `lib/canvas/elements.ts`, so a
 * table that is dragged, resized or given another column carries its relations
 * with it.
 */
export function erdPorts(node: DSLNode): Map<string, number> {
  const ports = new Map<string, number>();
  (node.fields ?? []).forEach((field, at) => {
    ports.set(field.name, ERD_HEADER_HEIGHT + at * ERD_ROW_HEIGHT + ERD_ROW_HEIGHT / 2);
  });
  return ports;
}

/** `passengers` names a passenger; `people` names a people. Close enough. */
function singular(word: string): string {
  const lower = word.trim().toLowerCase().replace(/[^\w]+/g, "_");
  return lower.length > 3 && lower.endsWith("s") ? lower.slice(0, -1) : lower;
}

function keyed(node: DSLNode, want: "pk" | "fk"): DSLField[] {
  return (node.fields ?? []).filter(
    (field) => field.key === want || field.key === "pfk",
  );
}

/**
 * Which two attributes a relation joins, when the source does not say.
 *
 * A relation almost always copies one table's primary key into another as a
 * foreign key, and the copy is nearly always named after it — `flight_id` in
 * `booking`, or `passenger_id` for the `id` of `passengers`. So: the foreign
 * key with the same name as the primary key, else the one named after the
 * table the key comes from, else the only foreign key the child has. Nothing
 * matched leaves the relation on the box, where it was before.
 *
 * The written order is tried first, then the other way round, because a
 * relation may be written child-first (`BOOKING many -> one FLIGHT`).
 */
export function pairPorts(
  from: DSLNode,
  to: DSLNode,
): { fromPort?: string; toPort?: string } {
  const one = match(from, to);
  if (one) {
    return { fromPort: one.parent, toPort: one.child };
  }
  const other = match(to, from);
  return other ? { fromPort: other.child, toPort: other.parent } : {};
}

function match(
  parent: DSLNode,
  child: DSLNode,
): { parent: string; child: string } | null {
  const keys = keyed(parent, "pk");
  const foreign = keyed(child, "fk");
  if (keys.length === 0 || foreign.length === 0) {
    return null;
  }
  const named = [singular(parent.label), singular(parent.id)];
  for (const key of keys) {
    const same = foreign.find((field) => field.name === key.name);
    if (same) {
      return { parent: key.name, child: same.name };
    }
    const after = foreign.find((field) =>
      named.some(
        (name) => field.name === `${name}_${key.name}` || field.name === `${name}_id`,
      ),
    );
    if (after) {
      return { parent: key.name, child: after.name };
    }
  }
  return foreign.length === 1 ? { parent: keys[0].name, child: foreign[0].name } : null;
}

export function computeErdLayout(
  ast: AST,
  direction: LayoutDirection = "down",
): PositionedAST {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  // an ERD always ranks across the page, whichever way the reader set: a
  // relation joins one table's key to another's, and a key can only be met on
  // the side of its box, so tables that are related belong side by side
  graph.setGraph({
    rankdir: "LR",
    nodesep: 56,
    ranksep: 130,
    marginx: MARGIN,
    marginy: MARGIN,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of ast.nodes) {
    const size = erdShapeSize(node);
    graph.setNode(node.id, { width: size.width, height: size.height });
  }
  ast.edges.forEach((edge, index) => {
    graph.setEdge(edge.from, edge.to, {}, `e${index}`);
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
  const edges: PositionedEdge[] = ast.edges.map((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) {
      return { ...edge, points: [] };
    }
    // the two attributes this relation joins: what the source wrote, or the
    // pair the keys themselves say
    const written = edge.fromPort || edge.toPort ? edge : { ...edge, ...pairPorts(from, to) };
    const fromAt = erdPorts(from).get(written.fromPort ?? "");
    const toAt = erdPorts(to).get(written.toPort ?? "");
    return {
      ...written,
      points: routeBetween(
        { x: from.x, y: from.y, width: from.width, height: from.height },
        { x: to.x, y: to.y, width: to.width, height: to.height },
        {
          category: "erd",
          direction,
          ...(fromAt === undefined ? {} : { fromAt: from.y + fromAt }),
          ...(toAt === undefined ? {} : { toAt: to.y + toAt }),
        },
      ),
    };
  });

  return { category: ast.category, title: ast.title, nodes, edges };
}
