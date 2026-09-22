/**
 * Excalidraw sizes a caption with the browser's own text metrics. When the
 * sheet switches style the font underneath a caption changes, so its box has
 * to be measured again or the caption drifts off its anchor. The font string
 * is built the way Excalidraw builds it: `<size>px <family stack>`.
 */

import type { ExcalidrawTextElement } from "@excalidraw/excalidraw/element/types";
import { SHEET_STYLES, type SheetStyle } from "@/lib/sheet";

let context: CanvasRenderingContext2D | null = null;

function ctx(): CanvasRenderingContext2D | null {
  if (context || typeof document === "undefined") {
    return context;
  }
  context = document.createElement("canvas").getContext("2d");
  return context;
}

export interface TextBox {
  width: number;
  height: number;
}

/**
 * The browser measures an unloaded face with whatever it falls back to, which
 * is narrower than Excalifont and would leave every caption cut short. So the
 * face is asked for first, and only then is anything measured.
 */
export async function fontReady(style: SheetStyle, sample: string): Promise<void> {
  const fonts = typeof document === "undefined" ? null : document.fonts;
  if (!fonts) {
    return;
  }
  try {
    await fonts.load(`16px ${style.family}`, sample);
    await fonts.ready;
  } catch {
    // an unavailable face falls back, which is still better than not drawing
  }
}

/** The box a caption occupies, wrapped exactly as it is already written. */
export function measureText(
  text: string,
  fontSize: number,
  css: string,
  lineHeight: number,
): TextBox {
  const lines = text.split("\n");
  const measure = ctx();
  const width = measure
    ? Math.max(
        ...lines.map((line) => {
          measure.font = `${fontSize}px ${css}`;
          return measure.measureText(line).width;
        }),
      )
    : 0;
  return {
    // a whole pixel of slack: Excalidraw draws a caption into a box this wide,
    // and a rounding difference would shave the last glyph off
    width: Math.max(1, Math.ceil(width) + 1),
    height: Math.max(1, lines.length * fontSize * lineHeight),
  };
}

/** The style a caption is set in, found by the face it carries. */
export function styleOfFont(fontFamily: number): SheetStyle {
  return (
    SHEET_STYLES.find((style) => style.fontFamily === fontFamily) ?? SHEET_STYLES[0]
  );
}

/**
 * A caption keeps the point it was set from: a centred one keeps its centre, a
 * left-aligned one keeps its left edge, and the same for the vertical.
 */
function anchored(
  element: ExcalidrawTextElement,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  const dx =
    element.textAlign === "center"
      ? (element.width - width) / 2
      : element.textAlign === "right"
        ? element.width - width
        : 0;
  const dy =
    element.verticalAlign === "middle" ? (element.height - height) / 2 : 0;
  return { x: element.x + dx, y: element.y + dy, width, height };
}

/**
 * Re-sets a caption in a face and a size: Excalidraw draws a caption into a
 * box of exactly this width, so changing either without measuring again would
 * shave the ends off every line.
 */
export function typeset(
  element: ExcalidrawTextElement,
  fontFamily: number,
  fontSize: number,
) {
  const style = styleOfFont(fontFamily);
  const box = measureText(element.text, fontSize, style.css, style.lineHeight);
  return {
    fontFamily,
    fontSize,
    lineHeight: style.lineHeight,
    ...anchored(element, box.width, box.height),
  };
}
