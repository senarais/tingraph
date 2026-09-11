"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { X } from "lucide-react";
import { useTingraphStore, type Drawer } from "@/lib/store";
import { styleFor, type SheetStyle } from "@/lib/sheet";
import { parseDSL, detectCategory } from "@/lib/parser/parse-dsl";
import { computeLayout } from "@/lib/layout/compute-layout";
import { mapToExcalidrawElements } from "@/lib/excalidraw-mapper/map-to-elements";
import {
  buildFlowShapeSkeletons,
  buildOrgShapeSkeletons,
  buildShapeSkeletons,
  connectorStyle,
} from "@/lib/excalidraw-mapper/build-skeletons";
import {
  PALETTE_GROUPS,
  PaletteItem,
  droppedLabel,
  orgSampleNode,
  paletteShapeSize,
  snippetFor,
  withSnippet,
} from "@/lib/palette";
import { applyStyle, reink, restyle, type StylePatch } from "@/lib/canvas/restyle";
import { fontReady, styleOfFont } from "@/lib/canvas/text-metrics";
import { unitOf } from "@/lib/canvas/units";
import type { Ink } from "@/lib/ink";
import { DSLError, DiagramCategory, LayoutDirection, NodeType } from "@/lib/types";
import Canvas from "@/components/editor/canvas";
import ExportDialog from "@/components/editor/export-dialog";
import Inspector from "@/components/editor/inspector";
import Rail from "@/components/editor/rail";
import ShapeDrawer from "@/components/editor/shape-drawer";
import SourceDrawer from "@/components/editor/source-drawer";
import StyleDrawer from "@/components/editor/style-drawer";
import TopBar from "@/components/editor/top-bar";
import { Tick } from "@/components/editor/ui";

interface Reading {
  title: string;
  nodeCount: number;
  edgeCount: number;
  error: { message: string; line: number } | null;
}

/**
 * Parses and lays the source out for the readouts and the error line. Shapes
 * are only built when the reader asks for them, in `drawFromSource`.
 */
function readSource(code: string, direction: LayoutDirection): Reading {
  try {
    const ast = parseDSL(code);
    computeLayout(ast, direction);
    return {
      title: ast.title,
      nodeCount: ast.nodes.length,
      edgeCount: ast.edges.length,
      error: null,
    };
  } catch (cause) {
    return {
      title: "",
      nodeCount: 0,
      edgeCount: 0,
      error:
        cause instanceof DSLError
          ? { message: cause.message, line: cause.line }
          : {
              message: cause instanceof Error ? cause.message : String(cause),
              line: 0,
            },
    };
  }
}

/** The full run: source to finished shapes. Empty when the source will not parse. */
function drawFromSource(
  code: string,
  ink: Ink,
  direction: LayoutDirection,
  style: SheetStyle,
): ExcalidrawElement[] {
  try {
    return mapToExcalidrawElements(
      computeLayout(parseDSL(code), direction),
      ink,
      style,
    );
  } catch {
    return [];
  }
}

const DRAWER_TITLES: Record<Drawer, string> = {
  shapes: "Shapes",
  source: "Generate",
  style: "Style",
};

