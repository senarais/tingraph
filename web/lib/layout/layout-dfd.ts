import { findBackEdges, rankNodes, routeAll, routeCost, spreadEnds, turned, type Box } from "@/lib/layout/graph";
import { linesWidth, textWidth, wrapByWidth } from "@/lib/layout/text";
import type {
  AST,
  DSLNode,
  LayoutDirection,
  PositionedAST,
  PositionedNode,
} from "@/lib/types";

/**
 * A data flow diagram in Gane–Sarson notation, laid out.
 *
 * Three shapes and one line, and each shape is told from the others by its
 * outline alone: a process is a rounded box with its number in a band across
 * the top, an external entity is a plain square box, and a data store is a box
 * open on the right with its code in a cell on the left. The notation was
 * chosen over Yourdon's circles because a rounded box holds a sentence and a
 * circle does not.
 *
 * Where they go is `computeDfdLayout`'s own arrangement, below. Two flows
 * between the same pair — a request and its answer — are two lines drawn side
 * by side.
 */

export const DFD_FONT_SIZE = 13;
export const DFD_LINE_HEIGHT = DFD_FONT_SIZE * 1.25;
export const DFD_CODE_FONT_SIZE = 11.5;
/** the band along the top of a process that its number is written in */
export const DFD_BAND = 22;
/** the cell at the left of a data store that its code is written in */
export const DFD_CELL = 38;
const MAX_LABEL = 150;
const MARGIN = 60;

/** The caption inside a DFD shape, already wrapped. */
export function wrapDfdLabel(label: string): string[] {
  return wrapByWidth(label, MAX_LABEL, DFD_FONT_SIZE);
}

export function dfdShapeSize(node: DSLNode): { width: number; height: number } {
  const lines = wrapDfdLabel(node.label);
  const text = linesWidth(lines, DFD_FONT_SIZE);
  const rows = Math.max(1, lines.length);
  switch (node.type) {
    case "process":
      return {
        width: Math.round(Math.max(128, text + 36)),
        height: Math.round(Math.max(76, DFD_BAND + rows * DFD_LINE_HEIGHT + 26)),
      };
    case "store": {
      const cell = Math.max(DFD_CELL, textWidth(node.name ?? "", DFD_CODE_FONT_SIZE) + 16);
      return {
        width: Math.round(Math.max(150, cell + text + 32)),
        height: Math.round(Math.max(40, rows * DFD_LINE_HEIGHT + 20)),
      };
    }
    default:
      return {
        width: Math.round(Math.max(118, text + 36)),
        height: Math.round(Math.max(58, rows * DFD_LINE_HEIGHT + 30)),
      };
  }
}

/** How wide a store's code cell is, which the mapper draws the rule at. */
export function dfdCellWidth(node: DSLNode): number {
  return Math.round(
    Math.max(DFD_CELL, textWidth(node.name ?? "", DFD_CODE_FONT_SIZE) + 16),
  );
}

/**
 * The number a process and the code a store are drawn with when the source
 * gives none: processes count 1, 2, 3 and stores D1, D2, D3, in the order they
 * are declared. A level-1 sheet writes its own (`"1.1"`), and that wins.
 */
export function numberDfd(nodes: readonly DSLNode[]): DSLNode[] {
  let process = 0;
  let store = 0;
  return nodes.map((node) => {
    if (node.type === "process") {
      process += 1;
      return node.name ? node : { ...node, name: String(process) };
    }
    if (node.type === "store") {
      store += 1;
      return node.name ? node : { ...node, name: `D${store}` };
    }
    return node;
  });
}

/** Between two bands of processes: room for a named flow to be read. */
const BAND_GAP = 110;
/** Between two processes in one band, and between two stacked satellites. */
const SIBLING_GAP = 56;
/** Between the spine and the entities or stores beside it: a flow's name fits. */
const SIDE_GAP = 150;
/** How many arrangements the layout routes in search of a tidier one. */
const SEARCH_BUDGET = 48;

type Size = { width: number; height: number };

/**
 * A level-0 data flow diagram the way one is drawn by hand: the processes run
 * down the middle in the order data passes through them, and every external
 * entity and data store stands beside the process it trades with most, so
 * most flows are one short straight line. Ranking everything together, as a
 * flowchart is, puts a store under the process that writes it and the entity
 * a reply goes back to at the top of the sheet — and every flow back up then
 * runs round the whole drawing.
 *
 * Processes are ranked over the flows between them, a flow through a store
 * counting as one from the writer to the reader, with the flows that close a
 * cycle left out. Processes of one rank share a band. An entity or store
 * takes the band of the process it has most flows with (the first written on
 * a tie), and the side its kind is drawn on — entities on the left, stores on
 * the right — unless that side of the band is fuller than the other. A band
 * is as deep as what stands in it.
 *
 * Worked in "down" terms; a sheet that runs across is the same arrangement
 * reflected across the diagonal.
 */
