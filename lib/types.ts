import { isChartKind, type ChartKind } from "@/lib/chart/spec";
import type { FigureSpec } from "@/lib/figures/spec";

export type FlowNodeType =
  | "start"
  | "process"
  | "decision"
  | "io"
  | "end";

export type BpmnNodeType =
  | "start"
  | "end"
  | "msg-start"
  | "msg-end"
  | "timer"
  | "task"
  | "send-task"
  | "recv-task"
  | "script-task"
  | "user-task"
  | "gw-ex"
  | "gw-para"
  | "gw-inc"
  | "data";

/** An org chart has one shape: a box holding a role and, optionally, a name. */
export type OrgNodeType = "role";

/**
 * A use case diagram has two: the stick figure that wants something, and the
 * rounded thing it wants. The boundary around the use cases is not a node —
 * it is a `pool`, the way a BPMN participant is.
 */
export type UseCaseNodeType = "actor" | "usecase";

/**
 * UML activity: the control nodes that start, split, join and stop a flow, the
 * actions between them, and the object nodes that pass along it.
 */
export type ActivityNodeType =
  | "initial"
  | "action"
  | "decision"
  | "merge"
  | "fork"
  | "join"
  | "object"
  | "final"
  | "flow-final";

/** An entity, and the weak entity that cannot be told apart without its owner. */
export type ErdNodeType = "entity" | "weak";

export type EdgeKind = "sequence" | "association";

export type NodeType =
  | FlowNodeType
  | BpmnNodeType
  | OrgNodeType
  | UseCaseNodeType
  | ActivityNodeType
  | ErdNodeType;

/** A sub-role listed inside an org box, e.g. one lab under a lab head. */
export interface DSLEntry {
  label: string;
  name?: string;
}

/**
 * One attribute of an entity. The key marker is what an ERD is read by, so it
 * is a field of its own rather than something buried in the name.
 */
export interface DSLField {
  name: string;
  /** the column type, written on the right of the row */
  type?: string;
  /** primary key, foreign key, or both */
  key?: "pk" | "fk" | "pfk";
  unique?: boolean;
  /** the value may be missing; the type is written with a trailing ? */
  optional?: boolean;
}

export interface DSLNode {
  id: string;
  type: NodeType;
  label: string;
  /** id of the container this node sits in: a BPMN lane, an activity column, a use case boundary */
  lane?: string;
  /** org: the person holding the role */
  name?: string;
  /** org: sub-roles listed inside the same box */
  entries?: DSLEntry[];
  /** erd: the rows inside the entity box */
  fields?: DSLField[];
  /** usecase: which side of the boundary the actor stands on, when it is pinned */
  side?: "left" | "right";
}

export interface DSLLane {
  id: string;
  label: string;
}

export interface DSLPool {
  id: string;
  label: string;
  lanes: DSLLane[];
}

export interface DSLEdge {
  from: string;
  to: string;
  /**
   * erd: the attribute each end is tied to, so a relation leaves the primary
   * key it comes from and meets the foreign key it lands on rather than the
   * middle of a table's side. Left out, `pairPorts` in `layout-erd.ts` works
   * the pair out; nothing matched leaves the relation on the box.
   */
  fromPort?: string;
  toPort?: string;
  label?: string;
  kind?: EdgeKind;
  /**
   * Which of the notation's lines this is, from `lib/connectors.ts`, when the
   * source names it outright. A use case diagram tells an association from an
   * include, and an ERD tells one crow's foot from another, so the plain
   * solid/dashed pair `kind` carries is not enough for them.
   */
  line?: string;
}

/**
 * Every notation the editor carries. The graph notations draw nodes joined by
 * connectors; the charts draw readings. The editor keeps them apart because
 * almost nothing they need is the same — a chart has no shapes to drop and no
 * arrows to route, and it has a settings panel neither graph wants.
 */
export type DiagramCategory = GraphCategory | ChartKind | FigureKind;

