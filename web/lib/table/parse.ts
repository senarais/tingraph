/**
 * Reading a table off the clipboard or out of a file.
 *
 * Everything here is pure text in, rows out, so it runs under `tsx` and is
 * asserted in `scripts/editor-check.ts` rather than clicked through. It never
 * touches the DOM: the HTML other programs put on the clipboard is read with a
 * small tokenizer of our own, because `DOMParser` is not there under `tsx`
 * and because what Word, Excel and Google Sheets write is far from tidy.
 *
 * What comes out is a `Grid`: a rectangle of cells with merged cells already
 * resolved. Turning it into a drawing is `table.ts`'s job.
 */

export interface GridCell {
  /** what the cell says, on the one cell a merge starts in; empty on the rest it covers */
  own: string;
  /** what the cell says including a merge's other cells: a merged heading names every column it spans */
  flow: string;
  /** the cell's own fill, as `#rrggbb`, when the source gave it one */
  color?: string;
  /** a heading cell: `<th>`, or inside `<thead>` */
  heading: boolean;
  /** this cell starts a merge across more than one column */
  wide: boolean;
}

export interface Grid {
  caption: string;
  rows: GridCell[][];
  /** how many rows from the top the source marked as headings (at least 1 is assumed by the reader) */
  headingRows: number;
}

/** Largest table that is drawn: every cell is a box and a caption on the sheet. */
export const TABLE_LIMITS = { rows: 100, columns: 30, cells: 1500 } as const;

/** The refusal for a table over the limits, said the way the panel says it. */
export function tooLarge(rows: number, columns: number): string | null {
  if (rows > TABLE_LIMITS.rows || columns > TABLE_LIMITS.columns || rows * columns > TABLE_LIMITS.cells) {
    return `That table is ${rows} rows by ${columns} columns. Up to ${TABLE_LIMITS.rows} rows, ${TABLE_LIMITS.columns} columns and ${TABLE_LIMITS.cells} cells are drawn: copy a smaller part.`;
  }
  return null;
}

// ---------------------------------------------------------------- text

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  hellip: "…", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™", times: "×",
  deg: "°", plusmn: "±", laquo: "«", raquo: "»", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  euro: "€", pound: "£", yen: "¥", cent: "¢", larr: "←", rarr: "→", uarr: "↑", darr: "↓",
};

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** One line of single spaces: what a cell holds once the markup is gone. */
function flatten(text: string): string {
  return text.replace(/[\s ​]+/g, " ").trim();
}

// ---------------------------------------------------------------- colour

const NAMED: Record<string, string> = {
  black: "#000000", red: "#ff0000", green: "#008000", blue: "#0000ff", yellow: "#ffff00",
  orange: "#ffa500", purple: "#800080", gray: "#808080", grey: "#808080", silver: "#c0c0c0",
  lime: "#00ff00", aqua: "#00ffff", cyan: "#00ffff", fuchsia: "#ff00ff", magenta: "#ff00ff",
  maroon: "#800000", navy: "#000080", olive: "#808000", teal: "#008080", pink: "#ffc0cb",
  lightgray: "#d3d3d3", lightgrey: "#d3d3d3", lightblue: "#add8e6", lightgreen: "#90ee90",
  lightyellow: "#ffffe0", gold: "#ffd700",
};

/**
 * A CSS colour as `#rrggbb`, or null when it is not a colour that says
 * anything: transparent, unreadable, or so near white that it is the paper.
 */
export function readColour(value: string): string | null {
  const text = value.trim().toLowerCase();
  let rgb: [number, number, number] | null = null;
  let alpha = 1;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(text);
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].split("").map((d) => d + d).join("") : hex[1];
    rgb = [0, 2, 4].map((at) => parseInt(digits.slice(at, at + 2), 16)) as [number, number, number];
  } else {
    const fn = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)(?:\s*[,/]\s*(\d*\.?\d+%?))?\s*\)$/.exec(text);
    if (fn) {
      rgb = [Number(fn[1]), Number(fn[2]), Number(fn[3])];
      if (fn[4] !== undefined) {
        alpha = fn[4].endsWith("%") ? parseFloat(fn[4]) / 100 : parseFloat(fn[4]);
      }
    } else if (NAMED[text]) {
      return readColour(NAMED[text]);
    }
  }
  if (!rgb || rgb.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 255) || alpha < 0.1) {
    return null;
  }
  const [r, g, b] = rgb.map(Math.round);
  // paper: a table copied off a white page says "white" in every cell
  if (r >= 250 && g >= 250 && b >= 250) {
    return null;
  }
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** The colour a `background` or `background-color` declaration sets, if it says. */
function backgroundIn(style: string): { said: boolean; colour: string | null } {
  // the last declaration wins in CSS; `background` may hold more than a colour
  const found = [...style.matchAll(/(?:^|[;{])\s*background(?:-color)?\s*:\s*([^;}]+)/gi)].pop();
  if (!found) {
    return { said: false, colour: null };
  }
  const value = found[1].trim();
  const first = /(#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|[a-z]+)/i.exec(value);
  const colour = first ? readColour(first[1]) : null;
  return { said: colour !== null || /^(?:transparent|none|white|inherit|initial)\b/i.test(value), colour };
}

/**
 * The fills a page's own stylesheet gives its classes. Excel puts a cell's
 * fill there (`.xl66 {background:#FFFF00;}`) and only the class on the cell,
 * so without this every fill copied out of Excel would be lost.
 */
function classFills(html: string): Map<string, string | null> {
  const fills = new Map<string, string | null>();
  for (const block of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const rule of block[1].matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const { said, colour } = backgroundIn(rule[2]);
      if (!said) continue;
      for (const selector of rule[1].split(",")) {
        const name = /\.([-\w]+)\s*$/.exec(selector.trim())?.[1];
        if (name) fills.set(name.toLowerCase(), colour);
      }
    }
  }
  return fills;
}

