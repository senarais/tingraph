"use client";

import "@excalidraw/excalidraw/index.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { CaptureUpdateAction, Excalidraw } from "@excalidraw/excalidraw";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useTingraphStore, type CanvasTool } from "@/lib/store";
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
import { selection } from "@/lib/canvas/inspect";
import type { ConnectorStyle } from "@/lib/excalidraw-mapper/build-skeletons";
import { SHAPE_DRAG_TYPE } from "@/lib/palette";
import PoolControls, { type CanvasView } from "@/components/editor/pool-controls";
import CanvasTools from "@/components/editor/canvas-tools";

interface CanvasProps {
  /** first drawing, seeded once; afterwards the sheet is the reader's */
  initialElements: ExcalidrawElement[];
  /** the one connector this sheet draws, generated or by hand */
  connector: ConnectorStyle;
  onApi: (api: ExcalidrawImperativeAPI) => void;
  onSelection: (picked: ExcalidrawElement[]) => void;
  /** a shape card let go over the sheet, in viewport coordinates */
  onDropShape: (type: string, clientX: number, clientY: number) => void;
  onPoolEdit: (
    rewrite: (elements: readonly ExcalidrawElement[]) => ExcalidrawElement[],
  ) => void;
  /** whether there is anything left to fit or to export */
  onEmptyChange: (empty: boolean) => void;
}

const NO_VIEW: CanvasView = {
  scrollX: 0,
  scrollY: 0,
  zoom: 1,
  width: 0,
  height: 0,
};

/** Excalidraw tools the rail drives; anything else reads back as the pointer. */
const RAIL_TOOLS = new Set<string>([
  "selection",
  "hand",
  "text",
  "image",
  "arrow",
  "freedraw",
  "eraser",
]);

export default function Canvas({
  initialElements,
  connector,
  onApi,
  onSelection,
  onDropShape,
  onPoolEdit,
  onEmptyChange,
}: CanvasProps) {
  const ink = useTingraphStore((s) => s.ink);
  const tool = useTingraphStore((s) => s.tool);
  const setTool = useTingraphStore((s) => s.setTool);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [seeded] = useState(() => initialElements);
  const [pools, setPools] = useState<PoolBox[]>([]);
  const [empty, setEmpty] = useState(false);
  const [view, setView] = useState<CanvasView>(NO_VIEW);
  const wrapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef("");
  const pickedRef = useRef("");
  const toolRef = useRef<CanvasTool>(tool);
  const connectorRef = useRef(connector);
  useEffect(() => {
    connectorRef.current = connector;
  }, [connector]);

  /**
   * Zoom about the middle of the sheet. Excalidraw scales around the canvas
   * origin, so the scroll has to move by the same amount the centre would.
   */
  const zoomBy = useCallback((factor: number) => {
    const api = apiRef.current;
    if (!api) {
      return;
    }
    const state = api.getAppState();
    const from = state.zoom.value;
    const to = Math.min(30, Math.max(0.1, from * factor));
    api.updateScene({
      appState: {
        zoom: { value: to as never },
        scrollX: state.width / 2 / to - state.width / 2 / from + state.scrollX,
        scrollY: state.height / 2 / to - state.height / 2 / from + state.scrollY,
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, []);

  /**
   * Undo and redo. Excalidraw keeps its history behind its own keyboard
   * handler rather than the imperative API, so the button presses the key the
   * reader would have pressed, on the canvas that owns the history.
   */
  const history = useCallback((direction: "undo" | "redo") => {
    wrapRef.current?.querySelector(".excalidraw")?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        code: "KeyZ",
        ctrlKey: true,
        metaKey: true,
        shiftKey: direction === "redo",
        bubbles: true,
        cancelable: true,
      }),
    );
  }, []);

  const fit = useCallback(() => {
    const api = apiRef.current;
    if (api) {
      api.scrollToContent(api.getSceneElements(), {
        fitToViewport: true,
        viewportZoomFactor: 0.85,
      });
    }
  }, []);

  // the rail is the only place a tool is chosen, so it drives the canvas
  useEffect(() => {
    if (toolRef.current === tool) {
      return;
    }
    toolRef.current = tool;
    apiRef.current?.setActiveTool(
      tool === "image" ? { type: "image" } : { type: tool },
    );
  }, [tool]);

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

      // --- what the properties panel is looking at
      const scene = next ?? elements;
      const picked = selection(
        scene,
        fix?.appState?.selectedElementIds ?? state.selectedElementIds,
      );
      const signature = picked
        .map((element) => `${element.id}.${element.version}`)
        .join("|");
      if (signature !== pickedRef.current) {
        pickedRef.current = signature;
        onSelection(picked);
      }

      // --- the canvas can put a tool back itself, so the rail follows it
      const active = state.activeTool.type;
      const railed = (RAIL_TOOLS.has(active) ? active : "selection") as CanvasTool;
      if (railed !== toolRef.current) {
        toolRef.current = railed;
        setTool(railed);
      }

      const blank = scene.every((element) => element.isDeleted);
      setEmpty(blank);
      onEmptyChange(blank);

      const boxes = poolBoxes(scene);
      const overlay =
        boxes.map((p) => `${p.unit}@${p.x},${p.y},${p.width},${p.height}`).join("|") +
        `#${state.scrollX},${state.scrollY},${state.zoom.value},${state.width},${state.height}`;
      if (overlay === overlayRef.current) {
        return;
      }
      overlayRef.current = overlay;
      setPools(boxes);
      setView({
        scrollX: state.scrollX,
        scrollY: state.scrollY,
        zoom: state.zoom.value,
        width: state.width,
        height: state.height,
      });
    },
    [onEmptyChange, onSelection, setTool],
  );

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(SHAPE_DRAG_TYPE)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(event) => {
        const type = event.dataTransfer.getData(SHAPE_DRAG_TYPE);
        if (!type) {
          return;
        }
        event.preventDefault();
        onDropShape(type, event.clientX, event.clientY);
      }}
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
      <CanvasTools
        zoom={view.zoom}
        onZoom={zoomBy}
        onFit={fit}
        onHistory={history}
        disabled={empty}
      />
      <PoolControls
        pools={pools}
        view={view}
        onAddLane={(pool) => onPoolEdit((elements) => addLane(elements, pool, ink))}
        onAddPool={(pool) =>
          onPoolEdit((elements) => addPoolBelow(elements, pool, ink))
        }
        onRemove={(pool) => onPoolEdit((elements) => removePool(elements, pool))}
      />
    </div>
  );
}
