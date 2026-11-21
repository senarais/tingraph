"use client";

import "@excalidraw/excalidraw/index.css";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { CaptureUpdateAction, Excalidraw, restore } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Download, Eye, PencilLine } from "lucide-react";
import CanvasTools from "@/components/editor/canvas-tools";
import ExportDialog from "@/components/editor/export-dialog";
import { Cell, HomeMark } from "@/components/editor/top-bar";
import { Tick } from "@/components/editor/ui";
import { registerTextFaces, useTextFacesReady } from "@/lib/canvas/text-faces";
import type { Json } from "@/lib/json";

registerTextFaces();

/**
 * A shared diagram, read-only: Excalidraw's own view mode, which pans and
 * zooms but selects and changes nothing, under a bar that says what it is.
 * Nothing on this page writes anywhere — there is no Save — and an edit link
 * opened before signing in says how to get the editor instead.
 */
export default function SharedView({
  token,
  title,
  scene,
  editable,
}: {
  token: string;
  title: string;
  scene: Json;
  /** the link allows editing once the reader signs in */
  editable: boolean;
}) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [zoom, setZoom] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);
  const [seed] = useState(() => {
    try {
      const restored = restore(scene as unknown as Parameters<typeof restore>[0], null, null);
      return { elements: restored.elements, files: restored.files, broken: false };
    } catch {
      return { elements: [], files: {}, broken: true };
    }
  });
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  // bold and italic captions are drawn in their own faces, so the sheet waits for them
  const facesReady = useTextFacesReady(seed.elements);

  const fit = useCallback(() => {
    const current = apiRef.current;
    const elements = current?.getSceneElements();
    if (current && elements && elements.length > 0) {
      current.scrollToContent(elements, { fitToViewport: true, viewportZoomFactor: 0.85 });
    }
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const current = apiRef.current;
    if (!current) return;
    const state = current.getAppState();
    const from = state.zoom.value;
    const to = Math.min(30, Math.max(0.1, from * factor));
    current.updateScene({
      appState: {
        zoom: { value: to as never },
        scrollX: state.width / 2 / to - state.width / 2 / from + state.scrollX,
        scrollY: state.height / 2 / to - state.height / 2 / from + state.scrollY,
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, []);

  const signIn = `/login?next=${encodeURIComponent(`/shared/${token}`)}`;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bone font-mono">
      <header className="flex h-14 shrink-0 items-stretch border-b-2 border-edge bg-bone">
        <HomeMark />
        <Cell label="Shared diagram">{title}</Cell>
        <Cell label="Access">
          <span className="flex items-center gap-1.5">
            <Eye size={13} aria-hidden="true" />
            View only
          </span>
        </Cell>
        <div className="ml-auto flex items-center gap-2 px-2 sm:gap-3 sm:px-4">
          {editable && (
            <Link
              href={signIn}
              className="slab-tight press flex h-10 items-center gap-2 bg-white px-2 text-[12.5px] font-semibold text-ink sm:px-3"
            >
              <PencilLine size={14} aria-hidden="true" />
              <span>Sign in to edit</span>
            </Link>
          )}
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            disabled={seed.elements.length === 0}
            className="slab-tight press flex h-10 items-center gap-2 bg-edge px-2 text-[12.5px] font-semibold text-bone disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none sm:px-4"
          >
            <Download size={14} />
            <span className="hidden min-[370px]:inline">Export</span>
          </button>
        </div>
      </header>
      <main className="relative min-h-0 flex-1 bg-paper">
        {!facesReady ? null : seed.broken ? (
          <div className="flex h-full items-center justify-center p-6">
            <p className="slab-tight max-w-sm bg-white p-5 text-center text-[13px] text-ink">
              This shared diagram is damaged and could not be drawn.
            </p>
          </div>
        ) : (
          <>
            <Excalidraw
              name="tingraph-shared"
              viewModeEnabled
              excalidrawAPI={(handle) => {
                apiRef.current = handle;
                setApi(handle);
              }}
              onChange={(_, state) => setZoom(state.zoom.value)}
              UIOptions={{
                canvasActions: {
                  export: false,
                  saveToActiveFile: false,
                  loadScene: false,
                  toggleTheme: false,
                  saveAsImage: false,
                  clearCanvas: false,
                },
              }}
              initialData={{
                elements: seed.elements,
                files: seed.files,
                scrollToContent: true,
                appState: { viewBackgroundColor: "#ffffff" },
              }}
            />
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
              <Tick className="slab-tight bg-white px-2 py-1">Read-only · drag to pan, scroll to zoom</Tick>
            </div>
            <CanvasTools zoom={zoom} onZoom={zoomBy} onFit={fit} disabled={seed.elements.length === 0} />
          </>
        )}
      </main>
      {exportOpen && <ExportDialog api={api} title={title} onClose={() => setExportOpen(false)} />}
    </div>
  );
}