/**
 * The fill a cell is given, if any: its own inline style first, then
 * `bgcolor`, then the last of its classes the page's stylesheet fills.
 */
function fillOf(attrs: Record<string, string>, classes: Map<string, string | null>): string | null {
  const inline = backgroundIn(attrs.style ?? "");
  if (inline.said) {
    return inline.colour;
  }
  const legacy = attrs.bgcolor?.trim() ?? "";
  if (legacy) {
    // `bgcolor` is a name, or hex with or without its hash
    return readColour(/^[0-9a-f]{6}$/i.test(legacy) ? `#${legacy}` : legacy);
  }
  const named = (attrs.class ?? "").toLowerCase().split(/\s+/).filter((name) => classes.has(name));
  return named.length > 0 ? (classes.get(named[named.length - 1]) ?? null) : null;
}

// ---------------------------------------------------------------- html

interface Token {
  kind: "open" | "close" | "text";
  name: string;
  attrs: Record<string, string>;
  text: string;
}

/** Elements whose contents are never table text. */
const SILENT = new Set(["style", "script", "template", "head", "title", "svg", "noscript"]);

function tokenize(html: string): Token[] {
  const out: Token[] = [];
  let at = 0;
  while (at < html.length) {
    const lt = html.indexOf("<", at);
    if (lt < 0) {
      out.push({ kind: "text", name: "", attrs: {}, text: html.slice(at) });
      break;
    }
    if (lt > at) {
      out.push({ kind: "text", name: "", attrs: {}, text: html.slice(at, lt) });
    }
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      at = end < 0 ? html.length : end + 3;
      continue;
    }
    const next = html[lt + 1] ?? "";
    if (next === "!" || next === "?") {
      // a doctype, a processing instruction or one of Word's conditional markers
      const end = html.indexOf(">", lt);
      at = end < 0 ? html.length : end + 1;
      continue;
    }
    if (!/[a-z/]/i.test(next)) {
      // a bare "<" in text
      out.push({ kind: "text", name: "", attrs: {}, text: "<" });
      at = lt + 1;
      continue;
    }
    // the tag runs to the first ">" that is not inside a quoted value
    let end = lt + 1;
    let quote = "";
    while (end < html.length) {
      const char = html[end];
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === ">") {
        break;
      }
      end += 1;
    }
    const body = html.slice(lt + 1, end);
    at = end + 1;
    const closing = body.startsWith("/");
    const name = /^\/?\s*([a-z][a-z0-9:-]*)/i.exec(body)?.[1]?.toLowerCase() ?? "";
    if (!name) {
      continue;
    }
    const attrs: Record<string, string> = {};
    if (!closing) {
      for (const match of body.matchAll(/([a-z_:][-a-z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/gi)) {
        const key = match[1].toLowerCase();
        if (key !== name && !(key in attrs)) {
          attrs[key] = decode(match[2] ?? match[3] ?? match[4] ?? "");
        }
      }
    }
    out.push({ kind: closing ? "close" : "open", name, attrs, text: "" });
  }
  return out;
}

interface RawCell {
  text: string;
  color: string | null;
  colspan: number;
  rowspan: number;
  heading: boolean;
}

const BREAKS = new Set(["br", "p", "div", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "dd", "dt"]);

function span(value: string | undefined, most: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, most) : 1;
}

/**
 * The first table in some HTML, or null when there is none. A table nested in
 * a cell is read as that cell's text; a second table beside the first is left
 * alone.
 */
