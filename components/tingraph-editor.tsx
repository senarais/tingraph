"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Editor, { loader, type Monaco, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import {
  convertToExcalidrawElements,
  newElementWith,
  viewportCoordsToSceneCoords,
  CaptureUpdateAction,
} from "@excalidraw/excalidraw";
import { PanelLeftClose, PanelLeftOpen, TriangleAlert, Wand2 } from "lucide-react";
import { TEMPLATE_LABELS, useTingraphStore, type SidePanel } from "@/lib/store";
import { parseDSL, detectCategory } from "@/lib/parser/parse-dsl";
import {
  bpmnShapeSize,
  computeLayout,
  orgBoxLayout,
} from "@/lib/layout/compute-layout";
import { mapToExcalidrawElements } from "@/lib/excalidraw-mapper/map-to-elements";
import {
  buildOrgShapeSkeletons,
  buildShapeSkeletons,
} from "@/lib/excalidraw-mapper/build-skeletons";
import {
  PaletteItem,
  orgSampleNode,
  snippetFor,
  withSnippet,
} from "@/lib/palette";
import { DSLError, NodeType } from "@/lib/types";
import { unitOf } from "@/lib/canvas/units";
import { inkFor, type Ink } from "@/lib/ink";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import ExcalidrawCanvas from "@/components/excalidraw-canvas";
import CheatSheet from "@/components/cheat-sheet";
import ShapePalette from "@/components/shape-palette";
import TopRail from "@/components/top-rail";

loader.config({ monaco });

// Monaco resolves its worker from a blob URL by default, which Turbopack cannot
// map back to a module. Point it at the bundled ESM worker instead.
if (typeof window !== "undefined") {
  (window as unknown as { MonacoEnvironment?: unknown }).MonacoEnvironment = {
    getWorker: () =>
      new Worker(
        new URL("./monaco.worker.ts", import.meta.url),
        { type: "module" },
      ),
  };
}

const DSL_LANGUAGE_ID = "tingraph-dsl";
const DSL_THEME_ID = "tingraph";
let languageRegistered = false;

