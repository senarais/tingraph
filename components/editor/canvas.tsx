"use client";

import "@excalidraw/excalidraw/index.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { CaptureUpdateAction, Excalidraw } from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useTingraphStore, type CanvasTool } from "@/lib/store";
import { styleFor } from "@/lib/sheet";
import {
  addLane,
  addPoolBelow,
  figuresOn,
  normalizeUnits,
  poolBoxes,
  removeLane,
  removePool,
  reunit,
  syncFigures,
  syncConnectors,
  type FigureOnSheet,
  type PoolBox,
} from "@/lib/canvas/scene";
import { elementsOn, linksOn, type ElementOnSheet, type LinkOnSheet } from "@/lib/canvas/elements";
import {
  addColumn,
  frameBoxes,
  partitionFrames,
  removeColumn,
  removeFrame,
  renameFrame,
  type FrameBox,
} from "@/lib/canvas/frames";
import { portsOf, syncTables } from "@/lib/canvas/erd";
import { held, selection } from "@/lib/canvas/inspect";
import { unitOf } from "@/lib/canvas/units";
import type { Rules } from "@/lib/canvas/connect";
import type { ConnectorStyle } from "@/lib/excalidraw-mapper/build-skeletons";
import { SHAPE_DRAG_TYPE, paletteShapeSize, type PaletteItem } from "@/lib/palette";
import { DiagramCategory, DSLNode, isSettable } from "@/lib/types";
import ElementControls from "@/components/editor/element-controls";
import FigureControls from "@/components/editor/figure-controls";
import ConnectLayer from "@/components/editor/connect-layer";
import type { FigureSpec } from "@/lib/figures/spec";
import ShapeGhost from "@/components/editor/shape-ghost";
import PoolControls, { type CanvasView } from "@/components/editor/pool-controls";
import CanvasTools from "@/components/editor/canvas-tools";

interface CanvasProps {
  /** first drawing, seeded once; afterwards the sheet is the reader's */
  initialElements: ExcalidrawElement[];
  initialFiles: BinaryFiles;
  category: DiagramCategory;
  /** the shape being dragged in from the palette, drawn under the pointer */
  dragging: PaletteItem | null;
  /** the sheet's own line: colour, weight and roughness */
  connectorStyle: ConnectorStyle;
  /** which notation the sheet is in, and which way it grows */
  rules: Rules;
  onApi: (api: ExcalidrawImperativeAPI) => void;
  onSelection: (picked: ExcalidrawElement[]) => void;
  /** a shape card let go over the sheet, in viewport coordinates */
  onDropShape: (type: string, clientX: number, clientY: number) => void;
  /** one rewrite of the whole sheet, with a step in the history */
  onEdit: (
    rewrite: (elements: readonly ExcalidrawElement[]) => ExcalidrawElement[],
  ) => void;
  /** everything the settable notations put in their panel, read off the sheet */
  onParts: (parts: SheetParts) => void;
  /** one element drawn again from its spec, keeping hold of what was picked */
  onElementChange: (unit: string, spec: DSLNode) => void;
  /** whether there is anything left to fit or to export */
  onEmptyChange: (empty: boolean) => void;
  /** the figure the settings panel is looking at, or null when there is none */
  onFigure: (figure: FigureOnSheet | null) => void;
  /** the figure on the sheet right now, and the way to write it back */
  figure: FigureOnSheet | null;
  onFigureChange: (spec: FigureSpec, settled: boolean) => void;
  /** the part of that figure the reader has hold of */
  part: string | null;
  onPart: (id: string | null) => void;
}

/** What a settable notation's panel and handles are looking at. */
export interface SheetParts {
  elements: ElementOnSheet[];
  links: LinkOnSheet[];
  frames: FrameBox[];
  /** the element the reader has hold of, when exactly one is held */
  held: string | null;
}

export const NO_PARTS: SheetParts = {
  elements: [],
  links: [],
  frames: [],
  held: null,
};

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
  "freedraw",
  "eraser",
]);

