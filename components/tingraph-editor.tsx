"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Editor, { loader, type Monaco, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { PanelLeftClose, PanelLeftOpen, TriangleAlert } from "lucide-react";
import { useTingraphStore } from "@/lib/store";
import { parseDSL, detectCategory } from "@/lib/parser/parse-dsl";
import { computeLayout } from "@/lib/layout/compute-layout";
import { mapToExcalidrawElements } from "@/lib/excalidraw-mapper/map-to-elements";
import { DSLError } from "@/lib/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import ExcalidrawCanvas from "@/components/excalidraw-canvas";
import CheatSheet from "@/components/cheat-sheet";
import Toolbar from "@/components/toolbar";

loader.config({ monaco });

const DSL_LANGUAGE_ID = "tingraph-dsl";
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
}

interface PipelineError {
  message: string;
  line: number;
}

interface PipelineResult {
  elements: ExcalidrawElement[];
  title: string;
  error: PipelineError | null;
}

function runPipeline(code: string, accent: string): PipelineResult {
  try {
    const ast = parseDSL(code);
    const positioned = computeLayout(ast);
    const elements = mapToExcalidrawElements(positioned, accent);
    return { elements, title: ast.title, error: null };
  } catch (cause) {
    if (cause instanceof DSLError) {
      return {
        elements: [],
        title: "",
        error: { message: cause.message, line: cause.line },
      };
    }
    return {
      elements: [],
      title: "",
      error: {
        message: cause instanceof Error ? cause.message : String(cause),
        line: 0,
      },
    };
  }
}

interface PaletteEntry {
  type: string;
  label: string;
}

const PALETTE: Record<string, PaletteEntry[]> = {
  flow: [
    { type: "start", label: "Start" },
    { type: "process", label: "Process" },
    { type: "decision", label: "Decision" },
    { type: "io", label: "I/O" },
    { type: "end", label: "End" },
  ],
  bpmn: [
    { type: "start", label: "Start" },
    { type: "msg-start", label: "Msg start" },
    { type: "timer", label: "Timer" },
    { type: "task", label: "Task" },
    { type: "send-task", label: "Send task" },
    { type: "recv-task", label: "Recv task" },
    { type: "script-task", label: "Script" },
    { type: "user-task", label: "User" },
    { type: "gw-ex", label: "X" },
    { type: "gw-para", label: "+" },
    { type: "gw-inc", label: "O" },
    { type: "data", label: "Data" },
    { type: "end", label: "End" },
    { type: "msg-end", label: "Msg end" },
  ],
};

const PALETTE_STRUCTURE: Record<"flow" | "bpmn", PaletteEntry[]> = {
  flow: [],
  bpmn: [
    { type: "pool", label: "Pool" },
    { type: "lane", label: "Lane" },
  ],
};

function nodePrefix(type: string): string {
  if (type.startsWith("msg-")) return "M";
  if (type.startsWith("send-") || type.startsWith("script-")) return "S";
  if (type.startsWith("recv-")) return "R";
  if (type.startsWith("user-")) return "U";
  if (type === "gw-ex") return "G";
  if (type === "gw-para") return "G";
  if (type === "gw-inc") return "G";
  if (type === "data") return "D";
  if (type === "process") return "P";
  if (type === "decision") return "D";
  if (type === "io") return "I";
  return type.slice(0, 1).toUpperCase();
}

function nodeSnippet(type: string, n: number): string {
  return `\n  ${type} ${nodePrefix(type)}${n} "${type}"`;
}

function poolSnippet(n: number): string {
  return `\np  P${n} "Pool ${n}" {\n    lane L${n} "Lane ${n}" {\n      start S${n} "Start"\n    }\n  }\n`;
}

function laneSnippet(n: number): string {
  return `\n  lane L${n} "Lane ${n}" {\n    start S${n} "Start"\n  }\n`;
}

