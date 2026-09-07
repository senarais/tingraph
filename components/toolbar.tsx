"use client";

import { useCallback, useRef } from "react";
import {
  exportToBlob,
  exportToSvg,
} from "@excalidraw/excalidraw";
import { Download, ImageDown, Palette } from "lucide-react";
import { ACCENT_PRESETS, useTingraphStore } from "@/lib/store";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const EXPORT_SCALE = 4;
const APP_STATE = {
  viewBackgroundColor: "#ffffff",
  exportBackground: true,
  exportWithDarkMode: false,
} as const;

function slugify(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "tingraph"
  );
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

interface ToolbarProps {
  elements: ExcalidrawElement[];
  title: string;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
}

export default function Toolbar({ elements, title, apiRef }: ToolbarProps) {
  const accent = useTingraphStore((s) => s.accent);
  const setAccent = useTingraphStore((s) => s.setAccent);
  const busyRef = useRef(false);

  const exportTargets = useCallback(() => {
    const api = apiRef.current;
    if (!api || elements.length === 0) {
      return null;
    }
    return { elements: api.getSceneElements(), appState: api.getAppState() };
  }, [apiRef, elements]);

  const handleExportPng = useCallback(async () => {
    const target = exportTargets();
    if (!target || busyRef.current) {
      return;
    }
    busyRef.current = true;
    try {
      const blob = await exportToBlob({
        elements: target.elements,
        appState: { ...target.appState, ...APP_STATE },
        files: null,
        mimeType: "image/png",
        getDimensions: (width: number, height: number) => ({
          width: width * EXPORT_SCALE,
          height: height * EXPORT_SCALE,
          scale: EXPORT_SCALE,
        }),
      });
      download(blob, `${slugify(title)}.png`);
    } finally {
      busyRef.current = false;
    }
  }, [exportTargets, title]);

  const handleExportSvg = useCallback(async () => {
    const target = exportTargets();
    if (!target || busyRef.current) {
      return;
    }
    busyRef.current = true;
    try {
      const svg = await exportToSvg({
        elements: target.elements,
        appState: { ...target.appState, ...APP_STATE },
        files: null,
      });
      const blob = new Blob([svg.outerHTML], {
        type: "image/svg+xml;charset=utf-8",
      });
      download(blob, `${slugify(title)}.svg`);
    } finally {
      busyRef.current = false;
    }
  }, [exportTargets, title]);

  return (
    <div className="flex flex-col gap-2 border-b border-zinc-200 bg-white px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Palette size={14} className="text-zinc-400" />
        {ACCENT_PRESETS.map((preset) => (
          <button
            key={preset.color}
            type="button"
            title={preset.name}
            aria-label={`Accent: ${preset.name}`}
            onClick={() => setAccent(preset.color)}
            className={`h-4 w-4 rounded-full border transition-transform ${
              accent === preset.color
                ? "scale-125 border-zinc-900"
                : "border-zinc-300 hover:scale-110"
            }`}
            style={{ backgroundColor: preset.color }}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleExportPng}
          disabled={elements.length === 0}
          className="flex items-center justify-center gap-1.5 rounded bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          <ImageDown size={14} />
          PNG
        </button>
        <button
          type="button"
          onClick={handleExportSvg}
          disabled={elements.length === 0}
          className="flex items-center justify-center gap-1.5 rounded border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download size={14} />
          SVG
        </button>
      </div>
    </div>
  );
}
