"use client";

import { useEffect, useRef, useState } from "react";
import Editor, { loader, type Monaco, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import {
  ArrowDown,
  ArrowRight,
  Info,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import { useTingraphStore } from "@/lib/store";
import { GUIDE_INTRO, GUIDE_SECTIONS } from "@/lib/guide";
import { DiagramCategory, LayoutDirection } from "@/lib/types";
import { Segmented, SlabButton, Tick } from "@/components/editor/ui";
import TutorialPrompt from "@/components/editor/tutorial-prompt";

loader.config({ monaco });

// Monaco resolves its worker from a blob URL by default, which Turbopack cannot
// map back to a module. Point it at the bundled ESM worker instead.
if (typeof window !== "undefined") {
  (window as unknown as { MonacoEnvironment?: unknown }).MonacoEnvironment = {
    getWorker: () =>
      new Worker(new URL("./monaco.worker.ts", import.meta.url), {
        type: "module",
      }),
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

/**
 * The notations that read one way and one way only: a BPMN sheet runs along
 * its lanes, an activity down its partitions, and a use case diagram stands
 * its actors either side of the boundary. Offering them a direction would be
 * offering a setting that does nothing.
 */
const ONE_WAY = new Set<DiagramCategory>(["bpmn", "activity", "usecase"]);

const DIRECTIONS = [
  { value: "down" as LayoutDirection, icon: ArrowDown, title: "Grow the drawing down the page" },
  { value: "right" as LayoutDirection, icon: ArrowRight, title: "Grow the drawing across the page" },
];

interface SourceDrawerProps {
  category: DiagramCategory;
  /** what the source is made of, said the way its own notation says it */
  summary: string;
  error: { message: string; line: number } | null;
  onGenerate: () => void;
  /** draws the starting diagram again, over whatever is on the sheet */
  onReset: () => void;
  generating: boolean;
  generationMessage: string;
  /** that message reports a failure, and is shown whole rather than cut short */
  generationFailed: boolean;
  /** why this source counts as large, if it does: Generate will ask first */
  large: string[];
  onOpenAi: () => void;
  onEditorMount: OnMount;
}

/**
 * Keeps the keyboard inside the code editor.
 *
 * The sheet's shortcuts run on the document, and Excalidraw steps aside for a
 * key pressed in an input, a textarea or a caption editor — but Monaco writes
 * into an edit context on a plain div, which none of those cover, so `h` would
 * reach for the hand tool instead of the letter. The listener is attached to
 * the element rather than through React, because React delivers its events at
 * the document, where stopping them would be too late.
 */
function useCodeKeys() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const swallow = (event: KeyboardEvent) => event.stopPropagation();
    node.addEventListener("keydown", swallow);
    return () => node.removeEventListener("keydown", swallow);
  }, []);
  return ref;
}

export default function SourceDrawer({
  category,
  summary,
  error,
  onGenerate,
  onReset,
  generating,
  generationMessage,
  generationFailed,
  large,
  onOpenAi,
  onEditorMount,
}: SourceDrawerProps) {
  const code = useTingraphStore((s) => s.code);
  const setCode = useTingraphStore((s) => s.setCode);
  const direction = useTingraphStore((s) => s.direction);
  const setDirection = useTingraphStore((s) => s.setDirection);
  const tab = useTingraphStore((s) => s.sourceTab);
  const setTab = useTingraphStore((s) => s.setSourceTab);
  const codeKeys = useCodeKeys();
  const [armed, setArmed] = useState(false);

  /** Back to the drawing this notation opens with, source and sheet alike. */
  const reset = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    onReset();
  };

  return (
    <>
      <div className="border-b-2 border-edge p-3">
        <Segmented
          options={[
            { value: "code", label: "Source" },
            { value: "guide", label: "Syntax guide" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === "code" ? (
        <>
          <div ref={codeKeys} className="min-h-0 flex-1 border-b-2 border-edge bg-white">
            <Editor
              height="100%"
              language={DSL_LANGUAGE_ID}
              theme={DSL_THEME_ID}
              value={code}
              beforeMount={registerDslLanguage}
              onMount={onEditorMount}
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

          {error && (
            <p className="flex items-start gap-2 border-b-2 border-edge bg-alert-tint px-3 py-2.5 text-[11.5px] leading-relaxed text-alert">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" />
              <span>
                {error.line > 0 ? `Line ${error.line}: ` : ""}
                {error.message}
              </span>
            </p>
          )}
          {!error && generationFailed && generationMessage && (
            <p
              role="alert"
              className="flex items-start gap-2 border-b-2 border-edge bg-alert-tint px-3 py-2.5 text-[11.5px] leading-relaxed text-alert"
            >
              <TriangleAlert size={13} className="mt-0.5 shrink-0" />
              <span>{generationMessage}</span>
            </p>
          )}
          {!error && large.length > 0 && (
            <p className="flex items-start gap-2 border-b-2 border-edge bg-blueprint-tint px-3 py-2.5 text-[11.5px] leading-relaxed text-blueprint">
              <Info size={13} className="mt-0.5 shrink-0" />
              <span>
                Large diagram: {large.join(", ")}. It may read small on screen, so
                Generate will ask before drawing it.
              </span>
            </p>
          )}

          <div className="flex items-center gap-2 p-3">
            <span className="min-w-0 flex-1 truncate text-[11px] text-ink-soft">
              {error
                ? "Source has a syntax error"
                : (!generationFailed && generationMessage) || summary}
            </span>
            {!ONE_WAY.has(category) && (
              <div className="w-[86px] shrink-0">
                <Segmented
                  size="sm"
                  options={DIRECTIONS}
                  value={direction}
                  onChange={setDirection}
                />
              </div>
            )}
            <SlabButton
              onClick={reset}
              onBlur={() => setArmed(false)}
              tone={armed ? "solid" : "plain"}
              disabled={generating}
              title="Put the source and the sheet back to the diagram this notation opens with"
            >
              <RotateCcw size={13} />
              {armed ? "Sure?" : "Reset"}
            </SlabButton>
            <SlabButton tone="solid" onClick={onGenerate} disabled={!!error || generating}>
              <Wand2 size={13} />
              {generating ? "Generating…" : "Generate"}
            </SlabButton>
          </div>
        </>
      ) : (
        <Guide category={category} onOpenAi={onOpenAi} />
      )}
    </>
  );
}

function Guide({ category, onOpenAi }: { category: DiagramCategory; onOpenAi: () => void }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="border-b-2 border-edge p-3">
        <p className="text-[12px] leading-relaxed text-ink-soft">
          {GUIDE_INTRO[category]}
        </p>
        <div className="slab-tight mt-3 bg-white p-3">
          <Tick className="block">Writing it with an assistant</Tick>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-soft">
            Tingraph AI already knows this notation, and every diagram it writes
            is checked before you see it.
          </p>
          <SlabButton tone="solid" onClick={onOpenAi} className="mt-3 w-full">
            <Sparkles size={13} />
            Ask Tingraph AI
          </SlabButton>

          <p className="mt-4 text-[11.5px] leading-relaxed text-ink-soft">
            Or use your own chat: copy the whole tutorial as a prompt, describe
            your diagram at the bottom, and paste what comes back into the source.
          </p>
          <TutorialPrompt category={category} className="mt-3" />
        </div>
      </div>

      {GUIDE_SECTIONS[category].map((section) => (
        <section key={section.title} className="border-b-2 border-edge p-3">
          <Tick className="mb-2 block">{section.title}</Tick>
          <dl className="space-y-1.5">
            {section.rows.map((entry) => (
              <div key={entry.syntax} className="flex items-baseline gap-2">
                <dt className="shrink-0">
                  <code className="border border-edge bg-white px-1.5 py-0.5 text-[11px] text-ink">
                    {entry.syntax}
                  </code>
                </dt>
                <dd className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">
                  {entry.meaning}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
