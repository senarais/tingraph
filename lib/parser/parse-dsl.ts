import {
  AST,
  DSLEdge,
  DSLError,
  DSLLane,
  DSLNode,
  DSLPool,
  DiagramCategory,
  EdgeKind,
  NodeType,
} from "@/lib/types";

const FLOW_NODE_TYPES = new Map<string, NodeType>([
  ["start", "start"],
  ["process", "process"],
  ["task", "process"],
  ["decision", "decision"],
  ["io", "io"],
  ["data", "io"],
  ["end", "end"],
]);

const BPMN_NODE_TYPES = new Map<string, NodeType>([
  ["start", "start"],
  ["end", "end"],
  ["msg-start", "msg-start"],
  ["msg-end", "msg-end"],
  ["timer", "timer"],
  ["task", "task"],
  ["send-task", "send-task"],
  ["recv-task", "recv-task"],
  ["script-task", "script-task"],
  ["user-task", "user-task"],
  ["gw-ex", "gw-ex"],
  ["gw-para", "gw-para"],
  ["gw-inc", "gw-inc"],
  ["data", "data"],
]);

type TokenKind =
  | "keyword"
  | "id"
  | "string"
  | "arrow"
  | "dashed-arrow"
  | "lbrace"
  | "rbrace"
  | "lbracket"
  | "rbracket";

interface Token {
  kind: TokenKind;
  value: string;
  line: number;
}

