"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import {
  CaptureUpdateAction,
  restore,
  serializeAsJSON,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElement, FileId } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { TriangleAlert, X } from "lucide-react";
import AccessDialog from "@/components/account/access-dialog";
import { useTingraphStore, type Drawer } from "@/lib/store";
import { TEMPLATES } from "@/lib/templates";
import { styleFor, type SheetStyle } from "@/lib/sheet";
import { parseDSL, detectCategory } from "@/lib/parser/parse-dsl";
import { computeLayout } from "@/lib/layout/compute-layout";
import { generationConflict, oversize } from "@/lib/canvas/generation";
import { mapToExcalidrawElements } from "@/lib/excalidraw-mapper/map-to-elements";
import { connectorStyle } from "@/lib/excalidraw-mapper/build-skeletons";
import { PaletteItem, snippetFor, withSnippet } from "@/lib/palette";
import { paletteShape } from "@/lib/canvas/place";
import { applyStyle, reink, restyle, type StylePatch } from "@/lib/canvas/restyle";
import {
  addLane,
  newConnector,
  addPoolBelow,
  newFigure,
  redrawFigure,
  labelLink,
  removeLane,
  removePool,
  removeUnits,
  renamePoolPart,
  writeLink,
  type FigureOnSheet,
} from "@/lib/canvas/scene";
import { elementOn, redrawElement } from "@/lib/canvas/elements";
import {
  addBoundary,
  addColumn,
  removeColumn,
  removeFrame,
  renameFrame,
} from "@/lib/canvas/frames";
import { figureDef } from "@/lib/figures/registry";
import type { FigureSpec } from "@/lib/figures/spec";
import FigureDrawer from "@/components/editor/figure-drawer";
import ElementDrawer, { elementPanel } from "@/components/editor/element-drawer";
import { fontReady, styleOfFont } from "@/lib/canvas/text-metrics";
import { unitOf } from "@/lib/canvas/units";
import { summarise } from "@/lib/summary";
import type { Ink } from "@/lib/ink";
import { DSLError, DiagramCategory, DSLNode, LayoutDirection } from "@/lib/types";
import AiDrawer from "@/components/editor/ai-drawer";
import Canvas, { NO_PARTS, type SheetParts } from "@/components/editor/canvas";
import ExportDialog from "@/components/editor/export-dialog";
import ShareDialog from "@/components/editor/share-dialog";
import Inspector from "@/components/editor/inspector";
import Rail from "@/components/editor/rail";
import ShapeDrawer from "@/components/editor/shape-drawer";
import SourceDrawer from "@/components/editor/source-drawer";
import StartDialog, { type StartChoice } from "@/components/editor/start-dialog";
import ConfirmDialog from "@/components/editor/confirm-dialog";
import StyleDrawer from "@/components/editor/style-drawer";
import TopBar from "@/components/editor/top-bar";
import { Tick } from "@/components/editor/ui";
import { apiFetch, getSession } from "@/lib/api/client";
import { useSheetSave } from "@/components/editor/use-sheet-save";
import type { Json } from "@/lib/json";
import {
  diagramTitle,
  type OpenedDiagram,
  type SavedDiagramDocument,
  withSceneFiles,
} from "@/lib/saved-diagrams";

