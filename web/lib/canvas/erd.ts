import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { elementsOn, redrawElement, type ElementOnSheet } from "@/lib/canvas/elements";
import { erdPorts } from "@/lib/layout/layout-erd";
import { nodeSize } from "@/lib/layout/compute-layout";
import type { Ink } from "@/lib/ink";
import { FORMAL, type SheetStyle } from "@/lib/sheet";
import type { DSLField, DSLNode } from "@/lib/types";

/**
 * An entity relationship diagram on the sheet.
 *
 * The table is the one element in Tingraph with an inside the reader cannot
 * place by hand: its columns are a list, and where each row sits, how wide the
 * box is, and where a relation meets it all fall out of that list. So a table
 * is drawn from its spec (`lib/canvas/elements.ts`) and edited by rewriting
 * it — from the panel, from the handles on the sheet, or from the source.
 *
 * Everything above `syncTables` is a plain rewrite of one spec with no canvas
 * in it, so it runs under `tsx` and is asserted in `scripts/self-check.ts`.
 */

type Elements = readonly ExcalidrawElement[];

/** The key markers a column steps through when the reader cycles it. */
export const KEY_CYCLE: Array<DSLField["key"] | undefined> = [
  undefined,
  "pk",
  "fk",
  "pfk",
];

export function nextKey(key: DSLField["key"] | undefined): DSLField["key"] | undefined {
  const at = KEY_CYCLE.findIndex((entry) => entry === key);
  return KEY_CYCLE[(at + 1) % KEY_CYCLE.length];
}

/** A column name nothing else in this table answers to. */
export function freshFieldName(spec: DSLNode): string {
  const taken = new Set((spec.fields ?? []).map((field) => field.name));
  let n = (spec.fields?.length ?? 0) + 1;
  while (taken.has(`column_${n}`)) {
    n += 1;
  }
  return `column_${n}`;
}

/** A column put in directly after `at`, or at the bottom when `at` is null. */
export function addField(spec: DSLNode, at: number | null = null): DSLNode {
  const fields = [...(spec.fields ?? [])];
  const added: DSLField = { name: freshFieldName(spec), type: "varchar(50)" };
  fields.splice(at === null ? fields.length : at + 1, 0, added);
  return { ...spec, fields };
}

/** One column taken out. A table always keeps at least one. */
export function removeField(spec: DSLNode, at: number): DSLNode {
  const fields = [...(spec.fields ?? [])];
  if (fields.length < 2 || at < 0 || at >= fields.length) {
    return spec;
  }
  fields.splice(at, 1);
  return { ...spec, fields };
}

/** One column moved a place up or down the table. */
export function moveField(spec: DSLNode, at: number, by: -1 | 1): DSLNode {
  const fields = [...(spec.fields ?? [])];
  const to = at + by;
  if (at < 0 || at >= fields.length || to < 0 || to >= fields.length) {
    return spec;
  }
  [fields[at], fields[to]] = [fields[to], fields[at]];
  return { ...spec, fields };
}

/** One column rewritten. A key left out is a key taken off. */
export function setField(
  spec: DSLNode,
  at: number,
  patch: Partial<DSLField>,
): DSLNode {
  const fields = [...(spec.fields ?? [])];
  if (at < 0 || at >= fields.length) {
    return spec;
  }
  const next: DSLField = { ...fields[at], ...patch };
  // the flags are written only when they are on, so the source reads clean
  for (const flag of ["key", "unique", "optional", "type"] as const) {
    if (next[flag] === undefined || next[flag] === false || next[flag] === "") {
      delete next[flag];
    }
  }
  fields[at] = next;
  return { ...spec, fields };
}

// ------------------------------------------------------------------- the sheet

/** Every table on the sheet: an element whose spec carries columns. */
export function tablesOn(elements: Elements): ElementOnSheet[] {
  return elementsOn(elements).filter((entry) => entry.spec.fields !== undefined);
}

/**
 * Where every column sits on the sheet, table by table.
 *
 * A relation names the two columns it joins rather than the two boxes, so this
 * is what the router cuts against: the height of the primary key it leaves and
 * the height of the foreign key it meets. A column that has since been renamed
 * or taken out simply is not here, and that end falls back to the box.
 */
export function portsOf(elements: Elements): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const table of tablesOn(elements)) {
    const ports = new Map<string, number>();
    for (const [name, offset] of erdPorts(table.spec)) {
      ports.set(name, Math.round(table.box.y + offset));
    }
    if (ports.size > 0) {
      out.set(table.unit, ports);
    }
  }
  return out;
}

/**
 * A table is exactly its band plus its rows, so one that has been stretched by
 * its selection box — which scales every caption inside it — is drawn again
 * properly the moment the pointer is up. A width wider than the columns need
 * is the reader's and is kept; the height is the notation's and is not.
 */
export function syncTables(
  elements: Elements,
  ink: Ink,
  style: SheetStyle = FORMAL,
  busy: ReadonlySet<string> = new Set(),
): ExcalidrawElement[] | null {
  for (const table of tablesOn(elements)) {
    if (table.pieces.some((piece) => busy.has(piece.id))) {
      continue;
    }
    const size = nodeSize("erd", table.spec);
    const width = Math.max(size.width, Math.round(table.box.width));
    if (
      Math.round(table.box.width) === width &&
      Math.round(table.box.height) === size.height
    ) {
      continue;
    }
    return redrawElement(
      elements,
      table.unit,
      table.spec,
      { x: table.box.x, y: table.box.y, width },
      "erd",
      ink,
      style,
    );
  }
  return null;
}
