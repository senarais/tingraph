"use client";

import "@excalidraw/excalidraw/index.css";

import { useCallback, useEffect, useRef } from "react";
import {
  CaptureUpdateAction,
  Excalidraw,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

interface ExcalidrawCanvasProps {
  elements: ExcalidrawElement[];
  onApi: (api: ExcalidrawImperativeAPI) => void;
}

export default function ExcalidrawCanvas({
  elements,
  onApi,
}: ExcalidrawCanvasProps) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const elementsRef = useRef<ExcalidrawElement[]>(elements);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  const sync = useCallback(() => {
    const api = apiRef.current;
    const next = elementsRef.current;
    if (!api || next.length === 0) {
      return;
    }
    api.updateScene({
      elements: next,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    api.scrollToContent();
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
          onApi(api);
          sync();
        }}
        UIOptions={{
          canvasActions: {
            export: false,
            saveToActiveFile: false,
            loadScene: false,
            toggleTheme: false,
          },
        }}
        gridModeEnabled
        objectsSnapModeEnabled
        initialData={{
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
