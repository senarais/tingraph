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

export type EdgeKind = "sequence" | "association";

export type NodeType = FlowNodeType | BpmnNodeType;

export interface DSLNode {
  id: string;
  type: NodeType;
  label: string;
  /** id of the containing lane (BPMN only) */
  lane?: string;
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
  label?: string;
  kind?: EdgeKind;
}

export type DiagramCategory = "flow" | "bpmn";

export interface AST {
  category: DiagramCategory;
  title: string;
  nodes: DSLNode[];
  edges: DSLEdge[];
  pools?: DSLPool[];
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
  lanes: PositionedLane[];
}

export interface PositionedAST {
  category: DiagramCategory;
  title: string;
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  pools?: PositionedPool[];
}
