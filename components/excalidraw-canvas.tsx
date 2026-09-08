"use client";

import "@excalidraw/excalidraw/index.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { CaptureUpdateAction, Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

/** Shapes the reader dropped by hand survive every re-generation of the code. */
export const MANUAL_MARK = { tingraph: "manual" } as const;

export function isManual(element: ExcalidrawElement): boolean {
  return (
    (element.customData as { tingraph?: string } | undefined)?.tingraph ===
    "manual"
  );
}

interface ExcalidrawCanvasProps {
  elements: ExcalidrawElement[];
  propertiesOpen: boolean;
  onApi: (api: ExcalidrawImperativeAPI) => void;
}

export default function ExcalidrawCanvas({
  elements,
  propertiesOpen,
  onApi,
}: ExcalidrawCanvasProps) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const elementsRef = useRef<ExcalidrawElement[]>(elements);
  const [initialElements] = useState(() => elements);
  const fitted = useRef(false);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  const sync = useCallback(() => {
    const api = apiRef.current;
    const next = elementsRef.current;
    if (!api || next.length === 0) {
      return;
    }
    const handDrawn = api.getSceneElements().filter(isManual);
    api.updateScene({
      elements: [...next, ...handDrawn],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    if (!fitted.current) {
      // fit once on load; afterwards the reader owns the viewport
      fitted.current = true;
      api.scrollToContent(api.getSceneElements(), {
        fitToViewport: true,
        viewportZoomFactor: 0.85,
      });
    }
  }, []);

  useEffect(() => {
    sync();
  }, [elements, sync]);

  return (
    <div className="h-full w-full">
      <Excalidraw
        name="tingraph-scene"
        excalidrawAPI={(api) => {
          apiRef.current = api;
          (window as unknown as { __excalidrawAPI?: typeof api }).__excalidrawAPI =
            api;
          onApi(api);
        }}
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
        objectsSnapModeEnabled
        zenModeEnabled={!propertiesOpen}
        initialData={{
          // seeded here as well so the first paint never races the API handshake
          elements: initialElements,
          scrollToContent: true,
          appState: {
            viewBackgroundColor: "#ffffff",
            // formal defaults: sharp lines, sans-serif, near-black stroke —
            // distinguishes Tingraph output from default Excalidraw style
            currentItemStrokeColor: "#1e1e1e",
            currentItemBackgroundColor: "transparent",
            currentItemFillStyle: "solid",
            currentItemStrokeWidth: 2,
            currentItemStrokeStyle: "solid",
            currentItemRoughness: 0,
            currentItemRoundness: "sharp",
            currentItemArrowType: "sharp",
            currentItemFontSize: 16,
            currentItemFontFamily: 2,
            currentItemOpacity: 100,
          },
        }}
      />
    </div>
  );
}