export function parseHtmlTable(html: string): Grid | null {
  if (!/<table[\s>]/i.test(html)) {
    return null;
  }
  const rows: RawCell[][] = [];
  const classes = classFills(html);
  let caption = "";
  let depth = 0;
  let done = false;
  let row: RawCell[] | null = null;
  let cell: RawCell | null = null;
  let inCaption = false;
  let silent = 0;
  let hidden = 0;
  let headRows = 0;
  let inHead = false;
  const flushCell = () => {
    // one cell past the limit is enough to refuse the table; the rest of a
    // row copied out of a huge sheet is never kept
    if (cell && row && row.length <= TABLE_LIMITS.columns) {
      cell.text = flatten(cell.text);
      row.push(cell);
    }
    cell = null;
  };
  const flushRow = () => {
    flushCell();
    if (row && row.length > 0) {
      rows.push(row);
      if (inHead) headRows = rows.length;
      // likewise one row past the limit: a hundred thousand rows copied out
      // of Excel are refused without reading them all
      if (rows.length > TABLE_LIMITS.rows) done = true;
    }
    row = null;
  };
  // hidden elements are kept apart from silent ones: a hidden row is skipped,
  // not the whole table
  const hiddenStack: string[] = [];
  for (const token of tokenize(html)) {
    if (done) break;
    if (silent > 0) {
      if (token.kind === "close" && SILENT.has(token.name)) silent -= 1;
      else if (token.kind === "open" && SILENT.has(token.name)) silent += 1;
      continue;
    }
    if (token.kind === "open" && SILENT.has(token.name)) {
      silent += 1;
      continue;
    }
    if (token.kind === "text") {
      if (hidden > 0) continue;
      const text = decode(token.text);
      if (cell) cell.text += text;
      else if (inCaption) caption += text;
      continue;
    }
    const { name } = token;
    if (token.kind === "open" && depth >= 1 && name !== "table" && /display\s*:\s*none/i.test(token.attrs.style ?? "")) {
      // a hidden element: its text is not the table's (void elements never close)
      if (!["br", "img", "hr", "col"].includes(name)) {
        hidden += 1;
        hiddenStack.push(name);
      }
      continue;
    }
    if (hidden > 0) {
      const top = hiddenStack[hiddenStack.length - 1];
      // a hidden row or cell left open by the markup ends where the next one
      // starts, or with the table; anything else ends at its own closing tag
      const implicit =
        (name === "table" && token.kind === "close") ||
        (token.kind === "open" &&
          ((name === "tr" && hiddenStack.some((open) => ["tr", "td", "th"].includes(open))) ||
            ((name === "td" || name === "th") && (top === "td" || top === "th"))));
      if (implicit) {
        hidden = 0;
        hiddenStack.length = 0;
      } else {
        if (token.kind === "close" && top === name) {
          hiddenStack.pop();
          hidden -= 1;
        } else if (token.kind === "open" && top === name) {
          hiddenStack.push(name);
          hidden += 1;
        }
        continue;
      }
    }
    if (name === "table") {
      if (token.kind === "open") {
        depth += 1;
      } else if (depth > 0) {
        depth -= 1;
        if (depth === 0) {
          flushRow();
          if (rows.length > 0) done = true;
        }
      }
      continue;
    }
    if (depth === 0) continue;
    if (depth > 1) {
      // inside a nested table: only its words count, as part of the cell
      if (cell && (BREAKS.has(name) || name === "td" || name === "th")) cell.text += " ";
      continue;
    }
    switch (name) {
      case "thead":
      case "tbody":
      case "tfoot":
        // a row left open by the markup ends here, in the section it was in
        flushRow();
        inHead = name === "thead" && token.kind === "open";
        break;
      case "tr":
        flushRow();
        if (token.kind === "open") row = [];
        break;
      case "td":
      case "th":
        flushCell();
        if (token.kind === "open") {
          if (!row) row = [];
          cell = {
            text: "",
            color: fillOf(token.attrs, classes),
            colspan: span(token.attrs.colspan, TABLE_LIMITS.columns + 1),
            rowspan: span(token.attrs.rowspan, TABLE_LIMITS.rows + 1),
            heading: name === "th" || inHead,
          };
        }
        break;
      case "caption":
        inCaption = token.kind === "open";
        break;
      default:
        if (cell && BREAKS.has(name)) cell.text += " ";
    }
  }
  flushRow();
  if (rows.length === 0) {
    return null;
  }
  return resolve(rows, flatten(caption), headRows);
}

/**
 * Merged cells resolved into a plain rectangle. A cell that starts a merge
 * keeps its words; the cells it covers keep the fill, and say the same words
 * in `flow` so a heading over three columns names all three.
 */