export default function Canvas({
  initialElements,
  initialFiles,
  category,
  dragging,
  connectorStyle,
  rules,
  onApi,
  onSelection,
  onDropShape,
  onEdit,
  onParts,
  onElementChange,
  onEmptyChange,
  onFigure,
  figure,
  onFigureChange,
  part,
  onPart,
}: CanvasProps) {
  const ink = useTingraphStore((s) => s.ink);
  const tool = useTingraphStore((s) => s.tool);
  const setTool = useTingraphStore((s) => s.setTool);
  const holding = useTingraphStore((s) => s.connector);
  const sheet = styleFor(useTingraphStore((s) => s.style));
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [seeded] = useState(() => initialElements);
  const [seededFiles] = useState(() => initialFiles);
  const [pools, setPools] = useState<PoolBox[]>([]);
  const [empty, setEmpty] = useState(false);
  const [view, setView] = useState<CanvasView>(NO_VIEW);
  const [line, setLine] = useState<ExcalidrawElement | null>(null);
  const [parts, setParts] = useState<SheetParts>(NO_PARTS);
  /** whether the figure on the sheet is the thing currently picked */
  const [chartHeld, setChartHeld] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef("");
  const pickedRef = useRef("");
  const toolRef = useRef<CanvasTool>(tool);
  const lineRef = useRef("");
  const chartRef = useRef("");
  const partsRef = useRef("");
  /** the size of the sheet last fitted against, so it is fitted again when it changes */
  const roomRef = useRef("");
  const rulesRef = useRef(rules);
  useEffect(() => {
    rulesRef.current = rules;
  }, [rules]);

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

  // Excalidraw binds redo to Ctrl+Shift+Z everywhere but only binds Ctrl+Y on
  // Windows, so the other half of the shortcut is added here.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (typing || event.shiftKey || event.altKey) {
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        history("redo");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [history]);

  /**
   * The whole drawing, sized to the room it has. This is the Fit button, and
   * it is also what the sheet does to itself when that room changes — the two
   * must stay one function, or a panel opening would frame the sheet
   * differently from the button beside it.
   */
  const fit = useCallback(() => {
    const api = apiRef.current;
    const elements = api?.getSceneElements();
    if (api && elements && elements.length > 0) {
      api.scrollToContent(elements, {
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
      // a connector the reader has hold of is left alone until the pointer is
      // up: one being dragged by its box, one being resized with its shapes
      const busy = held(state);
      const erd = rulesRef.current.category === "erd";
      const base = fix?.elements ?? elements;
      // a table is exactly its band plus its rows, so one that was stretched
      // is cut again before anything is routed against it
      const tables = erd ? syncTables(base, ink, sheet, busy) : null;
      const cut = syncConnectors(
        tables ?? base,
        rulesRef.current,
        busy,
        erd ? portsOf(tables ?? base) : undefined,
      );
      // a chart the reader has stretched is drawn again at the size they
      // dragged it to, rather than left as scaled shapes
      const drawn = syncFigures(cut ?? tables ?? base, ink, sheet, busy);
      const next = drawn ?? cut ?? tables ?? fix?.elements;
      // Excalidraw offers its own point editor for any line it is shown, and
      // its handles fight the routing; a Tingraph connector carries its own
      // handles instead, so the editor is put away the moment it opens
      const scene = next ?? elements;
      const editing =
        state.editingLinearElement?.elementId ?? state.selectedLinearElement?.elementId;
      const routed = scene.some(
        (element) => element.id === editing && unitOf(element)?.link,
      );
      // a figure's captions are cut from its spec, so Excalidraw's own caption
      // editor would write into a mark the next redraw throws away; the figure
      // is renamed through its own handles instead
      const caption = state.editingTextElement;
      const drawnCaption =
        caption &&
        scene.some(
          (element) => element.id === caption.id && unitOf(element)?.kind === "figure",
        );
      const patch = {
        ...(fix?.appState ?? {}),
        ...(routed ? { editingLinearElement: null, selectedLinearElement: null } : {}),
        ...(drawnCaption ? { editingTextElement: null } : {}),
      };
      if (next || Object.keys(patch).length > 0) {
        // deferred: this runs inside Excalidraw's own commit
        queueMicrotask(() =>
          apiRef.current?.updateScene({
            ...(next ? { elements: next } : {}),
            ...(Object.keys(patch).length > 0 ? { appState: patch as never } : {}),
            captureUpdate: CaptureUpdateAction.NEVER,
          }),
        );
      }

      // --- what the properties panel is looking at
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

      // --- the one connector the handles are drawn on, when just one is picked
      const lines = picked.filter(
        (element) => element.type === "arrow" && unitOf(element)?.link,
      );
      const alone =
        lines.length === 1 &&
        picked.every((element) => element.type === "arrow" || element.type === "text")
          ? lines[0]
          : null;
      const mark = alone ? `${alone.id}.${alone.version}` : "";
      if (mark !== lineRef.current) {
        lineRef.current = mark;
        setLine(alone);
      }

      // --- the figure the settings panel works on: the one picked, or the one
      // on the sheet when there is only one
      const sheetCharts = figuresOn(scene);
      const chosen = new Set(
        picked.map((element) => unitOf(element)?.unit).filter(Boolean),
      );
      const current =
        sheetCharts.find((entry) => chosen.has(entry.unit)) ??
        (sheetCharts.length === 1 ? sheetCharts[0] : null);
      const mine = current !== null && chosen.has(current.unit);
      const stamp = current
        ? `${mine}|${current.unit}|${Math.round(current.box.x)},${Math.round(current.box.y)},${Math.round(current.box.width)},${Math.round(current.box.height)}|${JSON.stringify(current.spec)}`
        : "";
      if (stamp !== chartRef.current) {
        chartRef.current = stamp;
        setChartHeld(mine);
        onFigure(current);
      }

      // --- what a settable notation's panel and handles are looking at: the
      // elements that carry a spec, the connectors between them, and the
      // frames drawn round them, all read straight off the sheet
      if (isSettable(rulesRef.current.category)) {
        const mine = elementsOn(scene);
        const heldUnits = new Set(
          picked.map((element) => unitOf(element)?.unit).filter(Boolean),
        );
        const next: SheetParts = {
          elements: mine,
          links: linksOn(scene),
          frames:
            rulesRef.current.category === "activity"
              ? partitionFrames(scene)
              : frameBoxes(scene),
          held:
            heldUnits.size === 1
              ? (mine.find((entry) => heldUnits.has(entry.unit))?.unit ?? null)
              : null,
        };
        const stamp = JSON.stringify(next.elements.map((e) => [e.unit, e.spec, e.box]))
          + JSON.stringify(next.links)
          + JSON.stringify(next.frames)
          + next.held;
        if (stamp !== partsRef.current) {
          partsRef.current = stamp;
          setParts(next);
          onParts(next);
        }
      } else if (partsRef.current !== "") {
        partsRef.current = "";
        setParts(NO_PARTS);
        onParts(NO_PARTS);
      }

      // --- the canvas can put a tool back itself, so the rail follows it
      const active = state.activeTool.type;
      if (!RAIL_TOOLS.has(active)) {
        // a keyboard shortcut for a tool the rail does not carry: Tingraph
        // draws its shapes from the notation, so the pointer comes back
        queueMicrotask(() => apiRef.current?.setActiveTool({ type: "selection" }));
      } else if (active !== toolRef.current) {
        toolRef.current = active as CanvasTool;
        setTool(active as CanvasTool);
      }

      const blank = scene.every((element) => element.isDeleted);
      setEmpty(blank);
      onEmptyChange(blank);

      // --- the sheet fits itself whenever the room it is drawn in changes
      // size: on the first paint, and every time a panel slides out beside it
      // or is put away. The size is read from Excalidraw's own appState rather
      // than from the DOM, so by the time this runs the canvas has already
      // resized itself — measuring the wrapper would race its resize observer.
      // Deferred a frame for the same reason the scene patch above is.
      const room = `${state.width}x${state.height}`;
      if (state.width > 0 && room !== roomRef.current) {
        roomRef.current = room;
        requestAnimationFrame(fit);
      }

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
    [ink, sheet, fit, onFigure, onParts, onEmptyChange, onSelection, setTool],
  );

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full"
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(SHAPE_DRAG_TYPE)) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        // moved through the DOM rather than through state: a dragover fires
        // many times a second, and the sheet must not re-render for each one
        const ghost = ghostRef.current;
        const box = wrapRef.current?.getBoundingClientRect();
        if (ghost && box) {
          ghost.style.transform = `translate(${event.clientX - box.left}px, ${
            event.clientY - box.top
          }px)`;
          ghost.style.opacity = "1";
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
        excalidrawAPI={(handle) => {
          apiRef.current = handle;
          (window as unknown as { __excalidrawAPI?: typeof handle }).__excalidrawAPI =
            handle;
          setApi(handle);
          onApi(handle);
        }}
        // a copy is its own element, never a second piece of the original
        onDuplicate={reunit}
        onChange={handleChange}
        // the whole page is the editor: a shortcut has to work after pressing a
        // swatch in the properties panel, not only when the sheet has focus.
        // Excalidraw ignores a key pressed inside an input, a textarea or a
        // caption editor, so nothing here can swallow typing.
        handleKeyboardGlobally
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
          files: seededFiles,
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
      <FigureControls
        api={api}
        figure={chartHeld ? figure : null}
        view={view}
        picked={part}
        onPick={onPart}
        onChange={onFigureChange}
      />
      <ConnectLayer
        api={api}
        holding={holding}
        rules={rules}
        style={connectorStyle}
        view={view}
        picked={line}
      />
      <ElementControls
        category={category}
        elements={parts.elements}
        frames={parts.frames}
        held={parts.held}
        picked={part}
        onPick={onPart}
        view={view}
        onChange={onElementChange}
        onRenameFrame={(unit, label) =>
          onEdit((elements) => renameFrame(elements, unit, label))
        }
        onRemoveFrame={(frame) => onEdit((elements) => removeFrame(elements, frame))}
        onAddLane={(frame) =>
          onEdit((elements) => addColumn(elements, frame, ink, sheet))
        }
        onRemoveLane={(frame) => onEdit((elements) => removeColumn(elements, frame))}
      />
      {dragging && (
        <div
          ref={ghostRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 z-30 opacity-0"
        >
          <div className="-translate-x-1/2 -translate-y-1/2 opacity-70">
            <ShapeGhost
              type={dragging.type}
              category={category}
              width={paletteShapeSize(dragging, category).width * view.zoom}
              height={paletteShapeSize(dragging, category).height * view.zoom}
              ink={ink.color}
            />
          </div>
        </div>
      )}
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
        onAddLane={(pool) => onEdit((elements) => addLane(elements, pool, ink))}
        onRemoveLane={(pool) => onEdit((elements) => removeLane(elements, pool))}
        onAddPool={(pool) =>
          onEdit((elements) => addPoolBelow(elements, pool, ink))
        }
        onRemove={(pool) => onEdit((elements) => removePool(elements, pool))}
      />
    </div>
  );
}
