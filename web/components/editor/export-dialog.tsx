"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  exportToBlob,
  exportToCanvas,
  exportToSvg,
  getCommonBounds,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Download, X } from "lucide-react";
import { jpegToPdf } from "@/lib/export/pdf";
import { Field, Segmented, SlabButton, Tick } from "@/components/editor/ui";

/**
 * One way out of the editor, with the whole decision on screen: what the file
 * will look like, how many pixels it will be, and what it will be called.
 */

type Format = "png" | "jpg" | "svg" | "pdf";

const FORMATS: Array<{ value: Format; label: string; note: string }> = [
  { value: "png", label: "PNG", note: "Lossless raster. The safe default for a document." },
  { value: "jpg", label: "JPG", note: "Smaller raster, no transparency, slight softening." },
  { value: "svg", label: "SVG", note: "Vector. Scales without limit; best for LaTeX and Word." },
  { value: "pdf", label: "PDF", note: "One page sized to the drawing, image inside at full scale." },
];

const SCALES = [1, 2, 3, 4];
/** A CSS pixel is 1/96 inch; a PDF point is 1/72. */
const PT_PER_PX = 72 / 96;

function slugify(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "tingraph"
  );
}

function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ExportDialog({
  api,
  title,
  onClose,
}: {
  api: ExcalidrawImperativeAPI | null;
  title: string;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<Format>("png");
  const [scale, setScale] = useState(2);
  const [padding, setPadding] = useState(24);
  const [opaque, setOpaque] = useState(true);
  const [name, setName] = useState(() => slugify(title));
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // read once per open, so the measurements below have a stable input
  const elements = useMemo(() => api?.getSceneElements() ?? [], [api]);
  const transparent = !opaque && (format === "png" || format === "svg");

  // the scene is measured once per open: the dialog is a decision about what
  // is already on the sheet, not a second view of it
  const base = useMemo(() => {
    if (elements.length === 0) {
      return { width: 0, height: 0 };
    }
    const [minX, minY, maxX, maxY] = getCommonBounds(elements);
    return {
      width: Math.round(maxX - minX + padding * 2),
      height: Math.round(maxY - minY + padding * 2),
    };
  }, [elements, padding]);

  const appState = useMemo(
    () => ({
      ...(api?.getAppState() ?? {}),
      exportBackground: !transparent,
      viewBackgroundColor: "#ffffff",
      exportWithDarkMode: false,
    }),
    [api, transparent],
  );

  // --- the picture of what is about to be written
  useEffect(() => {
    let alive = true;
    const draw = async (): Promise<string | null> => {
      if (!api || api.getSceneElements().length === 0) {
        return null;
      }
      try {
        const canvas = await exportToCanvas({
          elements: api.getSceneElements(),
          appState,
          files: api.getFiles(),
          exportPadding: padding,
          maxWidthOrHeight: 560,
        });
        return canvas.toDataURL("image/png");
      } catch {
        return null;
      }
    };
    draw().then((url) => {
      if (alive) {
        setPreview(url);
      }
    });
    return () => {
      alive = false;
    };
  }, [api, appState, padding]);

  const width = Math.round(base.width * scale);
  const height = Math.round(base.height * scale);

  const setWidth = (next: number) => {
    if (base.width > 0 && next > 0) {
      setScale(Math.min(12, Math.max(0.1, next / base.width)));
    }
  };
  const setHeight = (next: number) => {
    if (base.height > 0 && next > 0) {
      setScale(Math.min(12, Math.max(0.1, next / base.height)));
    }
  };

  const run = useCallback(async () => {
    if (!api || busy || elements.length === 0) {
      return;
    }
    setBusy(true);
    try {
      const scene = api.getSceneElements();
      const files = api.getFiles();
      const filename = `${slugify(name)}.${format}`;

      if (format === "svg") {
        const svg = await exportToSvg({
          elements: scene,
          appState,
          files,
          exportPadding: padding,
        });
        save(
          new Blob([svg.outerHTML], { type: "image/svg+xml;charset=utf-8" }),
          filename,
        );
        return;
      }

      if (format === "pdf") {
        const canvas = await exportToCanvas({
          elements: scene,
          appState: { ...appState, exportBackground: true },
          files,
          exportPadding: padding,
          getDimensions: (w: number, h: number) => ({
            width: w * scale,
            height: h * scale,
            scale,
          }),
        });
        const jpeg = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.94),
        );
        if (!jpeg) {
          return;
        }
        save(
          jpegToPdf(new Uint8Array(await jpeg.arrayBuffer()), {
            pageWidth: base.width * PT_PER_PX,
            pageHeight: base.height * PT_PER_PX,
          }),
          filename,
        );
        return;
      }

      const blob = await exportToBlob({
        elements: scene,
        appState:
          format === "jpg" ? { ...appState, exportBackground: true } : appState,
        files,
        exportPadding: padding,
        mimeType: format === "jpg" ? "image/jpeg" : "image/png",
        quality: 0.94,
        getDimensions: (w: number, h: number) => ({
            width: w * scale,
            height: h * scale,
            scale,
          }),
      });
      save(blob, filename);
    } finally {
      setBusy(false);
    }
  }, [api, appState, base, busy, elements.length, format, name, padding, scale]);

  // the sheet's shortcuts run on the document, so while this is open the
  // dialog keeps the keyboard: Delete must not reach the drawing behind it
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    frame.current?.focus();
  }, []);

  const note = FORMATS.find((entry) => entry.value === format)?.note ?? "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Export the drawing"
      className="fixed inset-0 z-50 flex items-center justify-center bg-edge/40 p-4 font-mono"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={frame}
        tabIndex={-1}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            onClose();
          }
        }}
        className="slab flex max-h-full w-[min(940px,96vw)] flex-col bg-bone outline-none"
      >
        <header className="flex items-center gap-3 border-b-2 border-edge px-4 py-2.5">
          <h2 className="text-[13px] font-semibold text-ink">Export</h2>
          <span className="text-[11.5px] text-ink-soft">{title || "Untitled"}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto border-2 border-edge bg-white p-1 text-ink transition-colors hover:bg-bone"
          >
            <X size={14} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-[minmax(0,1fr)_320px]">
          {/* ------------------------------------------------------ preview */}
          <div className="flex min-h-[240px] items-center justify-center border-b-2 border-edge bg-white p-5 md:border-b-0 md:border-r-2">
            {preview ? (
              // a data URL of the reader's own drawing: there is nothing for an
              // image loader to optimise, and no network round trip to save
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Preview of the exported drawing"
                className="max-h-[52vh] max-w-full border-2 border-edge object-contain"
                style={
                  transparent
                    ? {
                        backgroundImage:
                          "conic-gradient(#e9e9e4 25%, #ffffff 0 50%, #e9e9e4 0 75%, #ffffff 0)",
                        backgroundSize: "16px 16px",
                      }
                    : undefined
                }
              />
            ) : (
              <p className="text-[12px] text-ink-faint">Nothing on the sheet yet.</p>
            )}
          </div>

          {/* ----------------------------------------------------- controls */}
          <div className="divide-y-2 divide-edge">
            <Field label="Format" className="p-4">
              <Segmented
                size="sm"
                options={FORMATS.map((entry) => ({
                  value: entry.value,
                  label: entry.label,
                }))}
                value={format}
                onChange={setFormat}
              />
              <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">{note}</p>
            </Field>

            <Field label="Size" className="p-4">
              <Segmented
                size="sm"
                options={SCALES.map((value) => ({ value, label: `${value}x` }))}
                value={SCALES.includes(scale) ? scale : -1}
                onChange={setScale}
              />
              <div className="mt-2.5 flex items-center gap-2">
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Width in pixels</span>
                  <input
                    type="number"
                    min={1}
                    value={width}
                    onChange={(event) => setWidth(Number(event.target.value))}
                    className="w-full border-2 border-edge bg-white px-2 py-1 text-[12px] text-ink"
                  />
                </label>
                <span className="text-[12px] text-ink-faint">x</span>
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Height in pixels</span>
                  <input
                    type="number"
                    min={1}
                    value={height}
                    onChange={(event) => setHeight(Number(event.target.value))}
                    className="w-full border-2 border-edge bg-white px-2 py-1 text-[12px] text-ink"
                  />
                </label>
                <span className="text-[11px] text-ink-faint">px</span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                {format === "svg"
                  ? "A vector file carries no pixel size; it draws at whatever size the document asks for."
                  : format === "pdf"
                    ? `Page ${Math.round(base.width * PT_PER_PX)} x ${Math.round(base.height * PT_PER_PX)} pt, image at ${scale.toFixed(1)}x.`
                    : `${(scale * 96).toFixed(0)} dpi against the drawing's own size.`}
              </p>
            </Field>

            <Field label="Margin" className="p-4">
              <Segmented
                size="sm"
                options={[
                  { value: 0, label: "None" },
                  { value: 24, label: "Small" },
                  { value: 64, label: "Wide" },
                ]}
                value={padding}
                onChange={setPadding}
              />
            </Field>

            <Field label="Background" className="p-4">
              <Segmented
                size="sm"
                options={[
                  { value: "white" as const, label: "White" },
                  {
                    value: "none" as const,
                    label: "Transparent",
                    title:
                      format === "jpg" || format === "pdf"
                        ? "JPG and PDF are always written on white"
                        : "Leave the paper out of the file",
                  },
                ]}
                value={transparent ? "none" : "white"}
                onChange={(choice) => setOpaque(choice === "white")}
              />
              {(format === "jpg" || format === "pdf") && !opaque && (
                <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                  This format has no transparency, so it will be written on white.
                </p>
              )}
            </Field>

            <Field label="File name" className="p-4">
              <div className="flex items-center border-2 border-edge bg-white">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  spellCheck={false}
                  aria-label="File name"
                  className="min-w-0 flex-1 bg-transparent px-2 py-1 text-[12px] text-ink"
                />
                <span className="border-l-2 border-edge px-2 py-1 text-[12px] text-ink-faint">
                  .{format}
                </span>
              </div>
            </Field>
          </div>
        </div>

        <footer className="flex items-center gap-3 border-t-2 border-edge px-4 py-3">
          <Tick>
            {elements.length === 0
              ? "Empty sheet"
              : format === "svg"
                ? `${base.width} x ${base.height} drawing units`
                : `${width} x ${height} px`}
          </Tick>
          <SlabButton
            tone="solid"
            className="ml-auto"
            onClick={run}
            disabled={busy || elements.length === 0}
          >
            <Download size={13} />
            {busy ? "Writing…" : `Export ${format.toUpperCase()}`}
          </SlabButton>
        </footer>
      </div>
    </div>
  );
}