export const GRAPH_CATEGORIES = [
  "flow",
  "bpmn",
  "org",
  "usecase",
  "activity",
  "erd",
] as const;

export type GraphCategory = (typeof GRAPH_CATEGORIES)[number];

/**
 * The figures that are not charts. A figure is a notation whose whole state is
 * one object drawn onto the sheet rather than a bag of elements; see
 * `lib/figures/spec.ts` for why that distinction is the one that matters.
 */
export const FIGURE_KINDS = [
  "mind",
  "matrix",
  "venn",
  "fishbone",
  "sequence",
] as const;

export type FigureKind = (typeof FIGURE_KINDS)[number];

export function isChart(category: DiagramCategory): category is ChartKind {
  return isChartKind(category);
}

/** Every notation drawn from one spec: the charts, and the four beside them. */
export function isFigure(
  category: DiagramCategory,
): category is ChartKind | FigureKind {
  return isChartKind(category) || (FIGURE_KINDS as readonly string[]).includes(category);
}

export function isGraph(category: DiagramCategory): category is GraphCategory {
  return (GRAPH_CATEGORIES as readonly string[]).includes(category);
}

/**
 * The graphs whose elements are set from a panel as well as drawn.
 *
 * A flowchart, a BPMN sheet and an org chart are a bag of boxes: what an
 * element *is* can be read straight off the drawing, so the sheet is the whole
 * record and a panel would only repeat it. These three are not. A use case
 * stands inside a boundary, an action stands in a partition, and an ERD table
 * has columns with keys — structure the reader cannot place by hand. Each of
 * their elements therefore carries its own spec on the sheet
 * (`UnitMark.spec`), which the panel reads and rewrites the way a figure's
 * panel reads and rewrites its one spec.
 */
export const SETTABLE_CATEGORIES = ["usecase", "activity", "erd"] as const;

export type SettableCategory = (typeof SETTABLE_CATEGORIES)[number];

export function isSettable(category: DiagramCategory): category is SettableCategory {
  return (SETTABLE_CATEGORIES as readonly string[]).includes(category);
}

/**
 * Which way a drawing grows: down the page, or across it. A BPMN diagram
 * always reads left to right along its lanes, so it ignores the setting.
 */
export type LayoutDirection = "down" | "right";

export interface AST {
  category: DiagramCategory;
  title: string;
  nodes: DSLNode[];
  edges: DSLEdge[];
  pools?: DSLPool[];
  /** set instead of nodes and edges when the notation is a figure */
  figure?: FigureSpec;
}

export class DSLError extends Error {
  readonly line: number;

  constructor(message: string, line: number) {
    super(message);
    this.name = "DSLError";
    this.line = line;
  }
}

export interface PositionedNode extends DSLNode {
  x: number;
  y: number;
  width: number;
  height: number;
  rank: number;
  /** containing lane id (BPMN) */
  lane?: string;
}

export interface PositionedEdge extends DSLEdge {
  points: Array<{ x: number; y: number }>;
  /** org: a reporting line, routed as a bus from a parent box to a child */
  reporting?: boolean;
}

export interface PositionedLane {
  id: string;
  label: string;
  /** top-left of the lane box, header band included */
  x: number;
  y: number;
  width: number;
  height: number;
  /** width of the vertical label band on the left (0 when unlabelled) */
  headerWidth: number;
  /**
   * Height of the label band along the top, for a notation whose lanes are
   * columns rather than rows. A UML activity partition is read downwards, so
   * its name sits above it; exactly one of the two bands is ever set.
   */
  headerHeight?: number;
  /** id of the containing pool */
  poolId?: string;
}

export interface PositionedPool {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** width of the vertical label band on the left (0 when unlabelled) */
  headerWidth: number;
  /** height of the label band along the top, when the lanes are columns */
  headerHeight?: number;
  lanes: PositionedLane[];
}

export interface PositionedAST {
  category: DiagramCategory;
  title: string;
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  pools?: PositionedPool[];
  /** a figure is laid out where it is drawn, so it travels through unchanged */
  figure?: FigureSpec;
}