const TOKEN_RE =
  /(\s+)|((?:#|\/\/)[^\n]*)|("(?:[^"\\\n]|\\.)*")|(-\.->|-\.{2,}->|->|→)|([A-Za-z_$][\w$]*(?:[-.](?![.>])[\w$]+)*)|([{}[\]])/y;

function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let line = 1;
  while (pos < code.length) {
    TOKEN_RE.lastIndex = pos;
    const m = TOKEN_RE.exec(code);
    if (!m || m.index !== pos) {
      throw new DSLError(`Unexpected character "${code[pos]}"`, line);
    }
    const [, ws, comment, str, arrow, id, brace] = m;
    pos = TOKEN_RE.lastIndex;
    if (ws) {
      line += (ws.match(/\n/g) ?? []).length;
      continue;
    }
    if (comment) {
      continue;
    }
    if (str) {
      tokens.push({ kind: "string", value: JSON.parse(str), line });
    } else if (arrow) {
      tokens.push({
        kind: arrow.startsWith("-.") ? "dashed-arrow" : "arrow",
        value: arrow.startsWith("-.") ? "-.->" : "->",
        line,
      });
    } else if (id) {
      tokens.push({ kind: "id", value: id, line });
    } else if (brace) {
      const kind: TokenKind =
        brace === "{"
          ? "lbrace"
          : brace === "}"
            ? "rbrace"
            : brace === "["
              ? "lbracket"
              : "rbracket";
      tokens.push({ kind, value: brace, line });
    }
  }
  return tokens;
}

interface EdgeEndpoint {
  id: string;
  label?: string;
  line: number;
}

class Parser {
  private pos = 0;
  private readonly nodes = new Map<string, DSLNode>();
  private readonly edges: DSLEdge[] = [];
  private readonly pools: DSLPool[] = [];

  private isIdTaken(id: string): boolean {
    return (
      this.nodes.has(id) ||
      this.pools.some((p) => p.id === id) ||
      this.pools.some((p) => p.lanes.some((l) => l.id === id))
    );
  }
  private openLaneIds: string[] = [];

  constructor(
    private readonly tokens: Token[],
    private readonly category: DiagramCategory,
    private readonly nodeTypes: ReadonlyMap<string, NodeType>,
  ) {}

  parse(): AST {
    const keyword = this.eat("id", `Expected "${this.category}" keyword`);
    if (keyword.value !== this.category) {
      throw new DSLError(
        `Expected "${this.category}" keyword, got "${keyword.value}"`,
        keyword.line,
      );
    }
    const title = this.eat("string", 'Expected a diagram title in quotes');
    this.eat("lbrace", 'Expected "{" after title');

    while (!this.peekIs("rbrace")) {
      if (this.pos >= this.tokens.length) {
        throw new DSLError('Missing closing "}"', keyword.line);
      }
      this.parseStatement();
    }
    this.advance();
    if (this.pos < this.tokens.length) {
      throw new DSLError(
        `Unexpected content after closing "}"`,
        this.tokens[this.pos].line,
      );
    }

    for (const edge of this.edges) {
      for (const id of [edge.from, edge.to]) {
        if (!this.nodes.has(id)) {
          throw new DSLError(
            `Edge references undeclared node "${id}" — declare it first, e.g. start ${id} "Label"`,
            0,
          );
        }
      }
    }

    return {
      category: this.category,
      title: title.value,
      nodes: [...this.nodes.values()],
      edges: this.edges,
      ...(this.pools.length > 0 ? { pools: this.pools } : {}),
    };
  }

  private parseStatement(): void {
    const tok = this.tokens[this.pos];
    if (tok.kind !== "id") {
      throw new DSLError(
        `Expected a node type (e.g. "process ${
          this.category === "flow" ? "P1" : "T1"
        } \\"Label\\") or an edge statement (e.g. "A -> B"), got "${tok.value}"`,
        tok.line,
      );
    }
    if (this.category === "bpmn" && tok.value === "pool") {
      this.parsePool();
      return;
    }
    if (this.category === "bpmn" && tok.value === "lane") {
      this.parseLane(undefined);
      return;
    }
    const next = this.tokens[this.pos + 1];
    const isDeclaration =
      this.nodeTypes.has(tok.value) && next !== undefined && next.kind === "id";
    if (isDeclaration) {
      this.parseDeclaration();
    } else {
      this.parseEdgeChain();
    }
  }

  private parsePool(): void {
    if (this.category !== "bpmn") {
      throw new DSLError('"pool" is BPMN-only', this.tokens[this.pos].line);
    }
    this.advance(); // pool
    const idTok = this.eat("id", 'Expected a pool id, e.g. pool P1 "Label" {');
    if (this.isIdTaken(idTok.value)) {
      throw new DSLError(`Duplicate id "${idTok.value}"`, idTok.line);
    }
    let label = idTok.value;
    if (this.peekIs("string")) {
      label = this.advance().value;
    }
    this.eat("lbrace", 'Expected "{" after pool declaration');

    const pool: DSLPool = { id: idTok.value, label, lanes: [] };
    this.pools.push(pool);
    let implicitLaneOpened = false;

    while (!this.peekIs("rbrace")) {
      if (this.pos >= this.tokens.length) {
        throw new DSLError('Missing "}" for pool block', idTok.line);
      }
      const tok = this.tokens[this.pos];
      if (tok.kind === "id" && tok.value === "lane") {
        this.parseLane(pool.id);
        continue;
      }
      if (tok.kind === "id" && tok.value === "pool") {
        throw new DSLError('Pools cannot nest inside pools', tok.line);
      }
      // a node/edge directly inside the pool (no lane) is permitted —
      // it is assigned to one implicit lane named after the pool
      if (!implicitLaneOpened) {
        this.ensureImplicitLane(pool);
        implicitLaneOpened = true;
      }
      this.parseStatement();
    }
    this.advance();
    if (implicitLaneOpened) {
      this.openLaneIds.pop();
    }
  }

  /** A pool with statements but no `lane` wraps them in one implicit lane. */
  private ensureImplicitLane(pool: DSLPool): void {
    const lane: DSLLane = { id: pool.id, label: pool.label };
    pool.lanes.push(lane);
    this.openLaneIds.push(pool.id);
  }

  private parseLane(poolId: string | undefined): void {
    this.advance(); // lane
    const idTok = this.eat("id", 'Expected a lane id, e.g. lane L1 "Label" {');
    if (this.isIdTaken(idTok.value)) {
      throw new DSLError(`Duplicate id "${idTok.value}"`, idTok.line);
    }
    let label = idTok.value;
    if (this.peekIs("string")) {
      label = this.advance().value;
    }
    this.eat("lbrace", 'Expected "{" after lane declaration');

    let lane: DSLLane;
    if (poolId === undefined) {
      // top-level lane without a pool → synthesize a pool
      const pool: DSLPool = { id: `${idTok.value}-pool`, label: "", lanes: [] };
      lane = { id: idTok.value, label };
      pool.lanes.push(lane);
      this.pools.push(pool);
    } else {
      const pool = this.pools[this.pools.length - 1];
      lane = { id: idTok.value, label };
      pool.lanes.push(lane);
    }
    this.openLaneIds.push(lane.id);

    while (!this.peekIs("rbrace")) {
      if (this.pos >= this.tokens.length) {
        throw new DSLError('Missing "}" for lane block', idTok.line);
      }
      const tok = this.tokens[this.pos];
      if (tok.kind === "id" && (tok.value === "lane" || tok.value === "pool")) {
        throw new DSLError(`"${tok.value}" cannot nest inside a lane`, tok.line);
      }
      this.parseStatement();
    }
    this.advance();
    this.openLaneIds.pop();
  }

  private parseDeclaration(): void {
    const typeTok = this.advance();
    const canonical = this.nodeTypes.get(typeTok.value);
    if (!canonical) {
      throw new DSLError(`Unknown node type "${typeTok.value}"`, typeTok.line);
    }
    const idTok = this.eat("id", `Expected a node id after "${typeTok.value}"`);
    if (this.isIdTaken(idTok.value)) {
      throw new DSLError(`Duplicate node id "${idTok.value}"`, idTok.line);
    }
    let label = idTok.value;
    if (this.peekIs("string")) {
      label = this.advance().value;
    }
    const lane = this.openLaneIds.length > 0 ? this.openLaneIds[this.openLaneIds.length - 1] : undefined;
    this.nodes.set(idTok.value, {
      id: idTok.value,
      type: canonical,
      label,
      ...(lane ? { lane } : {}),
    });
  }

  private parseEdgeChain(): void {
    const first = this.parseEdgeEndpoint();
    if (!this.peekIsArrow()) {
      throw new DSLError(
        `Expected "->" after "${first.id}" (or declare a node, e.g. start ${first.id} "Label")`,
        first.line,
      );
    }
    let prev = first;
    while (this.peekIsArrow()) {
      const kind: EdgeKind =
        this.tokens[this.pos].kind === "dashed-arrow"
          ? "association"
          : "sequence";
      this.advance();
      const next = this.parseEdgeEndpoint();
      this.edges.push({
        from: prev.id,
        to: next.id,
        label: prev.label ?? next.label,
        ...(kind === "association" ? { kind } : {}),
      });
      prev = next;
    }
  }

  private peekIsArrow(): boolean {
    return this.peekIs("arrow") || this.peekIs("dashed-arrow");
  }

  private parseEdgeEndpoint(): EdgeEndpoint {
    const startLine = this.tokens[this.pos]?.line ?? 0;
    let label: string | undefined;
    if (this.peekIs("lbracket")) {
      label = this.parseBracketLabel();
    }
    const idTok = this.eat("id", "Expected a node id in edge statement");
    if (this.peekIs("lbracket")) {
      if (label !== undefined) {
        throw new DSLError(
          `Edge "[${label}] ${idTok.value} [..]" has two labels; use one`,
          idTok.line,
        );
      }
      label = this.parseBracketLabel();
    }
    return { id: idTok.value, label, line: startLine };
  }

  private parseBracketLabel(): string {
    const openTok = this.advance();
    const parts: string[] = [];
    while (!this.peekIs("rbracket")) {
      if (this.pos >= this.tokens.length) {
        throw new DSLError('Missing "]" for edge label', openTok.line);
      }
      parts.push(this.advance().value);
    }
    if (parts.length === 0) {
      throw new DSLError("Empty edge label '[]'", openTok.line);
    }
    this.advance();
    return parts.join(" ");
  }

  private advance(): Token {
    if (this.pos >= this.tokens.length) {
      throw new DSLError("Unexpected end of input", 0);
    }
    return this.tokens[this.pos++];
  }

  private peekIs(kind: TokenKind): boolean {
    const tok = this.tokens[this.pos];
    return tok !== undefined && tok.kind === kind;
  }

  private eat(kind: TokenKind, message: string): Token {
    const tok = this.tokens[this.pos];
    if (tok === undefined || tok.kind !== kind) {
      throw new DSLError(message, tok?.line ?? 0);
    }
    return this.tokens[this.pos++];
  }
}

export function detectCategory(code: string): DiagramCategory | null {
  const stripped = code
    .replace(/(?:#|\/\/)[^\n]*/g, "")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .trimStart();
  const head = stripped.match(/^(flow|bpmn)\b/);
  return head ? (head[1] as DiagramCategory) : null;
}

export function parseDSL(code: string): AST {
  const category = detectCategory(code);
  if (!category) {
    throw new DSLError(
      'Diagram must start with "flow" or "bpmn" followed by a title, e.g. flow "My Chart" {',
      1,
    );
  }
  const nodeTypes = category === "flow" ? FLOW_NODE_TYPES : BPMN_NODE_TYPES;
  return new Parser(tokenize(code), category, nodeTypes).parse();
}
