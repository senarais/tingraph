import { useEffect, useState } from "react";
import { FONT_FAMILY } from "@excalidraw/excalidraw";
import { TEXT_VARIANTS } from "@/lib/text-face";

/**
 * Puts the bold and italic cuts (`lib/text-face.ts`) where Excalidraw and the
 * browser can find them.
 *
 * Excalidraw turns a caption's font id into a CSS family by looking the id up
 * in `FONT_FAMILY`, so the new ids are added to that object; it is a plain,
 * exported, unfrozen map that every part of the library reads through. The
 * faces themselves are ordinary `FontFace`s added to `document.fonts`.
 * Excalidraw's own font registry is private and knows nothing of them, which
 * costs two things this file makes good: it never redraws a caption when one
 * finishes loading (`useTextFacesReady` holds a sheet back until they have,
 * and `loadTextFaces` is awaited before anything is measured), and its SVG
 * export embeds no face for them (`embedTextFaces`).
 */

let registered = false;
let loading: Promise<void> | null = null;

export function registerTextFaces(): void {
  if (registered || typeof document === "undefined") {
    return;
  }
  registered = true;
  const families = FONT_FAMILY as unknown as Record<string, number>;
  for (const variant of TEXT_VARIANTS) {
    families[variant.name] = variant.id;
    document.fonts.add(
      new FontFace(variant.name, `url(${variant.file})`, {
        weight: "400",
        style: "normal",
        display: "swap",
      }),
    );
  }
}

/** Every cut downloaded and ready, once; later calls are the same promise. */
export function loadTextFaces(): Promise<void> {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }
  registerTextFaces();
  loading ??= Promise.all(
    TEXT_VARIANTS.map((variant) => document.fonts.load(`16px "${variant.name}"`, "Aa")),
  )
    .then(() => undefined)
    .catch(() => {
      // an unavailable face falls back to the sheet's own, which still reads
      loading = null;
    });
  return loading;
}

/** Whether any caption in these elements is set in a bold or italic cut. */
export function holdsTextVariant(
  elements: readonly { type: string; isDeleted?: boolean }[],
): boolean {
  const ids = new Set(TEXT_VARIANTS.map((variant) => variant.id));
  return elements.some(
    (element) =>
      !element.isDeleted &&
      element.type === "text" &&
      ids.has((element as unknown as { fontFamily: number }).fontFamily),
  );
}

/**
 * Whether the sheet may be drawn yet. Excalidraw caches each caption's
 * drawing and never draws one again when a face it has not heard of arrives,
 * so a sheet that opens with bold or italic captions waits for the cuts
 * rather than being drawn in the fallback face. Drawing it again afterwards
 * would mean new element versions, which auto-save would read as a change
 * nobody made. A sheet without them is drawn at once; the cuts are still
 * fetched, so a caption pasted or undone into one later has its face.
 */
export function useTextFacesReady(
  elements: readonly { type: string; isDeleted?: boolean }[],
): boolean {
  const [ready, setReady] = useState(() => !holdsTextVariant(elements));
  useEffect(() => {
    let alive = true;
    void loadTextFaces().then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

/** `data:` URL of a served file, for an SVG that has to carry its own fonts. */
async function dataUrl(path: string): Promise<string> {
  const bytes = new Uint8Array(await (await fetch(path)).arrayBuffer());
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return `data:font/woff2;base64,${btoa(binary)}`;
}

/**
 * Makes an exported SVG carry the cuts its captions use. Excalidraw embeds
 * the faces of its own families only, so without this a bold caption opened
 * anywhere but here would be drawn in whatever the viewer falls back to.
 */
export async function embedTextFaces(
  svg: SVGSVGElement,
  used: Iterable<number>,
): Promise<void> {
  const wanted = new Set(used);
  const faces = TEXT_VARIANTS.filter((variant) => wanted.has(variant.id));
  if (faces.length === 0) {
    return;
  }
  const rules = await Promise.all(
    faces.map(
      async (variant) =>
        `@font-face{font-family:"${variant.name}";src:url(${await dataUrl(variant.file)}) format("woff2");}`,
    ),
  );
  const style = svg.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = rules.join("\n");
  svg.insertBefore(style, svg.firstChild);
}
