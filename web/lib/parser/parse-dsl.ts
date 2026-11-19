import { tokenize, type Token, type TokenKind } from "@/lib/parser/tokens";
import {
  AST,
  DSLEdge,
  DSLEntry,
  DSLError,
  DSLField,
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
  parsePrisma,
  parseQuadrant,
  parseGantt,
  parseVenn,
} from "@/lib/parser/parse-figures";
import { parseSequence } from "@/lib/parser/parse-sequence";
import { erdLine, type ErdEnd } from "@/lib/connectors";

const FLOW_NODE_TYPES = new Map<string, NodeType>([
  ["start", "start"],
  ["process", "process"],
  ["task", "process"],
  ["decision", "decision"],
  ["io", "io"],
  ["data", "io"],
  ["end", "end"],
]);

const ARCHITECTURE_NODE_TYPES = new Map<string, NodeType>(
  ["zone", "client", "service", "database", "storage", "queue", "cloud", "external"].map(
    (type) => [type, type as NodeType],
  ),
);

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

const USECASE_NODE_TYPES = new Map<string, NodeType>([
  ["actor", "actor"],
  ["usecase", "usecase"],
  ["case", "usecase"],
]);

const ACTIVITY_NODE_TYPES = new Map<string, NodeType>([
  ["initial", "initial"],
  ["start", "initial"],
  ["action", "action"],
  ["task", "action"],
  ["decision", "decision"],
  ["merge", "merge"],
  ["fork", "fork"],
  ["join", "join"],
  ["object", "object"],
  ["final", "final"],
  ["end", "final"],
  ["flow-final", "flow-final"],
]);

const ERD_NODE_TYPES = new Map<string, NodeType>([
  ["entity", "entity"],
  ["weak", "weak"],
]);

const CLASS_NODE_TYPES = new Map<string, NodeType>([
  ["class", "class"],
  ["interface", "interface"],
  ["abstract", "abstract"],
  ["enum", "enum"],
]);

const DFD_NODE_TYPES = new Map<string, NodeType>([
  ["process", "process"],
  ["entity", "entity"],
  ["store", "store"],
]);

const STATE_NODE_TYPES = new Map<string, NodeType>([
  ["initial", "initial"],
  ["start", "initial"],
  ["final", "final"],
  ["end", "final"],
  ["state", "state"],
  ["choice", "choice"],
  ["fork", "fork"],
  ["join", "join"],
]);

const TREE_NODE_TYPES = new Map<string, NodeType>([
  ["node", "node"],
  ["leaf", "leaf"],
]);

/** The class relations written with a keyword, and the line each one draws. */
const CLASS_RELATIONS = new Map<string, string>([
  ["inherit", "class-inherit"],
  ["implement", "class-implement"],
  ["aggregate", "class-aggregate"],
  ["compose", "class-compose"],
  ["depend", "class-depend"],
  ["navigate", "class-directed"],
  ["associate", "class-association"],
]);

/** What a member line inside a class block is, by its opening word. */
const CLASS_MEMBERS = new Map<string, string>([
  ["attr", "attr"],
  ["value", "attr"],
  ["method", "method"],
]);

/** The three internal activities a state may list, in the order UML lists them. */
const STATE_ACTIVITIES = ["entry", "do", "exit"];

/** The notations whose single flows may carry a caption written after them. */
const TRAILING_CAPTION = new Set<DiagramCategory>(["class", "dfd", "state", "tree"]);

/** The three use case relations that are not a plain association. */
const USECASE_RELATIONS = new Map<string, { line: string; label: string }>([
  ["include", { line: "include", label: "«include»" }],
  ["extend", { line: "extend", label: "«extend»" }],
  ["inherit", { line: "inherit", label: "" }],
]);

/** How a crow's foot is written, and which end it stands for. */
const ERD_END_WORDS = new Map<string, ErdEnd>([
  ["one", "one"],
  ["many", "many"],
  ["one-or-many", "one-or-many"],
  ["zero-or-one", "zero-or-one"],
  ["optional", "zero-or-one"],
]);

/** What a statement in each notation usually opens with, for the error line. */
const OPENERS: Partial<Record<DiagramCategory, string>> = {
  flow: "process P1",
  org: "role R1",
  bpmn: "task T1",
  usecase: "usecase U1",
  activity: "action A1",
  erd: "entity E1",
  architecture: "service API",
  class: "class C1",
  dfd: "process P1",
  state: "state S1",
  tree: "node N1",
};

