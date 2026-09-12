import { tokenize, type Token, type TokenKind } from "@/lib/parser/tokens";
import {
  AST,
  DSLEdge,
  DSLEntry,
  DSLError,
  DSLLane,
  DSLNode,
  DSLPool,
  DiagramCategory,
  EdgeKind,
  NodeType,
  isChart,
  isFigure,
} from "@/lib/types";
import { parseChart } from "@/lib/parser/parse-chart";
import { parseMind } from "@/lib/parser/parse-mind";
import {
  parseFishbone,
  parseMatrix,
  parseVenn,
} from "@/lib/parser/parse-figures";

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

const ORG_NODE_TYPES = new Map<string, NodeType>([
  ["role", "role"],
  ["unit", "role"],
]);

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
        `Expected a node type (e.g. "${
          this.category === "flow"
            ? 'process P1'
            : this.category === "org"
              ? 'role R1'
              : 'task T1'
        } \\"Label\\"") or an edge statement (e.g. "A -> B"), got "${tok.value}"`,
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
    if (this.category === "org" && tok.value === "unit") {
      throw new DSLError(
        '"unit" only belongs inside a role block, e.g. role R "Head" { unit "Lab" "Name" }',
        tok.line,
      );
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
    // org: `role R "Title" "Name"` — the second caption is who holds the role
    let name: string | undefined;
    let entries: DSLEntry[] | undefined;
    if (this.category === "org") {
      if (this.peekIs("string")) {
        name = this.advance().value;
      }
      if (this.peekIs("lbrace")) {
        entries = this.parseOrgEntries(idTok.line);
      }
    }
    const lane = this.openLaneIds.length > 0 ? this.openLaneIds[this.openLaneIds.length - 1] : undefined;
    this.nodes.set(idTok.value, {
      id: idTok.value,
      type: canonical,
      label,
      ...(lane ? { lane } : {}),
      ...(name ? { name } : {}),
      ...(entries && entries.length > 0 ? { entries } : {}),
    });
  }

  /** `{ unit "Sub-role" "Name" ... }` — the rows listed inside one org box. */
  private parseOrgEntries(openLine: number): DSLEntry[] {
    this.advance(); // {
    const entries: DSLEntry[] = [];
    while (!this.peekIs("rbrace")) {
      if (this.pos >= this.tokens.length) {
        throw new DSLError('Missing "}" for role block', openLine);
      }
      const keyword = this.eat(
        "id",
        'Expected "unit" inside a role block, e.g. unit "Lab" "Name"',
      );
      if (keyword.value !== "unit") {
        throw new DSLError(
          `Expected "unit" inside a role block, got "${keyword.value}"`,
          keyword.line,
        );
      }
      const label = this.eat("string", 'Expected a caption after "unit"');
      const entry: DSLEntry = { label: label.value };
      if (this.peekIs("string")) {
        entry.name = this.advance().value;
      }
      entries.push(entry);
    }
    this.advance();
    if (entries.length === 0) {
      throw new DSLError("An empty role block draws nothing; remove the { }", openLine);
    }
    return entries;
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
  const head = stripped.match(
    /^(flow|bpmn|org|bar|line|pie|scatter|mind|matrix|venn|fishbone)\b/,
  );
  return head ? (head[1] as DiagramCategory) : null;
}

export function parseDSL(code: string): AST {
  const category = detectCategory(code);
  if (!category) {
    throw new DSLError(
      'A drawing must open with its notation and a title, e.g. flow "My Chart" { — the notations are flow, bpmn, org, bar, line, pie, scatter, mind, matrix, venn and fishbone',
      1,
    );
  }
  if (isFigure(category)) {
    const figure = isChart(category)
      ? parseChart(code, category)
      : category === "mind"
        ? parseMind(code)
        : category === "matrix"
          ? parseMatrix(code)
          : category === "venn"
            ? parseVenn(code)
            : parseFishbone(code);
    return { category, title: figure.title, nodes: [], edges: [], figure };
  }
  const nodeTypes =
    category === "flow"
      ? FLOW_NODE_TYPES
      : category === "org"
        ? ORG_NODE_TYPES
        : BPMN_NODE_TYPES;
  return new Parser(tokenize(code), category, nodeTypes).parse();
}