export default function TingraphEditor() {
  const code = useTingraphStore((s) => s.code);
  const setCode = useTingraphStore((s) => s.setCode);
  const category = useTingraphStore((s) => s.category);
  const setCategory = useTingraphStore((s) => s.setCategory);
  const accent = useTingraphStore((s) => s.accent);
  const cheatSheetOpen = useTingraphStore((s) => s.cheatSheetOpen);
  const toggleCheatSheet = useTingraphStore((s) => s.toggleCheatSheet);
  const sidebarOpen = useTingraphStore((s) => s.sidebarOpen);
  const toggleSidebar = useTingraphStore((s) => s.toggleSidebar);

  const [debouncedCode, setDebouncedCode] = useState(code);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const monacoRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const idCounterRef = useRef(1);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedCode(code), 300);
    return () => clearTimeout(handle);
  }, [code]);

  const result = useMemo(
    () => runPipeline(debouncedCode, accent),
    [debouncedCode, accent],
  );

  const detected = useMemo(() => detectCategory(debouncedCode), [debouncedCode]);
  const editorCategory = detected ?? category;

  const insertText = (text: string) => {
    const editor = monacoRef.current;
    if (!editor) return;
    const pos = editor.getPosition();
    if (!pos) return;
    editor.executeEdits("tingraph-palette", [
      {
        range: new monaco.Range(
          pos.lineNumber,
          pos.column,
          pos.lineNumber,
          pos.column,
        ),
        text,
      },
    ]);
    editor.focus();
  };

  const insertNode = (type: string) => {
    insertText(nodeSnippet(type, idCounterRef.current++));
  };
  const insertStructure = (type: string) => {
    insertText(
      type === "pool" ? poolSnippet(idCounterRef.current++) : laneSnippet(idCounterRef.current++),
    );
  };

  const handleEditorMount: OnMount = (editor) => {
    monacoRef.current = editor;
  };

  const palette = PALETTE[editorCategory];
  const structure = PALETTE_STRUCTURE[editorCategory];

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-white">
      <div className="absolute inset-0">
        <ExcalidrawCanvas
          elements={result.elements}
          onApi={(api) => {
            apiRef.current = api;
          }}
        />
      </div>

      {sidebarOpen ? (
        <aside className="absolute left-0 top-0 z-10 flex h-full w-[360px] max-w-[85vw] flex-col border-r border-zinc-200 bg-white shadow-2xl">
          <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold tracking-tight text-zinc-900">
                Tingraph
              </span>
              <span className="hidden text-[11px] text-zinc-400 sm:inline">
                code-to-diagram for papers
              </span>
            </div>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Close sidebar"
              title="Close sidebar"
              className="ml-auto rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>

          <div className="flex items-center gap-1 border-b border-zinc-200 bg-zinc-50 px-3 py-1.5">
            {(["flow", "bpmn"] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  if (cat !== category) setCategory(cat);
                }}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  editorCategory === cat
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
                }`}
              >
                {cat === "flow" ? "Flowchart" : "BPMN 2.0"}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-zinc-400">
              Tingraph DSL
            </span>
          </div>

          <Toolbar
            elements={result.elements}
            title={result.title || "tingraph"}
            apiRef={apiRef}
          />

          <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-1.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              Insert nodes
            </div>
            <div className="flex flex-wrap gap-1">
              {palette.map((entry) => (
                <button
                  key={entry.type}
                  type="button"
                  title={`Insert ${entry.type}`}
                  onClick={() => insertNode(entry.type)}
                  className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[11px] text-zinc-700 transition-colors hover:border-zinc-900 hover:text-zinc-900"
                >
                  {entry.label}
                </button>
              ))}
              {structure.map((entry) => (
                <button
                  key={entry.type}
                  type="button"
                  title={`Insert ${entry.type}`}
                  onClick={() => insertStructure(entry.type)}
                  className="rounded border border-dashed border-zinc-400 bg-white px-1.5 py-0.5 text-[11px] text-zinc-500 transition-colors hover:border-zinc-900 hover:text-zinc-900"
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>

          {result.error && (
            <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              <span>
                {result.error.line > 0 ? `Line ${result.error.line}: ` : ""}
                {result.error.message}
              </span>
            </div>
          )}

          <div className="min-h-0 flex-1">
            <Editor
              height="100%"
              language={DSL_LANGUAGE_ID}
              value={code}
              beforeMount={registerDslLanguage}
              onMount={handleEditorMount}
              onChange={(value) => setCode(value ?? "")}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                padding: { top: 10, bottom: 10 },
                fixedOverflowWidgets: true,
                theme: "vs",
              }}
            />
          </div>

          <CheatSheet
            category={editorCategory}
            open={cheatSheetOpen}
            onToggle={toggleCheatSheet}
          />
        </aside>
      ) : (
        <button
          type="button"
          onClick={toggleSidebar}
          className="absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-md transition-colors hover:bg-zinc-50"
        >
          <PanelLeftOpen size={14} />
          Code &amp; settings
        </button>
      )}
    </div>
  );
}