interface Reading {
  title: string;
  nodeCount: number;
  edgeCount: number;
  /** what the drawing is made of, said the way its own notation says it */
  summary: string;
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
      summary: summarise(ast),
      error: null,
    };
  } catch (cause) {
    return {
      title: "",
      nodeCount: 0,
      edgeCount: 0,
      summary: "—",
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

interface InitialScene {
  elements: ExcalidrawElement[];
  files: BinaryFiles;
  error?: string;
}

function openScene(
  diagram: OpenedDiagram | undefined,
  fallback: () => ExcalidrawElement[],
): InitialScene {
  if (!diagram) {
    return { elements: fallback(), files: {} };
  }
  try {
    const scene = restore(
      diagram.document.scene as unknown as Parameters<typeof restore>[0],
      null,
      null,
    );
    return { elements: scene.elements, files: scene.files };
  } catch {
    return {
      elements: [],
      files: {},
      error: "This saved scene is damaged and could not be opened.",
    };
  }
}

const DRAWER_TITLES: Record<Drawer, string> = {
  shapes: "Shapes",
  figure: "Figure",
  elements: "Elements",
  source: "Generate",
  style: "Style",
  ai: "Tingraph AI",
  // Studio's alone; the editor's rail never offers it
  table: "Table",
};

export default function EditorRoot({
  initialDiagram,
  start = false,
}: {
  initialDiagram?: OpenedDiagram;
  /** opened from the catalogue: the start dialog is shown over the sheet */
  start?: boolean;
}) {
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
  const [shareOpen, setShareOpen] = useState(false);
  const [dragging, setDragging] = useState<PaletteItem | null>(null);
  const [empty, setEmpty] = useState(false);
  const [figure, setFigure] = useState<FigureOnSheet | null>(null);
  /** the part of that figure the reader has hold of, for the ones with parts */
  const [part, setPart] = useState<string | null>(null);
  /** everything a settable notation's panel is looking at, read off the sheet */
  const [parts, setParts] = useState<SheetParts>(NO_PARTS);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationMessage, setGenerationMessage] = useState("");
  /**
   * The source a failed Generate was about. The failure is shown while that is
   * still the source, and goes once the reader has changed it.
   */
  const [failedSource, setFailedSource] = useState<string | null>(null);
  /**
   * A failed Generate the open panel would not show: the source drawer only
   * reports a failure about the source it holds, and the other panels that
   * generate report none, so it is said over the sheet instead.
   */
  const [notice, setNotice] = useState<{ message: string; premium: boolean } | null>(null);
  /** a large diagram waiting on the reader's say-so before it is drawn */
  const [pendingLarge, setPendingLarge] = useState<{
    source: string;
    replaceSource: boolean;
    reasons: string[];
  } | null>(null);
  const [imageMessage, setImageMessage] = useState("");
  const [accountGate, setAccountGate] = useState<{
    title: string;
    message: string;
    next: string;
  } | null>(null);
  const [starting, setStarting] = useState(start);
  const monacoRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const counterRef = useRef(1);
  const generatingRef = useRef(false);

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
  const [seed] = useState(() =>
    openScene(initialDiagram, () => drawFromSource(code, ink, direction, style)),
  );

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
    const added = paletteShape(editorCategory, type, at, counterRef.current++, ink, style);
    if (!added) {
      return;
    }
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

  /**
   * One setting, one reading, one anything: the chart is drawn again from it.
   * A change still under the hand is not written to the history, so a drag
   * across a dozen readings comes back in one undo rather than a dozen.
   */
  const changeFigure = (spec: FigureSpec, settled = true) => {
    if (!figure || !api) {
      return;
    }
    const box = {
      x: figure.box.x,
      y: figure.box.y,
      width: spec.options.width,
      height: spec.options.height,
    };
    // every mark is replaced, so anything that was picked is picked again by
    // name rather than by the element it used to be
    const wasHeld = picked.some((element) => unitOf(element)?.unit === figure.unit);
    const next = redrawFigure(
      api.getSceneElementsIncludingDeleted(),
      figure.unit,
      spec,
      box,
      ink,
      style,
    );
    api.updateScene({
      elements: next,
      ...(wasHeld
        ? {
            appState: {
              selectedElementIds: Object.fromEntries(
                next
                  .filter((element) => unitOf(element)?.unit === figure.unit)
                  .map((element) => [element.id, true as const]),
              ),
              selectedGroupIds: { [figure.unit]: true },
            },
          }
        : {}),
      // a change still under the hand is left out of the history until the
      // hand comes off: `NEVER` would make it the baseline instead, and the
      // whole drag would then be unundoable
      captureUpdate: settled
        ? CaptureUpdateAction.IMMEDIATELY
        : CaptureUpdateAction.EVENTUALLY,
    });
  };

  /** Everything on the sheet that belongs to one element, picked as one. */
  const selectUnit = (unit: string, elements?: readonly ExcalidrawElement[]) => {
    if (!api) {
      return;
    }
    const scene = elements ?? api.getSceneElements();
    const mine = scene.filter((element) => unitOf(element)?.unit === unit);
    if (mine.length === 0) {
      return;
    }
    api.updateScene({
      ...(elements ? { elements: elements as ExcalidrawElement[] } : {}),
      appState: {
        selectedElementIds: Object.fromEntries(
          mine.map((element) => [element.id, true as const]),
        ),
        selectedGroupIds: { [unit]: true },
        editingGroupId: null,
      },
      captureUpdate: elements
        ? CaptureUpdateAction.IMMEDIATELY
        : CaptureUpdateAction.NEVER,
    });
  };

  /**
   * One element rewritten and drawn again from its spec — a column added, a
   * step turned into an object node. The same call serves the panel and the
   * handles on the sheet, which is what keeps the two in step; the element is
   * picked again afterwards by name, or the handles would vanish mid-edit.
   */
  const changeElement = (unit: string, spec: DSLNode) => {
    if (!api) {
      return;
    }
    const scene = api.getSceneElementsIncludingDeleted();
    const entry = elementOn(scene, unit);
    if (!entry) {
      return;
    }
    const next = redrawElement(
      scene,
      unit,
      spec,
      { x: entry.box.x, y: entry.box.y, width: entry.box.width },
      editorCategory,
      ink,
      style,
    );
    selectUnit(unit, next);
  };

  /** Image bytes live in Excalidraw's file map; the element spec keeps only their id. */
  const changeElementImage = async (unit: string, file: File) => {
    if (!api) return;
    setImageMessage("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 4_000_000) {
      setImageMessage("Choose a PNG, JPEG or WebP image under 4 MB.");
      return;
    }
    try {
      const dataURL = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new window.Image();
        image.onload = () => image.naturalWidth && image.naturalHeight
          ? resolve({ width: image.naturalWidth, height: image.naturalHeight })
          : reject(new Error("Invalid image"));
        image.onerror = () => reject(new Error("Invalid image"));
        image.src = dataURL;
      });
      const entry = elementOn(api.getSceneElements(), unit);
      if (!entry || entry.spec.type === "zone") return;
      const id = `arch-${crypto.randomUUID()}`;
      api.addFiles([{ id: id as FileId, dataURL: dataURL as BinaryFileData["dataURL"], mimeType: file.type as BinaryFileData["mimeType"], created: Date.now() }]);
      changeElement(unit, { ...entry.spec, image: { fileId: id, ...dimensions } });
    } catch {
      setImageMessage("Image could not be opened. Choose another file.");
    }
  };

  const connectElements = (from: string, to: string) => {
    if (from === to) return;
    edit((elements) => newConnector(elements, {
      line: "data-flow", from: { unit: from }, to: { unit: to },
    }, { category: editorCategory, direction }, connectorStyle(ink, editorCategory, style)) ?? elements.slice());
  };

  /** A figure on a sheet that has none yet, in the notation that was chosen. */
  const addFigure = () => {
    const def = figureDef(editorCategory);
    if (!def) {
      return;
    }
    edit((elements) => newFigure(elements, def.blank(), centre(), ink, style));
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

  const requireAccount = async (title: string, message: string) => {
    const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const session = await getSession().catch(() => null);
    if (!session?.user) {
      setAccountGate({ title, message, next });
      return null;
    }
    return session.user;
  };

  /**
   * Redraws the sheet from the source after taking one server-side allowance.
   * This is the only moment the code touches the canvas: everything after it
   * belongs to the reader.
   */
  const generate = async (
    source: string = code,
    replaceSource = false,
    confirmed = false,
  ) => {
    if (generatingRef.current) {
      return;
    }
    const fail = (message: string, premium = false) => {
      setFailedSource(source);
      setGenerationMessage(message);
      const shown = useTingraphStore.getState().drawer === "source" && source === code;
      setNotice(shown ? null : { message, premium });
    };
    let ast;
    try {
      ast = parseDSL(source);
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : String(cause));
      return;
    }
    // a large diagram is drawn only once the reader has said so; nothing is
    // checked against the allowance until then
    const reasons = oversize(source, ast.nodes.length, ast.edges.length);
    if (reasons.length > 0 && !confirmed) {
      setPendingLarge({ source, replaceSource, reasons });
      return;
    }
    const fresh = drawFromSource(source, ink, direction, style);
    if (!api || fresh.length === 0) {
      fail("The diagram could not be drawn. Check the source and try again.");
      return;
    }
    const conflict = generationConflict(fresh);
    if (conflict) {
      fail(conflict);
      return;
    }

    generatingRef.current = true;
    setGenerating(true);
    setFailedSource(null);
    setGenerationMessage("");
    setNotice(null);
    try {
      const account = await requireAccount(
        "Sign up to generate diagrams",
        "Generation needs an account. The Free plan includes 10 generations per day; Premium generation is unlimited.",
      );
      if (!account) return;

      const response = await apiFetch("/api/v1/usage/generations", { method: "POST" }).catch(
        () => null,
      );
      if (!response?.ok) {
        fail("Generation allowance could not be checked. Try again.");
        return;
      }
      const data = (await response.json()) as {
        allowed: boolean;
        used: number;
        usage_limit: number | null;
        reset_at?: string | null;
      };
      if (!data.allowed) {
        const reset = data.reset_at
          ? ` It resets ${new Date(data.reset_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`
          : "";
        fail(
          `Generation limit reached: ${data.used} of ${data.usage_limit ?? 10} used in this 24-hour window.${reset} Nothing was drawn; your sheet is unchanged. Premium generation is unlimited.`,
          true,
        );
        return;
      }

      if (replaceSource) {
        setCode(source);
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
      api.scrollToContent(fresh, {
        fitToViewport: true,
        viewportZoomFactor: 0.85,
      });
      setGenerationMessage(
        data.usage_limit === null
          ? "Generated. Premium generation is unlimited."
          : `${data.used} of ${data.usage_limit} generations used today.`,
      );
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  };

  const openAi = async () => {
    const account = await requireAccount(
      "Sign up to use Tingraph AI",
      "Tingraph AI needs an account. The Free plan includes 2,000 output tokens per day; Premium includes 100,000.",
    );
    if (account) {
      openDrawer("ai");
    }
  };

  /**
   * The start dialog is put away for good: the address loses its `start`, so
   * a reload or a shared link opens on the canvas rather than asking again.
   */
  const finishStart = () => {
    setStarting(false);
    const url = new URL(window.location.href);
    if (url.searchParams.has("start")) {
      url.searchParams.delete("start");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  };

  const chooseStart = (choice: StartChoice) => {
    finishStart();
    if (choice === "ai") {
      void openAi();
      return;
    }
    // set rather than toggled: whichever panel was out, this is the one now
    useTingraphStore.setState({
      drawer: "source",
      sourceTab: choice === "guide" ? "guide" : "code",
    });
  };

  const { savedId, saveState, saveMessage, autoSave, save, toggleAutoSave } = useSheetSave({
    api,
    initialId: initialDiagram?.shared ? null : (initialDiagram?.id ?? null),
    initialRevision: initialDiagram?.revision ?? null,
    shared: initialDiagram?.shared ?? null,
    // the source and the settings are saved beside the sheet
    extra: () => {
      const state = useTingraphStore.getState();
      return [state.code, state.direction, state.style, state.ink.color, state.ink.tint].join("|");
    },
    build: () => {
      const scene = withSceneFiles(
        JSON.parse(
          serializeAsJSON(api!.getSceneElements(), {}, api!.getFiles(), "database"),
        ) as Json,
        api!.getFiles() as unknown as Json,
      );
      const document = {
        version: 1,
        category: editorCategory,
        source: code,
        direction,
        ink,
        style: styleId,
        scene,
      } satisfies SavedDiagramDocument;
      return {
        title: diagramTitle(drawn.title, initialDiagram?.title),
        category: editorCategory,
        document: document as unknown as Json,
      };
    },
    locate: (url, id) => {
      url.searchParams.set("type", editorCategory);
      url.searchParams.set("diagram", id);
    },
    requireAccount,
    noun: "diagram",
    onSaved: (id) => useTingraphStore.setState({ saved: id }),
  });

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
    if (
      patch.fontFamily !== undefined ||
      patch.fontSize !== undefined ||
      patch.bold !== undefined ||
      patch.italic !== undefined
    ) {
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

  if (seed.error) {
    return (
      <div className="flex h-dvh items-center justify-center bg-bone px-4 font-mono">
        <div className="slab max-w-md bg-white p-6 text-center">
          <p className="text-[14px] text-alert">{seed.error}</p>
          <Link
            href="/editor?view=mine"
            className="slab-tight press mt-5 inline-block bg-edge px-3 py-2 text-[12px] font-semibold text-bone"
          >
            Back to My diagrams
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bone font-mono">
      <TopBar
        title={drawn.title}
        category={editorCategory}
        summary={drawn.summary}
        errorMessage={result.error?.message ?? null}
        empty={empty}
        saveState={saveState}
        saveMessage={saveMessage}
        onSave={() => void save()}
        autoSave={autoSave}
        onAutoSave={() => void toggleAutoSave()}
        // only the owner shares; someone editing through a link has no Share
        onShare={initialDiagram?.shared ? undefined : () => setShareOpen(true)}
        shared={!!initialDiagram?.shared}
      />

      <div className="relative flex min-h-0 flex-1 flex-col sm:flex-row">
        <Rail category={editorCategory} onOpenAi={() => void openAi()} />

        {drawer && drawer !== "table" && (
          <aside className="absolute inset-x-0 bottom-14 top-0 z-30 flex min-h-0 flex-col bg-bone sm:static sm:w-[352px] sm:shrink-0 sm:border-r-2 sm:border-edge">
            <header className="flex items-center gap-2 border-b-2 border-edge px-3 py-2.5">
              <Tick>
                {drawer === "figure"
                  ? (figureDef(editorCategory)?.label ?? DRAWER_TITLES.figure)
                  : drawer === "elements"
                    ? (elementPanel(editorCategory)?.label ?? DRAWER_TITLES.elements)
                    : DRAWER_TITLES[drawer]}
              </Tick>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Close the panel"
                title="Close the panel"
                className="ml-auto grid h-10 w-10 place-items-center border-2 border-transparent text-ink-faint transition-colors hover:border-edge hover:bg-white hover:text-ink"
              >
                <X size={14} />
              </button>
            </header>

            {drawer === "figure" && (
              <FigureDrawer
                category={editorCategory}
                figure={figure}
                onChange={changeFigure}
                onAdd={addFigure}
                picked={part}
                onPick={setPart}
              />
            )}
            {drawer === "elements" && (
              <ElementDrawer
                category={editorCategory}
                elements={parts.elements}
                links={parts.links}
                frames={parts.frames}
                pools={parts.pools}
                onSelect={selectUnit}
                held={parts.held}
                onChange={changeElement}
                onImage={(unit, file) => void changeElementImage(unit, file)}
                imageMessage={imageMessage}
                onTemplate={(source) => void generate(source, true)}
                generating={generating}
                onConnect={connectElements}
                onAdd={(type) => placeShape(type, centre())}
                onRemove={(unit) => edit((elements) => removeUnits(elements, [unit]))}
                onLink={(id, patch) =>
                  edit((elements) => writeLink(elements, id, patch, editorCategory))
                }
                onLabelLink={(id, label) =>
                  edit((elements) =>
                    labelLink(elements, id, label, ink, style, editorCategory),
                  )
                }
                onRemoveLink={(id) => {
                  const mark = api
                    ?.getSceneElements()
                    .find((element) => element.id === id);
                  const unit = mark ? unitOf(mark)?.unit : null;
                  if (unit) {
                    edit((elements) => removeUnits(elements, [unit]));
                  }
                }}
                onFrame={(unit, patch) =>
                  edit((elements) => renameFrame(elements, unit, patch.label ?? ""))
                }
                onAddFrame={() =>
                  edit((elements) => addBoundary(elements, centre(), ink, style))
                }
                onRemoveFrame={(unit) => {
                  const frame = parts.frames.find((entry) => entry.unit === unit);
                  if (frame) {
                    edit((elements) => removeFrame(elements, frame));
                  }
                }}
                onAddLane={(frame) =>
                  edit((elements) => addColumn(elements, frame, ink, style))
                }
                onRemoveLane={(frame) =>
                  edit((elements) => removeColumn(elements, frame))
                }
                onRenameLane={(unit, label) =>
                  edit((elements) => renameFrame(elements, unit, label))
                }
                onRenamePoolPart={(unit, label) =>
                  edit((elements) => renamePoolPart(elements, unit, label))
                }
                onAddPool={(pool) =>
                  edit((elements) => addPoolBelow(elements, pool, ink, style))
                }
                onRemovePool={(pool) => edit((elements) => removePool(elements, pool))}
                onAddPoolLane={(pool) =>
                  edit((elements) => addLane(elements, pool, ink, style))
                }
                onRemovePoolLane={(pool) =>
                  edit((elements) => removeLane(elements, pool))
                }
              />
            )}
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
                summary={result.summary}
                error={result.error}
                onGenerate={() => void generate()}
                onReset={() => void generate(TEMPLATES[editorCategory], true)}
                onTemplate={(source) => void generate(source, true)}
                generating={generating}
                // a failure about a source the reader has since changed is old news
                generationMessage={
                  failedSource !== null && failedSource !== code ? "" : generationMessage
                }
                generationFailed={failedSource !== null && failedSource === code}
                large={oversize(code, drawn.nodeCount, drawn.edgeCount)}
                onOpenAi={() => void openAi()}
                onEditorMount={handleEditorMount}
              />
            )}
            {drawer === "ai" && (
              <AiDrawer
                category={editorCategory}
                // a failure is said over the sheet, so only success is said here
                generationMessage={failedSource === null ? generationMessage : ""}
                onGenerate={(source) => void generate(source, true)}
              />
            )}
            {drawer === "style" && <StyleDrawer category={editorCategory} />}
          </aside>
        )}

        <main className="relative min-h-0 min-w-0 flex-1 bg-paper">
          <Canvas
            initialElements={seed.elements}
            initialFiles={seed.files}
            category={editorCategory}
            onElementImage={(unit, file) => void changeElementImage(unit, file)}
            imageMessage={imageMessage}
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
            onEdit={edit}
            onParts={setParts}
            onElementChange={changeElement}
            onEmptyChange={setEmpty}
            onFigure={setFigure}
            figure={figure}
            onFigureChange={changeFigure}
            part={part}
            onPart={setPart}
          />
          <div className="crop-marks pointer-events-none absolute inset-2.5 z-10" />
          <Inspector
            picked={picked}
            category={editorCategory}
            onPatch={restyleSelection}
          />
        </main>
      </div>

      {notice && (
        <div
          role="alert"
          className="fixed inset-x-0 top-3 z-[60] mx-auto flex w-fit max-w-[min(560px,calc(100vw-32px))] items-start gap-2 border-2 border-edge bg-alert-tint px-3 py-2.5 text-[12px] leading-relaxed text-alert shadow-[4px_4px_0_#000]"
        >
          <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            {notice.message}
            {notice.premium && (
              <>
                {" "}
                <Link href="/checkout" prefetch={false} target="_blank" className="font-semibold underline">
                  Go Premium
                </Link>
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
            className="shrink-0 text-alert hover:text-ink"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      {shareOpen && (
      <ShareDialog
        open
        diagramId={savedId}
        noun="diagram"
        onSave={() => void save()}
        onClose={() => setShareOpen(false)}
      />
      )}
      {exportOpen && (
        <ExportDialog
          api={api}
          title={drawn.title}
          onClose={() => setExportOpen(false)}
        />
      )}
      <ConfirmDialog
        open={pendingLarge !== null}
        kicker="Large diagram"
        title="Generate a diagram this big?"
        confirmLabel="Generate anyway"
        cancelLabel="Keep editing"
        onCancel={() => setPendingLarge(null)}
        onConfirm={() => {
          const pending = pendingLarge;
          setPendingLarge(null);
          if (pending) {
            void generate(pending.source, pending.replaceSource, true);
          }
        }}
      >
        <p>This source has</p>
        <ul className="mt-2 space-y-1 border-l-2 border-edge pl-3 text-ink">
          {pendingLarge?.reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
        <p className="mt-3">
          It may take a while to lay out, and reads small once it is fitted to the
          screen. Splitting it into a few smaller diagrams usually reads better.
          Nothing is drawn, and no generation is used, until you go on.
        </p>
      </ConfirmDialog>
      <StartDialog
        open={starting}
        category={editorCategory}
        onChoose={chooseStart}
        onClose={finishStart}
      />
      <AccessDialog
        open={accountGate !== null}
        title={accountGate?.title ?? "Account required"}
        message={accountGate?.message ?? "Sign in to continue."}
        next={accountGate?.next ?? "/editor"}
        onClose={() => setAccountGate(null)}
      />
    </div>
  );
}
