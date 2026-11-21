/**
 * Bold and italic, which Excalidraw does not have.
 *
 * Excalidraw draws a caption in one face chosen by a number, and draws it at
 * weight 400 upright whatever that face is. So bold and italic are not styles
 * here, they are *other faces*: the caption's `fontFamily` moves to a family
 * whose one and only face is the bold, or the italic, cut of the same style.
 * The element stays an ordinary text element, so copy, export, undo and every
 * save written before this existed keep working, and a caption that is never
 * made bold is exactly what it was.
 *
 * The formal sheet (Helvetica) takes Arimo, which is metric-compatible with
 * it. The playful sheet's Excalifont has no bold or italic anywhere, so its
 * styled captions are set in Nunito, the rounded sans Excalidraw itself pairs
 * with it. This file is only the table; `text-faces.ts` puts the faces in the
 * browser, and nothing here may import Excalidraw, so it runs under `tsx`.
 */

export interface TextVariant {
  /** the id Excalidraw stores on the caption; clear of its own 1–9 and 100/1000 */
  id: number;
  /** the CSS family name the face is registered under */
  name: string;
  /** the sheet font this is the cut of: 2 is Helvetica, 5 is Excalifont */
  base: 2 | 5;
  bold: boolean;
  italic: boolean;
  /** where the woff2 is served from */
  file: string;
}

export const TEXT_VARIANTS: TextVariant[] = [
  { id: 201, name: "Tingraph Sans Bold", base: 2, bold: true, italic: false, file: "/fonts/arimo-latin-700-normal.woff2" },
  { id: 202, name: "Tingraph Sans Italic", base: 2, bold: false, italic: true, file: "/fonts/arimo-latin-400-italic.woff2" },
  { id: 203, name: "Tingraph Sans Bold Italic", base: 2, bold: true, italic: true, file: "/fonts/arimo-latin-700-italic.woff2" },
  { id: 211, name: "Tingraph Soft Bold", base: 5, bold: true, italic: false, file: "/fonts/nunito-latin-700-normal.woff2" },
  { id: 212, name: "Tingraph Soft Italic", base: 5, bold: false, italic: true, file: "/fonts/nunito-latin-400-italic.woff2" },
  { id: 213, name: "Tingraph Soft Bold Italic", base: 5, bold: true, italic: true, file: "/fonts/nunito-latin-700-italic.woff2" },
];

export interface Face {
  /** the sheet font the caption is a cut of; any other font is its own base */
  base: number;
  bold: boolean;
  italic: boolean;
}

/** What a caption's font id means: which sheet font, and which cut of it. */
export function faceOf(fontFamily: number): Face {
  const variant = TEXT_VARIANTS.find((entry) => entry.id === fontFamily);
  return variant
    ? { base: variant.base, bold: variant.bold, italic: variant.italic }
    : { base: fontFamily, bold: false, italic: false };
}

/**
 * The font id for a sheet font in a given cut. A font with no cuts of its own
 * (anything but the two sheet fonts) is returned as it was.
 */
export function familyFor(base: number, bold: boolean, italic: boolean): number {
  if (!bold && !italic) {
    return base;
  }
  return (
    TEXT_VARIANTS.find(
      (entry) => entry.base === base && entry.bold === bold && entry.italic === italic,
    )?.id ?? base
  );
}

/**
 * The CSS stack a styled caption is measured in, or null for a plain one.
 * `fallback` is the base style's own stack, so a glyph the cut does not carry
 * falls back to what the sheet would have drawn.
 */
export function variantCss(fontFamily: number, fallback: string): string | null {
  const variant = TEXT_VARIANTS.find((entry) => entry.id === fontFamily);
  return variant ? `"${variant.name}", ${fallback}` : null;
}