function registerDslLanguage(instance: Monaco): void {
  if (languageRegistered) {
    return;
  }
  languageRegistered = true;
  instance.languages.register({ id: DSL_LANGUAGE_ID });
  instance.languages.setMonarchTokensProvider(DSL_LANGUAGE_ID, {
    tokenizer: {
      root: [
        [/^\s*(flow|bpmn|org)\b/, "keyword"],
        [
          /\b(msg-start|msg-end|send-task|recv-task|script-task|user-task|gw-ex|gw-para|gw-inc|start|process|task|decision|io|data|end|timer|event|pool|lane|role|unit)\b/,
          "type",
        ],
        [/"(?:[^"\\]|\\.)*"/, "string"],
        [/-\.->|-\.+->|->|→/, "delimiter"],
        [/[{}[\]]/, "delimiter.bracket"],
        [/(#|\/\/).*$/, "comment"],
        [/[A-Za-z_$][\w$]*(?:[-.]\w+)*/, "identifier"],
      ],
    },
  });
  instance.languages.setLanguageConfiguration(DSL_LANGUAGE_ID, {
    brackets: [
      ["{", "}"],
      ["[", "]"],
    ],
    comments: { lineComment: "#" },
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: '"', close: '"' },
    ],
  });
  instance.editor.defineTheme(DSL_THEME_ID, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "1a4f6b", fontStyle: "bold" },
      { token: "type", foreground: "6b3f8f" },
      { token: "string", foreground: "2c6146" },
      { token: "comment", foreground: "9aa1a8", fontStyle: "italic" },
      { token: "delimiter", foreground: "8b929a" },
      { token: "delimiter.bracket", foreground: "8b929a" },
      { token: "identifier", foreground: "14171a" },
    ],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#14171a",
      "editorLineNumber.foreground": "#bcc2c8",
      "editorLineNumber.activeForeground": "#1a4f6b",
      "editor.lineHighlightBackground": "#f5f7f8",
      "editorCursor.foreground": "#1a4f6b",
      "editor.selectionBackground": "#dde9f0",
      "editorIndentGuide.background1": "#eceeea",
    },
  });
}

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
function readSource(code: string): Reading {
  try {
    const ast = parseDSL(code);
    computeLayout(ast);
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
function drawFromSource(code: string, ink: Ink): ExcalidrawElement[] {
  try {
    return mapToExcalidrawElements(computeLayout(parseDSL(code)), ink);
  } catch {
    return [];
  }
}

const PANELS: Array<{ id: SidePanel; label: string }> = [
  { id: "source", label: "Source" },
  { id: "shapes", label: "Shapes" },
  { id: "guide", label: "Guide" },
];

export default function TingraphEditor() {
  const code = useTingraphStore((s) => s.code);
  const setCode = useTingraphStore((s) => s.setCode);
  const category = useTingraphStore((s) => s.category);
  const setCategory = useTingraphStore((s) => s.setCategory);
  const inkId = useTingraphStore((s) => s.ink);
  const ink = inkFor(inkId);
  const panel = useTingraphStore((s) => s.panel);
  const setPanel = useTingraphStore((s) => s.setPanel);
  const sidebarOpen = useTingraphStore((s) => s.sidebarOpen);
  const toggleSidebar = useTingraphStore((s) => s.toggleSidebar);
  const propertiesOpen = useTingraphStore((s) => s.propertiesOpen);

  const [debouncedCode, setDebouncedCode] = useState(code);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const monacoRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const counterRef = useRef(1);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedCode(code), 300);
    return () => clearTimeout(handle);
  }, [code]);

  const result = useMemo(() => readSource(debouncedCode), [debouncedCode]);

  // the readouts keep the last source that parsed, so a half-typed line does
  // not blank them out
  const [drawn, setDrawn] = useState(result);
  if (!result.error && drawn !== result) {
    setDrawn(result);
  }

  // the sheet starts on the template; from here on it is the reader's
  const [seed] = useState(() => drawFromSource(code, ink));

  const detected = useMemo(() => detectCategory(debouncedCode), [debouncedCode]);
  const editorCategory = detected ?? category;

  /**
   * Writes a snippet on its own line. The caret is used when it sits inside
   * the diagram body; otherwise the snippet lands just above the closing brace
   * so the source stays parseable either way.
   */
  const insertSnippet = (item: PaletteItem) => {
    const snippet = snippetFor(item, counterRef.current++);
    const editor = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !model) {
      // shape palette open, code panel unmounted: edit the source directly
      setCode(withSnippet(code, snippet));
      return;
    }
    let closing = model.getLineCount();
    while (closing > 1 && !model.getLineContent(closing).includes("}")) {
      closing -= 1;
    }
    const caret = editor.getPosition();
    const insideBody =
      caret && caret.lineNumber > 1 && caret.lineNumber < closing;
    const line = insideBody ? caret.lineNumber : Math.max(1, closing - 1);
    const column = model.getLineMaxColumn(line);
    editor.executeEdits("tingraph-palette", [
      {
        range: new monaco.Range(line, column, line, column),
        text: snippet,
      },
    ]);
    editor.focus();
  };

  /** Drops a single shape on the sheet, untied to the source. */
  const dropOnCanvas = (item: PaletteItem) => {
    const api = apiRef.current;
    if (!api) {
      return;
    }
    const appState = api.getAppState();
    const centre = viewportCoordsToSceneCoords(
      {
        clientX: appState.offsetLeft + appState.width / 2,
        clientY: appState.offsetTop + appState.height / 2,
      },
      appState,
    );
    const seq = counterRef.current++;
    const drift = (seq % 6) * 22;
    const at = (width: number, height: number) => ({
      x: Math.round(centre.x - width / 2 + drift),
      y: Math.round(centre.y - height / 2 + drift),
      width,
      height,
      rank: 0,
    });
    let skeletons;
    if (editorCategory === "org") {
      const sample = orgSampleNode(item.type, seq);
      const box = orgBoxLayout(sample);
      skeletons = buildOrgShapeSkeletons(
        { ...sample, id: `mnl-${item.type}-${seq}`, ...at(box.width, box.height) },
        ink,
      );
    } else {
      const type = item.type as NodeType;
      const label =
        item.type.includes("task") || item.type === "task" ? item.label : "";
      const size = bpmnShapeSize(type, label);
      skeletons = buildShapeSkeletons(
        {
          id: `mnl-${item.type}-${seq}`,
          type,
          label,
          ...at(size.width, size.height),
        },
        ink,
      );
    }
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

  /**
   * Redraws the sheet from the source. This is the only moment the code
   * touches the canvas: everything after it belongs to the reader.
   */
  const generate = () => {
    const api = apiRef.current;
    const fresh = drawFromSource(code, ink);
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
  const inkRef = useRef(inkId);
  useEffect(() => {
    const previous = inkRef.current;
    inkRef.current = inkId;
    const api = apiRef.current;
    if (!api || previous === inkId) {
      return;
    }
    const was = inkFor(previous);
    const now = inkFor(inkId);
    api.updateScene({
      elements: api.getSceneElementsIncludingDeleted().map((element) => {
        // a washed piece says so on itself, because the wash can be plain
        // white — the same colour half the drawing is already filled with
        if (unitOf(element)?.wash) {
          return newElementWith(element, { backgroundColor: now.tint });
        }
        const reink = (colour: string) =>
          colour === was.color ? now.color : colour;
        return newElementWith(element, {
          strokeColor: reink(element.strokeColor),
          backgroundColor: reink(element.backgroundColor),
        });
      }),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }, [inkId]);

  const handleEditorMount: OnMount = (editor) => {
    monacoRef.current = editor;
    editor.onDidDispose(() => {
      monacoRef.current = null;
    });
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-panel">
      <TopRail
        title={drawn.title}
        category={editorCategory}
        empty={drawn.nodeCount === 0}
        nodeCount={drawn.nodeCount}
        edgeCount={drawn.edgeCount}
        errorMessage={result.error?.message ?? null}
        apiRef={apiRef}
      />

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <aside className="flex w-[368px] shrink-0 flex-col border-r border-rule bg-panel">
            <div className="flex items-center gap-2 border-b border-rule px-3 py-2.5">
              <div className="flex rounded-md border border-rule bg-raised p-0.5">
                {(["flow", "bpmn", "org"] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      if (cat !== category) setCategory(cat);
                    }}
                    className={`rounded px-2 py-1 text-[12px] font-medium transition-colors ${
                      editorCategory === cat
                        ? "bg-ink text-white"
                        : "text-ink-soft hover:text-ink"
                    }`}
                  >
                    {TEMPLATE_LABELS[cat]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Hide the source panel"
                title="Hide the source panel"
                className="ml-auto rounded p-1.5 text-ink-faint transition-colors hover:bg-rule hover:text-ink"
              >
                <PanelLeftClose size={16} />
              </button>
            </div>

            <nav className="flex gap-4 border-b border-rule px-4">
              {PANELS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setPanel(entry.id)}
                  aria-current={panel === entry.id}
                  className={`-mb-px border-b-2 py-2.5 text-[12px] font-medium transition-colors ${
                    panel === entry.id
                      ? "border-ink text-ink"
                      : "border-transparent text-ink-faint hover:text-ink-soft"
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </nav>

            {panel === "source" && (
              <div className="flex min-h-0 flex-1 flex-col bg-paper">
                <Editor
                  height="100%"
                  language={DSL_LANGUAGE_ID}
                  theme={DSL_THEME_ID}
                  value={code}
                  beforeMount={registerDslLanguage}
                  onMount={handleEditorMount}
                  onChange={(value) => setCode(value ?? "")}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
                    lineNumbers: "on",
                    lineNumbersMinChars: 3,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                    padding: { top: 12, bottom: 12 },
                    fixedOverflowWidgets: true,
                    renderLineHighlight: "line",
                    guides: { indentation: true },
                    scrollbar: { verticalScrollbarSize: 8 },
                  }}
                />
              </div>
            )}

            {panel === "shapes" && (
              <ShapePalette
                category={editorCategory}
                onInsertCode={insertSnippet}
                onDropOnCanvas={dropOnCanvas}
              />
            )}

            {panel === "guide" && <CheatSheet category={editorCategory} />}

            {result.error && (
              <div className="flex items-start gap-2 border-t border-alert/30 bg-alert-tint px-4 py-2.5 text-[12px] leading-relaxed text-alert">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                <span>
                  {result.error.line > 0 ? `Line ${result.error.line}: ` : ""}
                  {result.error.message}
                </span>
              </div>
            )}
            <div className="flex items-center gap-3 border-t border-rule px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-[11px] text-ink-soft">
                {result.error
                  ? "Source has a syntax error"
                  : `${result.nodeCount} nodes · ${result.edgeCount} flows in source`}
              </span>
              <button
                type="button"
                onClick={generate}
                disabled={!!result.error}
                title="Redraw the sheet from the source, replacing what is on it"
                className="flex shrink-0 items-center gap-1.5 rounded-md bg-ink px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-blueprint disabled:cursor-not-allowed disabled:bg-rule-strong"
              >
                <Wand2 size={13} />
                Generate
              </button>
            </div>
          </aside>
        )}

        <main className="relative min-w-0 flex-1 bg-paper">
          <ExcalidrawCanvas
            initialElements={seed}
            propertiesOpen={propertiesOpen}
            onApi={(api) => {
              apiRef.current = api;
            }}
          />
          <div className="crop-marks pointer-events-none absolute inset-2.5 z-10" />
          {!sidebarOpen && (
            <button
              type="button"
              onClick={toggleSidebar}
              className="absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-md border border-rule bg-raised px-2.5 py-1.5 text-[12px] font-medium text-ink shadow-sm transition-colors hover:border-blueprint hover:text-blueprint"
            >
              <PanelLeftOpen size={14} />
              Source
            </button>
          )}
        </main>
      </div>
    </div>
  );
}