export function computeDfdLayout(
  ast: AST,
  direction: LayoutDirection = "down",
): PositionedAST {
  const numbered = numberDfd(ast.nodes);
  const across = direction === "right";
  // in "down" terms: width runs across a band, height down the sheet
  const sizeOf = (node: DSLNode): Size => {
    const size = dfdShapeSize(node);
    return across ? { width: size.height, height: size.width } : size;
  };
  const processes = numbered.filter((node) => node.type === "process");
  const isProcess = new Set(processes.map((node) => node.id));

  // ---- the spine: processes ranked over the flows between them
  const links: Array<{ from: string; to: string; index: number }> = [];
  ast.edges.forEach((edge, index) => {
    if (isProcess.has(edge.from) && isProcess.has(edge.to) && edge.from !== edge.to) {
      links.push({ from: edge.from, to: edge.to, index });
    }
  });
  // a store written by one process and read by another carries data between them
  ast.edges.forEach((write, index) => {
    if (!isProcess.has(write.from) || isProcess.has(write.to)) return;
    for (const read of ast.edges) {
      if (read.from === write.to && isProcess.has(read.to) && read.to !== write.from) {
        links.push({ from: write.from, to: read.to, index: ast.edges.length + index });
      }
    }
  });
  const back = findBackEdges(processes, links);
  const rank = rankNodes(processes, links.filter((link) => !back.has(link.index)));
  const bands: DSLNode[][] = [];
  for (const node of processes) {
    const at = rank.get(node.id) ?? 0;
    (bands[at] ??= []).push(node);
  }
  const spine = bands.filter((band) => band && band.length > 0);
  const bandOf = new Map<string, number>();
  spine.forEach((band, at) => band.forEach((node) => bandOf.set(node.id, at)));

  // ---- the satellites: each level with a process it trades with
  const sizes = new Map(numbered.map((node) => [node.id, sizeOf(node)]));
  if (spine.length === 0) spine.push([]);
  type Side = "left" | "right";
  /** `outer` stands one column further out, so the flows of a box beside it pass outside it */
  type Spot = { band: number; side: Side; outer: boolean };
  const satellites = numbered.filter((node) => !isProcess.has(node.id));
  const options = new Map<string, Spot[]>();
  const start = new Map<string, Spot>();
  for (const node of satellites) {
    const trades = new Map<number, number>();
    for (const edge of ast.edges) {
      const other = edge.from === node.id ? edge.to : edge.to === node.id ? edge.from : null;
      if (other && isProcess.has(other)) {
        const band = bandOf.get(other) ?? 0;
        trades.set(band, (trades.get(band) ?? 0) + 1);
      }
    }
    if (trades.size === 0) trades.set(0, 0);
    // the band it trades with most, the first written on a tie
    let best = [...trades.keys()][0];
    for (const [band, count] of trades) if (count > (trades.get(best) ?? 0)) best = band;
    const own: Side = node.type === "store" ? "right" : "left";
    const other: Side = own === "left" ? "right" : "left";
    start.set(node.id, { band: best, side: own, outer: false });
    options.set(
      node.id,
      [...trades.keys()].flatMap((band) =>
        [own, other].flatMap((side) => [false, true].map((outer) => ({ band, side, outer }))),
      ),
    );
  }

  /** Every box placed for one choice of spots, in "down" terms. */
  const arrange = (spots: ReadonlyMap<string, Spot>): Map<string, Box> => {
    type Column = "left" | "right" | "outer-left" | "outer-right";
    const columnOf = (spot: Spot): Column => (spot.outer ? `outer-${spot.side}` : spot.side);
    const beside = spine.map(() => ({
      left: [] as DSLNode[], right: [] as DSLNode[], "outer-left": [] as DSLNode[], "outer-right": [] as DSLNode[],
    }));
    for (const node of satellites) {
      const spot = spots.get(node.id)!;
      beside[spot.band][columnOf(spot)].push(node);
    }
    const widest = (column: Column) => Math.max(0, ...satellites
      .filter((node) => columnOf(spots.get(node.id)!) === column)
      .map((node) => sizes.get(node.id)!.width));
    const stack = (list: DSLNode[]) =>
      list.reduce((sum, node, i) => sum + sizes.get(node.id)!.height + (i > 0 ? SIBLING_GAP : 0), 0);
    const widths = spine.map((band) =>
      band.reduce((sum, node, i) => sum + sizes.get(node.id)!.width + (i > 0 ? SIBLING_GAP : 0), 0),
    );
    const spineWidth = Math.max(0, ...widths);
    const reach = (column: "left" | "outer-left") => (widest(column) > 0 ? widest(column) + SIDE_GAP : 0);
    // an outer column stands a whole gap beyond the inner one, or beyond the
    // spine when the inner one is empty
    const spineLeft = MARGIN + reach("outer-left") + reach("left");
    const innerLeft = spineLeft - SIDE_GAP;
    const outerLeft = spineLeft - reach("left") - SIDE_GAP;
    const innerRight = spineLeft + spineWidth + SIDE_GAP;
    const outerRight = innerRight + (widest("right") > 0 ? widest("right") + SIDE_GAP : 0);
    const centre = spineLeft + spineWidth / 2;
    const boxes = new Map<string, Box>();
    let top = MARGIN;
    spine.forEach((band, at) => {
      const tallest = Math.max(0, ...band.map((node) => sizes.get(node.id)!.height));
      const depth = Math.max(
        tallest,
        ...(["left", "right", "outer-left", "outer-right"] as const).map((column) => stack(beside[at][column])),
      );
      const middle = top + depth / 2;
      let x = centre - widths[at] / 2;
      for (const node of band) {
        const size = sizes.get(node.id)!;
        boxes.set(node.id, { x: Math.round(x), y: Math.round(middle - size.height / 2), ...size });
        x += size.width + SIBLING_GAP;
      }
      for (const column of ["left", "right", "outer-left", "outer-right"] as const) {
        let y = middle - stack(beside[at][column]) / 2;
        for (const node of beside[at][column]) {
          const size = sizes.get(node.id)!;
          const left =
            column === "left" ? innerLeft - size.width
            : column === "outer-left" ? outerLeft - size.width
            : column === "right" ? innerRight
            : outerRight;
          boxes.set(node.id, { x: Math.round(left), y: Math.round(y), ...size });
          y += size.height + SIBLING_GAP;
        }
      }
      top += depth + BAND_GAP;
    });
    return boxes;
  };

  /** What a choice costs once its flows are routed: crossings, then corners, then ink. */
  const cost = (spots: ReadonlyMap<string, Spot>): number => {
    const boxes = arrange(spots);
    const laid = numbered.map((node) => {
      const box = boxes.get(node.id)!;
      return { ...node, ...(across ? turned(box) : box), rank: 0 };
    });
    // judged by the routes the sheet will really get: the full router, the
    // sheet the right way round, and the ends spread as they will be
    const byId = new Map(laid.map((node) => [node.id, node]));
    const routes = spreadEnds(routeAll(ast.edges, byId, laid, "dfd", direction), byId, "dfd")
      .map((route) => route.points);
    // an outer column is a last resort: it costs as much as a corner
    const outer = satellites.filter((node) => spots.get(node.id)!.outer).length;
    return routeCost(routes) + outer * 60;
  };

  // one box at a time is moved to a spot that makes the drawing cheaper,
  // until none does. Each try routes the whole sheet, so the tries are
  // counted: a big diagram stops at a good arrangement rather than the best
  const spots = new Map(start);
  let budget = SEARCH_BUDGET;
  if (satellites.length > 0) {
    let current = cost(spots);
    let improved = true;
    while (improved && budget > 0) {
      improved = false;
      for (const node of satellites) {
        const was = spots.get(node.id)!;
        for (const option of options.get(node.id)!) {
          if (budget <= 0) break;
          if (option.band === was.band && option.side === was.side && option.outer === was.outer) continue;
          budget -= 1;
          spots.set(node.id, option);
          const next = cost(spots);
          if (next < current - 1e-6) {
            current = next;
            improved = true;
            break;
          }
          spots.set(node.id, was);
        }
      }
    }
  }
  const placed = arrange(spots);

  const nodes: PositionedNode[] = numbered.map((node) => {
    const box = placed.get(node.id) ?? { x: MARGIN, y: MARGIN, ...sizes.get(node.id)! };
    const laid = across ? turned(box) : box;
    return { ...node, ...laid, rank: bandOf.get(node.id) ?? 0 };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return {
    category: ast.category,
    title: ast.title,
    nodes,
    edges: spreadEnds(routeAll(ast.edges, byId, nodes, "dfd", direction), byId, "dfd"),
  };
}
