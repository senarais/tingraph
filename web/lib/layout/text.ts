/**
 * How wide a caption comes out, without a browser to ask.
 *
 * Every layout in Tingraph has to know how much room a word takes before
 * anything is drawn, and all of them run under `tsx` as well as in the page,
 * so the measurement is an approximation of Helvetica's advance widths rather
 * than a call into a canvas. Keeping it in one file is what stops two
 * notations disagreeing about where a label wraps.
 */

/** Advance width of one Helvetica glyph, relative to the font size. */
function charRatio(char: string): number {
  if (" ,.;:'!|iljt[]()".includes(char)) return 0.3;
  if ("fr".includes(char)) return 0.37;
  if ("mw".includes(char)) return 0.85;
  if ("MW".includes(char)) return 0.92;
  if (char >= "A" && char <= "Z") return 0.7;
  if (char >= "0" && char <= "9") return 0.56;
  return 0.55;
}

/** Approximate rendered width of a single text line. */
export function textWidth(text: string, fontSize: number): number {
  let ratio = 0;
  for (const char of text) {
    ratio += charRatio(char);
  }
  return ratio * fontSize;
}

export function wrapByWidth(label: string, maxWidth: number, fontSize: number): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate, fontSize) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

export function linesWidth(lines: string[], fontSize: number): number {
  return lines.reduce((max, line) => Math.max(max, textWidth(line, fontSize)), 0);
}

