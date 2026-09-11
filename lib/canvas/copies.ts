import { unitOf, type LinkMark } from "@/lib/canvas/units";

/**
 * Making a copy its own element.
 *
 * Excalidraw copies an element whole: a new id, a new group, and the same
 * everything else — including the mark that says which Tingraph element each
 * piece belongs to. Left alone, the copy answers to the same name as the
 * original, so the repair that keeps an element in one piece gathers the two
 * into a single group and the pasted box is stuck to the box it came from.
 *
 * Every copy is renamed here instead, at the moment it is made, and a copied
 * connector is re-tied to the copies of the two elements it joined. A
 * connector copied without them comes away loose and stays where it is put,
 * which is the one thing a reader can see and undo.
 *
 * Nothing here touches Excalidraw, so all of it runs under `tsx`.
 */

interface Piece {
  id: string;
  groupIds: readonly string[];
  customData?: Record<string, unknown>;
}

export interface CopyPatch {
  unit: string;
  groupIds: string[];
  /** the re-tied connector, or null when it came away without its elements */
  link?: LinkMark | null;
}

/**
 * What has to change on each freshly made copy, by element id. `fresh` hands
 * out a name nothing else on the sheet answers to.
 */
export function renameCopies(
  next: readonly Piece[],
  prev: readonly { id: string }[],
  fresh: () => string,
): Map<string, CopyPatch> {
  const before = new Set(prev.map((piece) => piece.id));
  const renamed = new Map<string, string>();
  const copies: Array<[Piece, ReturnType<typeof unitOf>]> = [];
  for (const piece of next) {
    const mark = before.has(piece.id) ? null : unitOf(piece);
    if (!mark) {
      continue;
    }
    copies.push([piece, mark]);
    if (!renamed.has(mark.unit)) {
      renamed.set(mark.unit, `${mark.unit}~${fresh()}`);
    }
  }

  const patches = new Map<string, CopyPatch>();
  for (const [piece, mark] of copies) {
    const unit = renamed.get(mark!.unit) as string;
    const patch: CopyPatch = {
      unit,
      // the innermost group is the element's own, which the repair keeps
      // first; a group the reader drew around it is Excalidraw's to copy
      groupIds: piece.groupIds.map((id, index) => (index === 0 ? unit : id)),
    };
    if (mark!.link) {
      const from = renamed.get(mark!.link.from.unit);
      const to = renamed.get(mark!.link.to.unit);
      patch.link =
        from && to
          ? {
              ...mark!.link,
              from: { ...mark!.link.from, unit: from },
              to: { ...mark!.link.to, unit: to },
              at: "",
            }
          : null;
    }
    patches.set(piece.id, patch);
  }
  return patches;
}
