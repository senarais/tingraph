"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Editor, { loader, type Monaco, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import {
  convertToExcalidrawElements,
  viewportCoordsToSceneCoords,
  CaptureUpdateAction,
} from "@excalidraw/excalidraw";
import { PanelLeftClose, PanelLeftOpen, TriangleAlert } from "lucide-react";
import { useTingraphStore, type SidePanel } from "@/lib/store";
import { parseDSL, detectCategory } from "@/lib/parser/parse-dsl";
import { bpmnShapeSize, computeLayout } from "@/lib/layout/compute-layout";
import { mapToExcalidrawElements } from "@/lib/excalidraw-mapper/map-to-elements";
import { buildShapeSkeletons } from "@/lib/excalidraw-mapper/build-skeletons";
import { PaletteItem, snippetFor, withSnippet } from "@/lib/palette";
import { DSLError, NodeType } from "@/lib/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import ExcalidrawCanvas, { MANUAL_MARK } from "@/components/excalidraw-canvas";
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
        [/^\s*(flow|bpmn)\b/, "keyword"],
        [
          /\b(msg-start|msg-end|send-task|recv-task|script-task|user-task|gw-ex|gw-para|gw-inc|start|process|task|decision|io|data|end|timer|event|pool|lane)\b/,
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

interface PipelineError {
  message: string;
  line: number;
}

interface PipelineResult {
  elements: ExcalidrawElement[];
  title: string;
  nodeCount: number;
  edgeCount: number;
  error: PipelineError | null;
}

const EMPTY: PipelineResult = {
  elements: [],
  title: "",
  nodeCount: 0,
  edgeCount: 0,
  error: null,
};

function runPipeline(code: string, accent: string): PipelineResult {
  try {
    const ast = parseDSL(code);
    const positioned = computeLayout(ast);
    const elements = mapToExcalidrawElements(positioned, accent);
    return {
      elements,
      title: ast.title,
      nodeCount: ast.nodes.length,
      edgeCount: ast.edges.length,
      error: null,
    };
  } catch (cause) {
    const error =
      cause instanceof DSLError
        ? { message: cause.message, line: cause.line }
        : {
            message: cause instanceof Error ? cause.message : String(cause),
            line: 0,
          };
    return { ...EMPTY, error };
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
  const accent = useTingraphStore((s) => s.accent);
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

  const result = useMemo(
    () => runPipeline(debouncedCode, accent),
    [debouncedCode, accent],
  );

  // the sheet keeps the last drawing that parsed, so a half-typed line does not
  // blank the canvas or the readouts
  const [drawn, setDrawn] = useState(result);
  if (!result.error && drawn !== result) {
    setDrawn(result);
  }

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
    const type = item.type as NodeType;
    const label = item.type.includes("task") || item.type === "task" ? item.label : "";
    const size = bpmnShapeSize(type, label);
    const seq = counterRef.current++;
    const drift = (seq % 6) * 22;
    const skeletons = buildShapeSkeletons(
      {
        id: `mnl-${item.type}-${seq}`,
        type,
        label,
        x: Math.round(centre.x - size.width / 2 + drift),
        y: Math.round(centre.y - size.height / 2 + drift),
        width: size.width,
        height: size.height,
        rank: 0,
      },
      accent,
    );
    const added = convertToExcalidrawElements(skeletons, {
      regenerateIds: false,
    }).map((element) => ({ ...element, customData: { ...MANUAL_MARK } }));
    api.updateScene({
      elements: [...api.getSceneElements(), ...added],
      appState: {
        selectedElementIds: Object.fromEntries(
          added.map((element) => [element.id, true]),
        ),
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

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
        elements={drawn.elements}
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
                {(["flow", "bpmn"] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      if (cat !== category) setCategory(cat);
                    }}
                    className={`rounded px-2.5 py-1 text-[12px] font-medium transition-colors ${
                      editorCategory === cat
                        ? "bg-ink text-white"
                        : "text-ink-soft hover:text-ink"
                    }`}
                  >
                    {cat === "flow" ? "Flowchart" : "BPMN 2.0"}
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

            {result.error ? (
              <div className="flex items-start gap-2 border-t border-alert/30 bg-alert-tint px-4 py-2.5 text-[12px] leading-relaxed text-alert">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                <span>
                  {result.error.line > 0 ? `Line ${result.error.line}: ` : ""}
                  {result.error.message}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 border-t border-rule px-4 py-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-blueprint" />
                <span className="text-[11px] text-ink-soft">
                  {drawn.nodeCount} nodes · {drawn.edgeCount} flows · drawn
                </span>
              </div>
            )}
          </aside>
        )}

        <main className="relative min-w-0 flex-1 bg-paper">
          <ExcalidrawCanvas
            elements={drawn.elements}
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
