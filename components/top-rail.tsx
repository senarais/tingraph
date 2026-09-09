"use client";

import { useCallback, useRef } from "react";
import { exportToBlob, exportToSvg } from "@excalidraw/excalidraw";
import { Download, ImageDown, Maximize, SlidersHorizontal } from "lucide-react";
import { INK_PRESETS, TEMPLATE_LABELS, useTingraphStore } from "@/lib/store";
import { DiagramCategory } from "@/lib/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const EXPORT_SCALE = 4;
const EXPORT_APP_STATE = {
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

function Cell({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string;
  tone?: "ink" | "alert";
}) {
  return (
    <div className="hidden min-w-0 max-w-[15rem] shrink flex-col justify-center gap-1.5 border-r border-rule px-4 md:flex">
      <span className="tick">{label}</span>
      <span
        className={`truncate text-[13px] leading-none ${
          tone === "alert" ? "text-alert" : "text-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

interface TopRailProps {
  title: string;
  category: DiagramCategory;
  /** nothing on the sheet worth exporting */
  empty: boolean;
  nodeCount: number;
  edgeCount: number;
  errorMessage: string | null;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
}

export default function TopRail({
  title,
  category,
  empty,
  nodeCount,
  edgeCount,
  errorMessage,
  apiRef,
}: TopRailProps) {
  const ink = useTingraphStore((s) => s.ink);
  const setInk = useTingraphStore((s) => s.setInk);
  const propertiesOpen = useTingraphStore((s) => s.propertiesOpen);
  const toggleProperties = useTingraphStore((s) => s.toggleProperties);
  const busyRef = useRef(false);

  const exportTargets = useCallback(() => {
    const api = apiRef.current;
    const scene = api?.getSceneElements() ?? [];
    if (!api || scene.length === 0) {
      return null;
    }
    return { elements: scene, appState: api.getAppState() };
  }, [apiRef]);

  const handleExportPng = useCallback(async () => {
    const target = exportTargets();
    if (!target || busyRef.current) {
      return;
    }
    busyRef.current = true;
    try {
      const blob = await exportToBlob({
        elements: target.elements,
        appState: { ...target.appState, ...EXPORT_APP_STATE },
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
        appState: { ...target.appState, ...EXPORT_APP_STATE },
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

  const handleFit = useCallback(() => {
    const api = apiRef.current;
    if (!api) {
      return;
    }
    api.scrollToContent(api.getSceneElements(), {
      fitToViewport: true,
      viewportZoomFactor: 0.85,
    });
  }, [apiRef]);

  return (
    <header className="flex h-14 shrink-0 items-stretch border-b border-rule bg-panel">
      <div className="flex items-center gap-2.5 border-r border-rule px-4">
        <svg viewBox="0 0 16 16" className="h-4 w-4 text-blueprint" aria-hidden="true">
          <path
            d="M1 15V1h14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M4 12l3.5-6L11 9l3-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
        <span className="font-mono text-[13px] font-medium tracking-tight text-ink">
          tingraph
        </span>
      </div>

      <Cell label="Drawing" value={title || "Untitled"} />
      <Cell label="Notation" value={TEMPLATE_LABELS[category]} />
      <Cell label="Elements" value={`${nodeCount} nodes · ${edgeCount} flows`} />
      <Cell
        label="Status"
        value={errorMessage ? "Syntax error" : "Parsed"}
        tone={errorMessage ? "alert" : "ink"}
      />

      <div className="ml-auto flex items-center gap-3 px-4">
        <div className="hidden items-center gap-1.5 border-r border-rule pr-4 sm:flex">
          <span className="tick mr-0.5">Ink</span>
          {INK_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.name}
              aria-label={`Ink: ${preset.name}`}
              aria-pressed={ink === preset.id}
              onClick={() => setInk(preset.id)}
              // the swatch shows both halves of the preset: the wash it fills
              // an org band with, ringed by the ink it draws every line in
              className={`h-4 w-4 rounded-full border-2 transition-transform ${
                ink === preset.id
                  ? "scale-110 ring-2 ring-ink ring-offset-1"
                  : "hover:scale-110"
              }`}
              style={{ backgroundColor: preset.tint, borderColor: preset.color }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={toggleProperties}
          aria-pressed={propertiesOpen}
          title="Shape properties for hand edits"
          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
            propertiesOpen
              ? "border-blueprint bg-blueprint-tint text-blueprint"
              : "border-rule bg-raised text-ink hover:border-blueprint hover:text-blueprint"
          }`}
        >
          <SlidersHorizontal size={13} />
          Style
        </button>
        <button
          type="button"
          onClick={handleFit}
          disabled={empty}
          title="Fit the drawing to the sheet"
          className="flex items-center gap-1.5 rounded-md border border-rule bg-raised px-2.5 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-blueprint hover:text-blueprint disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Maximize size={13} />
          Fit
        </button>
        <button
          type="button"
          onClick={handleExportPng}
          disabled={empty}
          className="flex items-center gap-1.5 rounded-md border border-rule bg-raised px-2.5 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-blueprint hover:text-blueprint disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ImageDown size={13} />
          PNG
        </button>
        <button
          type="button"
          onClick={handleExportSvg}
          disabled={empty}
          className="flex items-center gap-1.5 rounded-md bg-ink px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-blueprint disabled:cursor-not-allowed disabled:bg-rule-strong"
        >
          <Download size={13} />
          SVG
        </button>
      </div>
    </header>
  );
}
