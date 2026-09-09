"use client";

import "@excalidraw/excalidraw/index.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { CaptureUpdateAction, Excalidraw } from "@excalidraw/excalidraw";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useTingraphStore } from "@/lib/store";
import {
  addLane,
  addPoolBelow,
  adoptArrows,
  normalizeUnits,
  poolBoxes,
  removePool,
  squareEdges,
  type PoolBox,
} from "@/lib/canvas/scene";
import type { ConnectorStyle } from "@/lib/excalidraw-mapper/build-skeletons";
import { inkFor } from "@/lib/ink";
import PoolControls, { type CanvasView } from "@/components/pool-controls";

interface ExcalidrawCanvasProps {
  /** first drawing, seeded once; afterwards the sheet is the reader's */
  initialElements: ExcalidrawElement[];
  /** the one connector this sheet draws, generated or by hand */
  connector: ConnectorStyle;
  propertiesOpen: boolean;
  onApi: (api: ExcalidrawImperativeAPI) => void;
}

const NO_VIEW: CanvasView = {
  scrollX: 0,
  scrollY: 0,
  zoom: 1,
  width: 0,
  height: 0,
};

export default function ExcalidrawCanvas({
  initialElements,
  connector,
  propertiesOpen,
  onApi,
}: ExcalidrawCanvasProps) {
  // the id is the snapshot; the pair is derived, so the store stays stable
  const inkId = useTingraphStore((s) => s.ink);
  const ink = inkFor(inkId);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [seeded] = useState(() => initialElements);
  const [pools, setPools] = useState<PoolBox[]>([]);
  const [view, setView] = useState<CanvasView>(NO_VIEW);
  const overlayRef = useRef("");
  const connectorRef = useRef(connector);
  useEffect(() => {
    connectorRef.current = connector;
  }, [connector]);

  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], state: AppState) => {
      const fix = normalizeUnits(elements, state);
      // an arrow still under the pointer is left alone until it is finished
      const drawing = state.multiElement?.id ?? state.newElement?.id ?? null;
      const adopted = adoptArrows(
        fix?.elements ?? elements,
        connectorRef.current,
        drawing,
      );
      // a bound connector is dragged out of square by its own ends; put it back
      const square = squareEdges(adopted ?? fix?.elements ?? elements, drawing);
      const next = square ?? adopted ?? fix?.elements;
      if (next || fix?.appState) {
        // deferred: this runs inside Excalidraw's own commit
        queueMicrotask(() =>
          apiRef.current?.updateScene({
            ...(next ? { elements: next } : {}),
            ...(fix?.appState ? { appState: fix.appState } : {}),
            captureUpdate: CaptureUpdateAction.NEVER,
          }),
        );
      }
      const boxes = poolBoxes(next ?? elements);
      const signature =
        boxes.map((p) => `${p.unit}@${p.x},${p.y},${p.width},${p.height}`).join("|") +
        `#${state.scrollX},${state.scrollY},${state.zoom.value},${state.width},${state.height}`;
      if (signature === overlayRef.current) {
        return;
      }
      overlayRef.current = signature;
      setPools(boxes);
      setView({
        scrollX: state.scrollX,
        scrollY: state.scrollY,
        zoom: state.zoom.value,
        width: state.width,
        height: state.height,
      });
    },
    [],
  );

  const edit = useCallback(
    (rewrite: (elements: readonly ExcalidrawElement[]) => ExcalidrawElement[]) => {
      const api = apiRef.current;
      if (!api) {
        return;
      }
      api.updateScene({
        elements: rewrite(api.getSceneElementsIncludingDeleted()),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    },
    [],
  );

  return (
    <div
      className={`relative h-full w-full ${
        propertiesOpen ? "" : "shape-actions-off"
      }`}
    >
      <Excalidraw
        name="tingraph-scene"
        excalidrawAPI={(api) => {
          apiRef.current = api;
          (window as unknown as { __excalidrawAPI?: typeof api }).__excalidrawAPI =
            api;
          onApi(api);
        }}
        onChange={handleChange}
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
          elements: seeded,
          scrollToContent: true,
          appState: {
            viewBackgroundColor: "#ffffff",
            // guides that show when a shape lines up with the ones around it
            objectsSnapModeEnabled: true,
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
            // a hand-drawn arrow starts out as the sheet's own connector
            currentItemEndArrowhead: "triangle",
            currentItemStartArrowhead: null,
            currentItemFontSize: 16,
            currentItemFontFamily: 2,
            currentItemOpacity: 100,
          },
        }}
      />
      <PoolControls
        pools={pools}
        view={view}
        onAddLane={(pool) => edit((elements) => addLane(elements, pool, ink))}
        onAddPool={(pool) =>
          edit((elements) => addPoolBelow(elements, pool, ink))
        }
        onRemove={(pool) => edit((elements) => removePool(elements, pool))}
      />
    </div>
  );
}