interface EdgeEndpoint {
  id: string;
  label?: string;
  line: number;
}

/** `BOOKING.passenger_id` — the table, and the attribute the relation joins. */
function erdEndpoint(token: Token): { id: string; port?: string } {
  const dot = token.value.indexOf(".");
  return dot < 1
    ? { id: token.value }
    : { id: token.value.slice(0, dot), port: token.value.slice(dot + 1) };
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

    checkNotation(this.category, [...this.nodes.values()], this.edges);

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
        `Expected a node type (e.g. "${OPENERS[this.category] ?? "task T1"} \\"Label\\"") or an edge statement (e.g. "A -> B"), got "${tok.value}"`,
        tok.line,
      );
    }
    if (this.category === "bpmn" && tok.value === "pool") {
      this.parsePool();
      return;
    }
    if (
      (this.category === "bpmn" || this.category === "activity") &&
      tok.value === "lane"
    ) {
      this.parseLane(undefined);
      return;
    }
    if (this.category === "usecase" && tok.value === "system") {
      this.parseSystem();
      return;
    }
    if (this.category === "usecase" && USECASE_RELATIONS.has(tok.value)) {
      this.parseRelation();
      return;
    }
    if (this.category === "class" && CLASS_RELATIONS.has(tok.value)) {
      // `inherit A -> B`; a class called `depend` is joined as `depend -> B`
      if (this.tokens[this.pos + 1]?.kind === "id") {
        this.parseClassRelation(CLASS_RELATIONS.get(tok.value) as string);
        return;
      }
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
    } else if (this.category === "erd") {
      this.parseErdRelation();
    } else if (this.category === "class") {
      this.parseClassRelation(null);
    } else {
      this.parseEdgeChain();
    }
  }

  /**
   * `system S "Bank ATM" { ... }` — the box the use cases stand inside. It is
   * a pool with no lanes: the same thing a BPMN participant is, drawn the way
   * a use case diagram draws it.
   */
  private parseSystem(): void {
    this.advance();
    const idTok = this.eat("id", 'Expected a system id, e.g. system S1 "Bank ATM" {');
    if (this.isIdTaken(idTok.value)) {
      throw new DSLError(`Duplicate id "${idTok.value}"`, idTok.line);
    }
    const label = this.peekIs("string") ? this.advance().value : idTok.value;
    this.eat("lbrace", 'Expected "{" after the system name');
    this.pools.push({ id: idTok.value, label, lanes: [] });
    this.openLaneIds.push(idTok.value);
    while (!this.peekIs("rbrace")) {
      if (this.pos >= this.tokens.length) {
        throw new DSLError('Missing "}" for the system block', idTok.line);
      }
      const tok = this.tokens[this.pos];
      if (tok.kind === "id" && tok.value === "system") {
        throw new DSLError("A system boundary cannot hold another one", tok.line);
      }
      this.parseStatement();
    }
    this.advance();
    this.openLaneIds.pop();
  }

  /** `include A -> B`, `extend A -> B`, `inherit A -> B`. */
  private parseRelation(): void {
    const keyword = this.advance();
    const rule = USECASE_RELATIONS.get(keyword.value) as { line: string; label: string };
    const from = this.eat("id", `Expected a name after "${keyword.value}"`);
    if (!this.peekIsArrow()) {
      throw new DSLError(
        `"${keyword.value}" is written ${keyword.value} A -> B`,
        keyword.line,
      );
    }
    this.advance();
    const to = this.eat("id", `Expected what "${from.value}" ${keyword.value}s`);
    const label = this.peekIs("string") ? this.advance().value : rule.label;
    this.edges.push({
      from: from.value,
      to: to.value,
      line: rule.line,
      ...(label ? { label } : {}),
    });
  }

  /**
   * `A one -> many B "places"` — one relation, with the crow's foot each end
   * takes. Both ends may be left out: a relation with nothing said about it is
   * one to many, which is what almost every one of them is. A dashed arrow is
   * a non-identifying relation.
   *
   * Either end may name the attribute it joins — `PASSENGER.id one -> many
   * BOOKING.passenger_id` — so the line leaves the primary key it comes from
   * and meets the foreign key it lands on. Left unwritten, `pairPorts` in
   * `layout-erd.ts` works the pair out from the keys themselves.
   */
  private parseErdRelation(): void {
    const from = erdEndpoint(this.eat("id", "A relation is written A one -> many B"));
    const fromEnd = this.parseErdEnd("one");
    if (!this.peekIsArrow()) {
      throw new DSLError(
        `Expected "->" after "${from.id}" (or declare it, e.g. entity ${from.id} "Name")`,
        this.tokens[this.pos]?.line ?? 0,
      );
    }
    const weak = this.peekIs("dashed-arrow");
    this.advance();
    const toEnd = this.parseErdEnd("many");
    const to = erdEndpoint(this.eat("id", `Expected what "${from.id}" is related to`));
    const label = this.peekIs("string") ? this.advance().value : undefined;
    this.edges.push({
      from: from.id,
      to: to.id,
      ...(from.port ? { fromPort: from.port } : {}),
      ...(to.port ? { toPort: to.port } : {}),
      line: weak ? "non-identifying" : erdLine(fromEnd, toEnd),
      ...(label ? { label } : {}),
    });
  }

  /**
   * `inherit Cat -> Animal`, `compose Order "1" -> "1..*" Line "contains"`,
   * `Book -> Author` (a plain association) and `A -.-> B` (a dependency).
   * A multiplicity is a quoted caption on either side of the arrow; the one
   * after the second class is the name of the relation.
   */
  private parseClassRelation(line: string | null): void {
    if (line !== null) {
      this.advance();
    }
    const from = this.eat("id", "A relation is written A -> B, or inherit A -> B");
    const fromEnd = this.peekIs("string") ? this.advance().value : undefined;
    if (!this.peekIsArrow()) {
      throw new DSLError(
        `Expected "->" after "${from.value}" (or declare it, e.g. class ${from.value} "Name")`,
        this.tokens[this.pos]?.line ?? from.line,
      );
    }
    const dashed = this.peekIs("dashed-arrow");
    this.advance();
    const toEnd = this.peekIs("string") ? this.advance().value : undefined;
    const to = this.eat("id", `Expected the class "${from.value}" is related to`);
    const label = this.peekIs("string") ? this.advance().value : undefined;
    const kind = line ?? (dashed ? "class-depend" : "class-association");
    if ((kind === "class-inherit" || kind === "class-implement") && (fromEnd || toEnd)) {
      throw new DSLError(
        "A generalisation or a realisation has no multiplicity; write it on an association",
        from.line,
      );
    }
    this.edges.push({
      from: from.value,
      to: to.value,
      line: kind,
      ...(fromEnd ? { fromEnd } : {}),
      ...(toEnd ? { toEnd } : {}),
      ...(label ? { label } : {}),
    });
  }

  /** `{ attr "- name : String"  method "+ save() : void" }` — one class's members. */
  private parseClassMembers(openLine: number): DSLEntry[] {
    this.advance();
    const members: DSLEntry[] = [];
    while (!this.peekIs("rbrace")) {
      if (this.pos >= this.tokens.length) {
        throw new DSLError('Missing "}" for the class block', openLine);
      }
      const word = this.eat(
        "id",
        'A member is written attr "- name : String" or method "+ save() : void"',
      );
      const kind = CLASS_MEMBERS.get(word.value);
      if (!kind) {
        throw new DSLError(
          `"${word.value}" is not a member — write attr, method or (in an enum) value`,
          word.line,
        );
      }
      const text = this.eat("string", `Expected the ${kind} in quotes after "${word.value}"`);
      members.push({ label: kind, name: text.value });
    }
    this.advance();
    return members;
  }

  /** `{ entry "lamp_on()"  do "heat()"  exit "lamp_off()" }` — what runs inside a state. */
  private parseStateActivities(openLine: number): DSLEntry[] {
    this.advance();
    const rows: DSLEntry[] = [];
    while (!this.peekIs("rbrace")) {
      if (this.pos >= this.tokens.length) {
        throw new DSLError('Missing "}" for the state block', openLine);
      }
      const word = this.eat("id", 'An activity is written entry "…", do "…" or exit "…"');
      if (!STATE_ACTIVITIES.includes(word.value)) {
        throw new DSLError(
          `"${word.value}" is not an activity — a state lists entry, do and exit`,
          word.line,
        );
      }
      const text = this.eat("string", `Expected what runs in quotes after "${word.value}"`);
      rows.push({ label: word.value, name: text.value });
    }
    this.advance();
    // UML lists them entry, do, exit whatever order they were written in
    return rows.sort(
      (a, b) => STATE_ACTIVITIES.indexOf(a.label) - STATE_ACTIVITIES.indexOf(b.label),
    );
  }

  private parseErdEnd(fallback: ErdEnd): ErdEnd {
    const next = this.tokens[this.pos];
    if (next?.kind === "id" && ERD_END_WORDS.has(next.value)) {
      this.advance();
      return ERD_END_WORDS.get(next.value) as ErdEnd;
    }
    return fallback;
  }

  /** `{ pk "id" "bigint" ... }` — the rows inside one entity box. */
  private parseFields(openLine: number): DSLField[] {
    this.advance();
    const fields: DSLField[] = [];
    while (!this.peekIs("rbrace")) {
      if (this.pos >= this.tokens.length) {
        throw new DSLError('Missing "}" for the entity block', openLine);
      }
      const field: DSLField = { name: "" };
      const ahead = this.tokens[this.pos];
      if (ahead.kind === "id") {
        if (!["pk", "fk", "pfk"].includes(ahead.value)) {
          throw new DSLError(
            `"${ahead.value}" is not a key marker — use pk, fk or pfk, or write the attribute in quotes`,
            ahead.line,
          );
        }
        this.advance();
        field.key = ahead.value as DSLField["key"];
      }
      field.name = this.eat(
        "string",
        'An attribute is written "name" "type", e.g. "email" "varchar(90)"',
      ).value;
      if (this.peekIs("string")) {
        field.type = this.advance().value;
      }
      while (this.peekIs("id")) {
        const tag = this.tokens[this.pos];
        if (tag.value === "unique") {
          field.unique = true;
        } else if (tag.value === "null") {
          field.optional = true;
        } else {
          break;
        }
        this.advance();
      }
      fields.push(field);
    }
    this.advance();
    return fields;
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
    if (poolId === undefined && this.category === "activity") {
      // an activity's partitions are columns of one frame, not one box each
      const pool =
        this.pools[0] ?? ({ id: "partitions", label: "", lanes: [] } as DSLPool);
      if (this.pools.length === 0) {
        this.pools.push(pool);
      }
      lane = { id: idTok.value, label };
      pool.lanes.push(lane);
    } else if (poolId === undefined) {
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
    let fields: DSLField[] | undefined;
    let side: "left" | "right" | undefined;
    let at: { x: number; y: number } | undefined;
    let width: number | undefined;
    let height: number | undefined;
    if (this.category === "org") {
      if (this.peekIs("string")) {
        name = this.advance().value;
      }
      if (this.peekIs("lbrace")) {
        entries = this.parseOrgEntries(idTok.line);
      }
    }
    if (this.category === "erd" && this.peekIs("lbrace")) {
      fields = this.parseFields(idTok.line);
    }
    if (this.category === "class" && this.peekIs("lbrace")) {
      entries = this.parseClassMembers(idTok.line);
    }
    if (this.category === "state" && this.peekIs("lbrace")) {
      if (canonical !== "state") {
        throw new DSLError(`Only a state lists activities, not a ${typeTok.value}`, idTok.line);
      }
      entries = this.parseStateActivities(idTok.line);
    }
    // dfd: `process P1 "Check order" "1.1"` — the second caption is its number
    if (this.category === "dfd" && this.peekIs("string")) {
      if (canonical === "entity") {
        throw new DSLError("An external entity carries no number; only processes and stores do", idTok.line);
      }
      name = this.advance().value;
    }
    // usecase: an actor may be pinned to one side of the boundary. Left out,
    // it takes the left when it starts anything and the right otherwise
    if (this.category === "usecase" && canonical === "actor") {
      const where = this.tokens[this.pos];
      const following = this.tokens[this.pos + 1];
      const pinned =
        where?.kind === "id" &&
        (where.value === "left" || where.value === "right") &&
        following?.kind !== "arrow" &&
        following?.kind !== "dashed-arrow";
      if (pinned) {
        this.advance();
        side = where.value as "left" | "right";
      }
    }
    if (this.category === "architecture") {
      while (this.tokens[this.pos]?.kind === "id") {
        const setting = this.tokens[this.pos];
        if (setting.value !== "at" && setting.value !== "size") break;
        this.advance();
        const first = this.eat("number", `"${setting.value}" needs two numbers`);
        const second = this.eat("number", `"${setting.value}" needs two numbers`);
        const x = Number(first.value);
        const y = Number(second.value);
        if (setting.value === "at") {
          if (at) throw new DSLError('"at" was already set', setting.line);
          at = { x, y };
        } else {
          if (width !== undefined) throw new DSLError('"size" was already set', setting.line);
          if (x < 80 || y < 60 || x > 3000 || y > 2000) {
            throw new DSLError('"size" needs width 80–3000 and height 60–2000', setting.line);
          }
          width = x;
          height = y;
        }
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
      ...(fields && fields.length > 0 ? { fields } : {}),
      ...(side ? { side } : {}),
      ...(at ? { at } : {}),
      ...(width !== undefined ? { width, height } : {}),
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
    const before = this.edges.length;
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
    // `A -> B "Order details"`: a caption after one flow names that flow
    if (TRAILING_CAPTION.has(this.category) && this.peekIs("string")) {
      const caption = this.advance();
      const last = this.edges[this.edges.length - 1];
      if (this.edges.length - before > 1) {
        throw new DSLError(
          "A caption in quotes names one flow; write a chain's captions in brackets, e.g. A [Order] -> B",
          caption.line,
        );
      }
      if (last.label) {
        throw new DSLError("This flow already has a caption in brackets", caption.line);
      }
      last.label = caption.value;
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

/**
 * The rules a notation is defined by, beyond what its grammar can say. A data
 * flow that skips its process, a state machine that flows back into its start,
 * a tree with two parents: each parses, and each draws a picture the notation
 * does not allow. The parser refuses them with the rule in words, so the
 * reader and the assistant both learn it from the error.
 */
function checkNotation(category: DiagramCategory, nodes: DSLNode[], edges: DSLEdge[]): void {
  const typeOf = new Map(nodes.map((node) => [node.id, node.type]));
  const labelOf = (id: string) => {
    const node = nodes.find((entry) => entry.id === id);
    return node && node.label !== id ? `"${node.label}"` : id;
  };
  const into = (id: string) => edges.filter((edge) => edge.to === id && edge.kind !== "association");
  const out = (id: string) => edges.filter((edge) => edge.from === id && edge.kind !== "association");

  if (category === "dfd") {
    for (const edge of edges) {
      if (edge.kind === "association") {
        throw new DSLError("A data flow is one solid line, written A -> B", 0);
      }
      if (edge.from === edge.to) {
        throw new DSLError(`${labelOf(edge.from)} flows into itself; a data flow joins two shapes`, 0);
      }
      const a = typeOf.get(edge.from);
      const b = typeOf.get(edge.to);
      if (a === "process" || b === "process") {
        continue;
      }
      const pair = `${labelOf(edge.from)} -> ${labelOf(edge.to)}`;
      if (a === "entity" && b === "entity") {
        throw new DSLError(`${pair}: data cannot move directly between two external entities; a process must stand between them`, 0);
      }
      if (a === "store" && b === "store") {
        throw new DSLError(`${pair}: data cannot move directly from one data store to another; a process must move it`, 0);
      }
      throw new DSLError(`${pair}: an external entity cannot read or write a data store directly; a process must stand between them`, 0);
    }
    if (edges.length > 0) {
      for (const node of nodes) {
        if (node.type !== "process") continue;
        const ins = into(node.id).length;
        const outs = out(node.id).length;
        if (ins === 0 && outs === 0) {
          throw new DSLError(`Process ${labelOf(node.id)} has no data flows; every process takes data in and sends data out`, 0);
        }
        if (outs === 0) {
          throw new DSLError(`Process ${labelOf(node.id)} only takes data in (a black hole); give it an output flow`, 0);
        }
        if (ins === 0) {
          throw new DSLError(`Process ${labelOf(node.id)} only sends data out (a miracle); give it an input flow`, 0);
        }
      }
    }
  }

  if (category === "state") {
    for (const edge of edges) {
      if (edge.kind === "association") {
        throw new DSLError("A transition is one solid line, written A -> B", 0);
      }
    }
    for (const node of nodes) {
      const ins = into(node.id).length;
      const outs = out(node.id).length;
      if (node.type === "initial" && ins > 0) {
        throw new DSLError(`The initial state ${node.id} is where the machine starts; nothing may transition into it`, 0);
      }
      if (node.type === "initial" && outs > 1) {
        throw new DSLError(`The initial state ${node.id} leaves by exactly one transition; branch at a choice after it`, 0);
      }
      if (node.type === "final" && outs > 0) {
        throw new DSLError(`The final state ${node.id} ends the machine; no transition may leave it`, 0);
      }
      if (node.type === "fork" && ins > 1) {
        throw new DSLError(`Fork ${node.id} splits one transition into several; it takes one in`, 0);
      }
      if (node.type === "join" && outs > 1) {
        throw new DSLError(`Join ${node.id} merges several transitions into one; it sends one out`, 0);
      }
    }
  }

  if (category === "tree") {
    const parent = new Map<string, string>();
    for (const edge of edges) {
      if (edge.from === edge.to) {
        throw new DSLError(`${labelOf(edge.from)} branches to itself; a branch joins a parent to a child`, 0);
      }
      if (edge.kind === "association") {
        continue;
      }
      if (typeOf.get(edge.from) === "leaf") {
        throw new DSLError(`${labelOf(edge.from)} is a leaf, so a path ends there; declare it with node to branch from it`, 0);
      }
      const had = parent.get(edge.to);
      if (had) {
        throw new DSLError(`${labelOf(edge.to)} hangs from both ${labelOf(had)} and ${labelOf(edge.from)}; in a tree every box has one parent (use -.-> for a cross link)`, 0);
      }
      parent.set(edge.to, edge.from);
    }
    for (const node of nodes) {
      const seen = new Set<string>([node.id]);
      let at = parent.get(node.id);
      while (at) {
        if (seen.has(at)) {
          throw new DSLError(`The branches through ${labelOf(at)} go round in a circle; a tree has no cycles`, 0);
        }
        seen.add(at);
        at = parent.get(at);
      }
    }
  }
}

export function detectCategory(code: string): DiagramCategory | null {
  const stripped = code
    .replace(/(?:#|\/\/)[^\n]*/g, "")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .trimStart();
  const head = stripped.match(
    /^(flow|bpmn|org|usecase|activity|erd|architecture|class|dfd|state|tree|bar|histogram|line|pie|scatter|mind|matrix|venn|fishbone|sequence|prisma|quadrant|gantt)\b/,
  );
  return head ? (head[1] as DiagramCategory) : null;
}

export function parseDSL(code: string): AST {
  const category = detectCategory(code);
  if (!category) {
    throw new DSLError(
      'A drawing must open with its notation and a title, e.g. flow "My Chart" { — the notations are flow, bpmn, org, usecase, activity, erd, architecture, class, dfd, state, tree, sequence, bar, histogram, line, pie, scatter, mind, matrix, venn, fishbone, prisma, quadrant and gantt',
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
            : category === "sequence"
              ? parseSequence(code)
              : category === "prisma"
                ? parsePrisma(code)
                : category === "quadrant"
                  ? parseQuadrant(code)
                  : category === "gantt"
                    ? parseGantt(code)
                    : parseFishbone(code);
    return { category, title: figure.title, nodes: [], edges: [], figure };
  }
  const nodeTypes =
    category === "flow"
      ? FLOW_NODE_TYPES
      : category === "org"
        ? ORG_NODE_TYPES
        : category === "usecase"
          ? USECASE_NODE_TYPES
          : category === "activity"
            ? ACTIVITY_NODE_TYPES
      : category === "erd"
        ? ERD_NODE_TYPES
        : category === "architecture"
          ? ARCHITECTURE_NODE_TYPES
        : category === "class"
          ? CLASS_NODE_TYPES
        : category === "dfd"
          ? DFD_NODE_TYPES
        : category === "state"
          ? STATE_NODE_TYPES
        : category === "tree"
          ? TREE_NODE_TYPES
        : BPMN_NODE_TYPES;
  return new Parser(tokenize(code), category, nodeTypes).parse();
}
