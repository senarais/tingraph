"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DiagramArt } from "@/components/site/diagram-art";
import { READY_DIAGRAMS } from "@/lib/diagrams";
import { parseDSL } from "@/lib/parser/parse-dsl";

/**
 * The hero: source on the left, the drawing it produces on the right. The
 * sample types itself out once, the drawing inks itself in behind it, and the
 * pair moves on to the next notation until the reader picks one themselves.
 */

const TYPE_MS = 2100;
const HOLD_MS = 3400;

type Token = { text: string; tone: string };

const TONE: Record<string, string> = {
  keyword: "#7fc8ea",
  type: "#c4a6ea",
  string: "#8ed6a6",
  comment: "#727a85",
  arrow: "#9aa3ad",
  brace: "#9aa3ad",
  plain: "#e9e6dd",
};

const LEXER =
  /(#[^\n]*|\/\/[^\n]*)|("(?:[^"\\]|\\.)*")|\b(flow|bpmn|org)\b|\b(msg-start|msg-end|send-task|recv-task|script-task|user-task|gw-ex|gw-para|gw-inc|start|process|task|decision|io|data|end|timer|pool|lane|role|unit)\b|(-\.->|->)|([{}[\]])/g;

/** Colours the sample once, so the typewriter can slice it without re-parsing. */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const m of source.matchAll(LEXER)) {
    const at = m.index ?? 0;
    if (at > last) {
      tokens.push({ text: source.slice(last, at), tone: TONE.plain });
    }
    const tone = m[1]
      ? TONE.comment
      : m[2]
        ? TONE.string
        : m[3]
          ? TONE.keyword
          : m[4]
            ? TONE.type
            : m[5]
              ? TONE.arrow
              : TONE.brace;
    tokens.push({ text: m[0], tone });
    last = at + m[0].length;
  }
  if (last < source.length) {
    tokens.push({ text: source.slice(last), tone: TONE.plain });
  }
  return tokens;
}

function slice(tokens: Token[], count: number): Token[] {
  const out: Token[] = [];
  let left = count;
  for (const token of tokens) {
    if (left <= 0) break;
    out.push(
      token.text.length <= left
        ? token
        : { text: token.text.slice(0, left), tone: token.tone },
    );
    left -= token.text.length;
  }
  return out;
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-r-2 border-edge px-4 py-2 last:border-r-0">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-faint">
        {label}
      </span>
      <span className="truncate text-[12px] text-ink">{value}</span>
    </div>
  );
}

export default function HeroDemo() {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const [picked, setPicked] = useState(false);
  const reduced = useRef(false);

  const kind = READY_DIAGRAMS[index];
  const source = kind.sample ?? "";
  const tokens = useMemo(() => tokenize(source), [source]);
  const reading = useMemo(() => {
    const ast = parseDSL(source);
    return { nodes: ast.nodes.length, edges: ast.edges.length, title: ast.title };
  }, [source]);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // types the sample out, then hands over to the hold timer below
  useEffect(() => {
    if (reduced.current) {
      setTyped(source.length);
      return;
    }
    setTyped(0);
    const step = Math.max(1, Math.ceil(source.length / (TYPE_MS / 24)));
    const id = window.setInterval(() => {
      setTyped((n) => {
        if (n >= source.length) {
          window.clearInterval(id);
          return n;
        }
        return Math.min(source.length, n + step);
      });
    }, 24);
    return () => window.clearInterval(id);
  }, [source]);

  // once a notation has been read, move to the next — until the reader picks
  useEffect(() => {
    if (picked || reduced.current || typed < source.length) {
      return;
    }
    const id = window.setTimeout(
      () => setIndex((n) => (n + 1) % READY_DIAGRAMS.length),
      HOLD_MS,
    );
    return () => window.clearTimeout(id);
  }, [picked, typed, source.length]);

  const done = typed >= source.length;

  return (
    <div className="slab mx-auto w-full max-w-4xl bg-white">
      <div className="flex items-stretch border-b-2 border-edge">
        {READY_DIAGRAMS.map((entry, i) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => {
              setPicked(true);
              setIndex(i);
            }}
            aria-pressed={i === index}
            className={`flex-1 border-r-2 border-edge px-3 py-2.5 font-mono text-[12px] font-semibold transition-colors last:border-r-0 ${
              i === index
                ? "bg-edge text-bone"
                : "bg-white text-ink hover:bg-bone"
            }`}
          >
            {entry.keyword}
            <span className="ml-2 hidden font-sans text-[11px] font-normal opacity-70 sm:inline">
              {entry.name}
            </span>
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="min-w-0 bg-edge p-5 md:border-r-2 md:border-edge">
          <pre className="overflow-x-auto font-mono text-[12px] leading-[1.75] md:text-[12.5px]">
            <code>
              {slice(tokens, typed).map((token, i) => (
                <span key={i} style={{ color: token.tone }}>
                  {token.text}
                </span>
              ))}
              <span
                className={`inline-block w-[7px] translate-y-[2px] bg-bone ${done ? "caret" : ""}`}
                style={{ height: "1em" }}
              />
            </code>
          </pre>
        </div>

        {/* the sheet stays blank until the source is finished, then inks in */}
        <div
          className={`relative min-w-0 border-t-2 border-edge bg-white p-4 transition-opacity duration-300 md:border-t-0 ${
            done ? "drawn opacity-100" : "opacity-0"
          }`}
        >
          <DiagramArt
            key={`${kind.id}-${done}`}
            id={kind.id}
            accent="mono"
            className="mx-auto h-full max-h-[300px] w-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 border-t-2 border-edge bg-bone sm:grid-cols-4">
        <Cell label="Drawing" value={reading.title} />
        <Cell label="Elements" value={`${reading.nodes} nodes, ${reading.edges} flows`} />
        <Cell label="Export" value="PNG, JPG, SVG, PDF" />
        <div className="flex items-center border-l-2 border-edge sm:border-l-0">
          <Link
            href={`/editor?type=${kind.id}`}
            className="flex h-full w-full items-center justify-center bg-edge px-4 font-mono text-[12px] font-semibold text-bone transition-colors hover:bg-navy"
          >
            Open in editor
          </Link>
        </div>
      </div>
    </div>
  );
}