export default function EditorRoot() {
  const code = useTingraphStore((s) => s.code);
  const setCode = useTingraphStore((s) => s.setCode);
  const category = useTingraphStore((s) => s.category);
  const direction = useTingraphStore((s) => s.direction);
  const ink = useTingraphStore((s) => s.ink);
  const styleId = useTingraphStore((s) => s.style);
  const style = styleFor(styleId);
  const drawer = useTingraphStore((s) => s.drawer);
  const closeDrawer = useTingraphStore((s) => s.closeDrawer);
  const openDrawer = useTingraphStore((s) => s.openDrawer);
  const setSourceTab = useTingraphStore((s) => s.setSourceTab);
  const exportOpen = useTingraphStore((s) => s.exportOpen);
  const setExportOpen = useTingraphStore((s) => s.setExportOpen);

  const [debouncedCode, setDebouncedCode] = useState(code);
  const [picked, setPicked] = useState<ExcalidrawElement[]>([]);
  const [dragging, setDragging] = useState<PaletteItem | null>(null);
  const [empty, setEmpty] = useState(false);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const monacoRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const counterRef = useRef(1);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedCode(code), 300);
    return () => clearTimeout(handle);
  }, [code]);

  const result = useMemo(
    () => readSource(debouncedCode, direction),
    [debouncedCode, direction],
  );

  // the readouts keep the last source that parsed, so a half-typed line does
  // not blank them out
  const [drawn, setDrawn] = useState(result);
  if (!result.error && drawn !== result) {
    setDrawn(result);
  }

  // the sheet starts on the template; from here on it is the reader's
  const [seed] = useState(() => drawFromSource(code, ink, direction, style));

  const detected = useMemo(() => detectCategory(debouncedCode), [debouncedCode]);
  const editorCategory: DiagramCategory = detected ?? category;

  /** Every change to the sheet goes through here, so undo always has a step. */
  const edit = (
    rewrite: (elements: readonly ExcalidrawElement[]) => ExcalidrawElement[],
  ) => {
    if (!api) {
      return;
    }
    api.updateScene({
      elements: rewrite(api.getSceneElementsIncludingDeleted()),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  /**
   * Writes a snippet on its own line. The caret is used when it sits inside
   * the diagram body; otherwise the snippet lands just above the closing brace
   * so the source stays parseable either way.
   */
  const insertSnippet = (item: PaletteItem) => {
    const snippet = snippetFor(item, counterRef.current++);
    const editor = monacoRef.current;
    const model = editor?.getModel();
    openDrawer("source");
    setSourceTab("code");
    if (!editor || !model) {
      // the source drawer is shut, so the code is edited without an editor
      setCode(withSnippet(code, snippet));
      return;
    }
    let closing = model.getLineCount();
    while (closing > 1 && !model.getLineContent(closing).includes("}")) {
      closing -= 1;
    }
    const caret = editor.getPosition();
    const insideBody = caret && caret.lineNumber > 1 && caret.lineNumber < closing;
    const line = insideBody ? caret.lineNumber : Math.max(1, closing - 1);
    const column = model.getLineMaxColumn(line);
    editor.executeEdits("tingraph-palette", [
      { range: new monaco.Range(line, column, line, column), text: snippet },
    ]);
    editor.focus();
  };

  /** Drops a single shape on the sheet, untied to the source. */
  const placeShape = (type: string, at: { x: number; y: number }) => {
    if (!api) {
      return;
    }
    const item = PALETTE_GROUPS[editorCategory]
      .flatMap((group) => group.items)
      .find((entry) => entry.type === type);
    if (!item) {
      return;
    }
    const seq = counterRef.current++;
    const size = paletteShapeSize(item, editorCategory);
    const box = {
      id: `mnl-${item.type}-${seq}`,
      x: Math.round(at.x - size.width / 2),
      y: Math.round(at.y - size.height / 2),
      ...size,
      rank: 0,
    };

    const skeletons =
      editorCategory === "org"
        ? buildOrgShapeSkeletons(
            { ...orgSampleNode(item.type, seq), ...box },
            ink,
            style,
          )
        : editorCategory === "flow"
          ? buildFlowShapeSkeletons(
              { ...box, type: item.type as NodeType, label: item.label },
              ink,
              style,
            )
          : buildShapeSkeletons(
              { ...box, type: item.type as NodeType, label: droppedLabel(item) },
              ink,
              style,
            );

    const added = convertToExcalidrawElements(skeletons, { regenerateIds: true });
    const unit = added.map(unitOf).find(Boolean)?.unit;
    api.updateScene({
      elements: [...api.getSceneElements(), ...added],
      appState: {
        selectedElementIds: Object.fromEntries(
          added.map((element) => [element.id, true as const]),
        ),
        selectedGroupIds: unit ? { [unit]: true } : {},
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  /** The middle of the sheet, for a shape that was clicked rather than dragged. */
  const centre = () => {
    if (!api) {
      return { x: 0, y: 0 };
    }
    const state = api.getAppState();
    return viewportCoordsToSceneCoords(
      {
        clientX: state.offsetLeft + state.width / 2,
        clientY: state.offsetTop + state.height / 2,
      },
      state,
    );
  };

  /**
   * Redraws the sheet from the source. This is the only moment the code
   * touches the canvas: everything after it belongs to the reader.
   */
  const generate = () => {
    const fresh = drawFromSource(code, ink, direction, style);
    if (!api || fresh.length === 0) {
      return;
    }
    api.updateScene({
      elements: fresh,
      appState: {
        selectedElementIds: {},
        selectedGroupIds: {},
        editingGroupId: null,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    api.scrollToContent(api.getSceneElements(), {
      fitToViewport: true,
      viewportZoomFactor: 0.85,
    });
  };

  // ink is a sheet-wide restyle, so it reaches the drawing without a redraw
  const inkRef = useRef(ink);
  useEffect(() => {
    const was = inkRef.current;
    inkRef.current = ink;
    if (was.color === ink.color && was.tint === ink.tint) {
      return;
    }
    edit((elements) => reink(elements, was, ink));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, ink]);

  // and so is the drawing style: the font, the line and the free corners. The
  // face has to be in the browser before a caption can be measured against it,
  // so this one waits.
  const styleRef = useRef(styleId);
  useEffect(() => {
    if (styleRef.current === styleId || !api) {
      return;
    }
    styleRef.current = styleId;
    const next = styleFor(styleId);
    const sample = api
      .getSceneElements()
      .map((element) => (element.type === "text" ? element.text : ""))
      .join("");
    let alive = true;
    fontReady(next, sample).then(() => {
      if (alive) {
        edit((elements) => restyle(elements, next));
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, styleId]);

  /**
   * One change from the properties panel. A change of face waits for that face
   * to be in the browser, because the caption is measured against it.
   */
  const restyleSelection = async (
    patch: StylePatch,
    was?: { strokeColor?: string },
  ) => {
    const ids = new Set(picked.map((element) => element.id));
    if (patch.fontFamily !== undefined || patch.fontSize !== undefined) {
      await fontReady(
        styleOfFont(patch.fontFamily ?? style.fontFamily),
        picked.map((element) => (element.type === "text" ? element.text : "")).join(""),
      );
    }
    edit((elements) => applyStyle(elements, ids, patch, was));
  };

  const handleEditorMount: OnMount = (editor) => {
    monacoRef.current = editor;
    editor.onDidDispose(() => {
      monacoRef.current = null;
    });
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bone font-mono">
      <TopBar
        title={drawn.title}
        category={editorCategory}
        nodeCount={drawn.nodeCount}
        edgeCount={drawn.edgeCount}
        errorMessage={result.error?.message ?? null}
        empty={empty}
      />

      <div className="flex min-h-0 flex-1">
        <Rail category={editorCategory} />

        {drawer && (
          <aside className="flex w-[352px] shrink-0 flex-col border-r-2 border-edge bg-bone">
            <header className="flex items-center gap-2 border-b-2 border-edge px-3 py-2.5">
              <Tick>{DRAWER_TITLES[drawer]}</Tick>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Close the panel"
                title="Close the panel"
                className="ml-auto border-2 border-transparent p-0.5 text-ink-faint transition-colors hover:border-edge hover:bg-white hover:text-ink"
              >
                <X size={14} />
              </button>
            </header>

            {drawer === "shapes" && (
              <ShapeDrawer
                category={editorCategory}
                onPlace={(item) => placeShape(item.type, centre())}
                onWrite={insertSnippet}
                onDrag={setDragging}
              />
            )}
            {drawer === "source" && (
              <SourceDrawer
                category={editorCategory}
                nodeCount={result.nodeCount}
                edgeCount={result.edgeCount}
                error={result.error}
                onGenerate={generate}
                onEditorMount={handleEditorMount}
              />
            )}
            {drawer === "style" && <StyleDrawer category={editorCategory} />}
          </aside>
        )}

        <main className="relative min-w-0 flex-1 bg-paper">
          <Canvas
            initialElements={seed}
            category={editorCategory}
            dragging={dragging}
            connectorStyle={connectorStyle(ink, editorCategory, style)}
            rules={{ category: editorCategory, direction }}
            onApi={setApi}
            onSelection={setPicked}
            onDropShape={(type, clientX, clientY) => {
              if (api) {
                placeShape(
                  type,
                  viewportCoordsToSceneCoords({ clientX, clientY }, api.getAppState()),
                );
              }
            }}
            onPoolEdit={edit}
            onEmptyChange={setEmpty}
          />
          <div className="crop-marks pointer-events-none absolute inset-2.5 z-10" />
          <Inspector
            picked={picked}
            category={editorCategory}
            onPatch={restyleSelection}
          />
        </main>
      </div>

      {exportOpen && (
        <ExportDialog
          api={api}
          title={drawn.title}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}