function resolve(rows: RawCell[][], caption: string, headRows: number): Grid {
  const taken = new Set<string>();
  const cells = new Map<string, GridCell>();
  let width = 0;
  const height = rows.length;
  rows.forEach((raw, r) => {
    let c = 0;
    for (const source of raw) {
      while (taken.has(`${r},${c}`)) c += 1;
      for (let dr = 0; dr < source.rowspan && r + dr < height; dr += 1) {
        for (let dc = 0; dc < source.colspan; dc += 1) {
          taken.add(`${r + dr},${c + dc}`);
          const origin = dr === 0 && dc === 0;
          cells.set(`${r + dr},${c + dc}`, {
            own: origin ? source.text : "",
            flow: source.text,
            ...(source.color ? { color: source.color } : {}),
            heading: source.heading,
            wide: origin && source.colspan > 1,
          });
        }
      }
      c += source.colspan;
      width = Math.max(width, c);
    }
  });
  const grid: GridCell[][] = [];
  for (let r = 0; r < height; r += 1) {
    const line: GridCell[] = [];
    for (let c = 0; c < width; c += 1) {
      line.push(cells.get(`${r},${c}`) ?? { own: "", flow: "", heading: false, wide: false });
    }
    grid.push(line);
  }
  return { caption, rows: grid, headingRows: headRows };
}

// ---------------------------------------------------------------- delimited

/**
 * Rows of cells from delimited text, with the quoting Excel and CSV files use:
 * a quoted cell may hold the delimiter, a line break, and `""` for a quote.
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  let started = false;
  const body = text.replace(/^﻿/, "");
  for (let at = 0; at < body.length; at += 1) {
    const char = body[at];
    if (quoted) {
      if (char === '"') {
        if (body[at + 1] === '"') {
          value += '"';
          at += 1;
        } else {
          quoted = false;
        }
      } else {
        value += char;
      }
    } else if (char === '"' && value === "") {
      quoted = true;
      started = true;
    } else if (char === delimiter) {
      row.push(value);
      value = "";
      started = true;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && body[at + 1] === "\n") at += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      started = false;
    } else {
      value += char;
      started = true;
    }
  }
  if (started || value !== "" || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

/** The delimiter a block of text most likely uses: tab, semicolon or comma. */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "").slice(0, 20);
  let best = "\t";
  let most = 0;
  for (const delimiter of ["\t", ";", ","]) {
    const counts = lines.map((line) => parseDelimited(line, delimiter)[0]?.length ?? 1);
    // a delimiter has to split every line the same way to count
    const first = counts[0] ?? 1;
    const score = first > 1 && counts.every((count) => count === first) ? first * lines.length : 0;
    if (score > most) {
      most = score;
      best = delimiter;
    }
  }
  return best;
}

/** A rectangle of text cells as a grid. */
export function gridFromRows(rows: string[][]): Grid | null {
  const lines = rows.filter((line) => line.some((value) => value.trim() !== ""));
  const width = Math.max(0, ...lines.map((line) => line.length));
  if (lines.length === 0 || width === 0) {
    return null;
  }
  return {
    caption: "",
    headingRows: 1,
    rows: lines.map((line) =>
      Array.from({ length: width }, (_, at) => {
        const own = flatten(line[at] ?? "");
        return { own, flow: own, heading: false, wide: false };
      }),
    ),
  };
}

/** Text from a file or a text box: delimiter found, quoting honoured. */
export function parseTableText(text: string): Grid | null {
  return gridFromRows(parseDelimited(text, detectDelimiter(text)));
}

/**
 * Whether plain text copied from somewhere is a table. Only tabs say so — a
 * comma or a space is in every sentence — and every line has to be split by
 * them: code indented with tabs is not a table, and must paste as text.
 */
export function looksTabular(text: string): boolean {
  const rows = parseDelimited(text, "\t").filter((row) => row.some((value) => value.trim() !== ""));
  if (rows.length < 2 || rows.some((row) => row.length < 2)) {
    return false;
  }
  // indented code has an empty first cell on most of its lines
  return rows.filter((row) => row[0] === "").length * 2 < rows.length;
}

/**
 * The table on the clipboard, if what was copied is one: an HTML table first
 * (it carries merged cells and fills), else tab-separated text, which is what
 * Excel, Sheets and most terminals put there.
 */
export function tableFromClipboard(html: string, text: string): Grid | null {
  const fromHtml = html ? parseHtmlTable(html) : null;
  if (fromHtml) {
    // one cell copied out of a spreadsheet still arrives as a table; it is a
    // value to paste as text, not a table of one
    return isTable(fromHtml) ? fromHtml : null;
  }
  return text && looksTabular(text) ? gridFromRows(parseDelimited(text, "\t")) : null;
}

/** More than one cell: anything less is a value, not a table. */
export function isTable(grid: Grid): boolean {
  return grid.rows.length * (grid.rows[0]?.length ?? 0) >= 2;
}
