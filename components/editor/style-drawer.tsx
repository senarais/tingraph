"use client";

import { useState } from "react";
import { INK_PRESETS, useTingraphStore } from "@/lib/store";
import { SHEET_STYLES, type SheetStyle } from "@/lib/sheet";
import { customInk, washFor } from "@/lib/ink";
import { DiagramCategory } from "@/lib/types";
import { Field, Swatch, Tick } from "@/components/editor/ui";

/**
 * The sheet-wide settings: what the drawing is inked in, and how it is drawn.
 * Anything a notation decides for itself — an arrowhead, the ring weight of an
 * end event, the rounded outline of a task — is not here, and the note at the
 * bottom says so rather than leaving the reader hunting for it.
 */

/**
 * A chart takes its colours from the Chart panel rather than from the ink,
 * because the colours are carrying the readings apart rather than setting the
 * tone of the sheet. The ink still writes the captions and rules the axes.
 */
const CHART_FIXED =
  "The marks take their colours from the Chart panel. The ink writes the captions and rules the axes.";

const FIXED: Record<DiagramCategory, string> = {
  flow: "Arrowheads, routing and the terminator outline come from the notation.",
  bpmn: "Arrowheads, event ring weights, the task outline and the BPMN markers come from the notation.",
  org: "An org chart is drawn in black whatever the ink is: the ink only moves the wash behind a role band.",
  bar: CHART_FIXED,
  line: CHART_FIXED,
  pie: CHART_FIXED,
  scatter: CHART_FIXED,
};

/** A shape and a connector, drawn the way the style would draw them. */
function StyleMark({ style }: { style: SheetStyle }) {
  const playful = style.roughness > 0;
  return (
    <svg viewBox="0 0 72 34" className="h-8 w-[72px]" aria-hidden="true">
      <rect
        x={2}
        y={7}
        width={28}
        height={20}
        rx={playful ? 5 : 0}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin={playful ? "round" : "miter"}
      />
      <path
        d={playful ? "M34 17.6c4-1.2 8 1 12-.4s7 .6 11-.2" : "M34 17h23"}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
      />
      <path
        d="M57 13.6 63 17l-6 3.4z"
        fill="currentColor"
        stroke="none"
      />
      <rect
        x={2}
        y={7}
        width={28}
        height={20}
        rx={playful ? 5 : 0}
        fill="none"
        stroke="currentColor"
        strokeWidth={playful ? 0.9 : 0}
        opacity={playful ? 0.5 : 0}
        transform="translate(0.8 -0.6) rotate(-0.4 16 17)"
      />
    </svg>
  );
}

export default function StyleDrawer({ category }: { category: DiagramCategory }) {
  const ink = useTingraphStore((s) => s.ink);
  const setInk = useTingraphStore((s) => s.setInk);
  const mixed = useTingraphStore((s) => s.mixed);
  const mix = useTingraphStore((s) => s.mix);
  const style = useTingraphStore((s) => s.style);
  const setStyle = useTingraphStore((s) => s.setStyle);

  // a half-typed colour is not a colour: the field holds what is being written
  // and only hands it over once it reads as one
  const [draft, setDraft] = useState(mixed);
  const [shown, setShown] = useState(mixed);
  if (shown !== mixed) {
    setShown(mixed);
    setDraft(mixed);
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Field label="Ink" className="border-b-2 border-edge p-3">
        <div className="flex flex-wrap items-center gap-2">
          {INK_PRESETS.map((preset) => (
            <Swatch
              key={preset.id}
              color={preset.color}
              tint={preset.tint}
              held={ink.id === preset.id}
              title={preset.name}
              onClick={() =>
                setInk({
                  id: preset.id,
                  name: preset.name,
                  color: preset.color,
                  tint: preset.tint,
                })
              }
            />
          ))}
          <span className="mx-1 h-7 border-l-2 border-edge" />
          <label
            title="Mix your own ink"
            className={`relative h-7 w-7 cursor-pointer border-2 ${
              ink.id === "custom"
                ? "outline outline-2 outline-offset-2 outline-edge"
                : ""
            }`}
            style={{ backgroundColor: washFor(mixed), borderColor: mixed }}
          >
            <input
              type="color"
              value={mixed}
              onChange={(event) => mix(event.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Mix your own ink"
            />
          </label>
          <input
            value={draft}
            onChange={(event) => {
              const value = event.target.value;
              setDraft(value);
              if (/^#[0-9a-fA-F]{6}$/.test(value)) {
                mix(value.toLowerCase());
              }
            }}
            onBlur={() => setDraft(mixed)}
            spellCheck={false}
            aria-label="Ink colour, as a hex value"
            className="w-[86px] border-2 border-edge bg-white px-2 py-1 font-mono text-[11.5px] text-ink"
          />
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
          {ink.id === "custom"
            ? `Drawn in ${ink.color}, banded in ${ink.tint}.`
            : "Every stroke on the sheet is re-inked at once. A band takes the paler half of the pair."}
        </p>
        {ink.id === "custom" && (
          <button
            type="button"
            onClick={() => mix(mixed)}
            className="mt-2 text-[11px] text-ink underline underline-offset-2"
          >
            Re-apply {customInk(mixed).color}
          </button>
        )}
      </Field>

      <Field label="Drawing style" className="border-b-2 border-edge p-3">
        <div className="space-y-2">
          {SHEET_STYLES.map((entry) => {
            const held = style === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={held}
                onClick={() => setStyle(entry.id)}
                className={`flex w-full items-center gap-3 border-2 border-edge px-3 py-2.5 text-left transition-colors ${
                  held ? "bg-edge text-bone" : "bg-white text-ink hover:bg-bone"
                }`}
              >
                <StyleMark style={entry} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold">
                    {entry.name}
                  </span>
                  <span
                    className={`mt-0.5 block text-[11px] leading-tight ${
                      held ? "text-bone/70" : "text-ink-faint"
                    }`}
                  >
                    {entry.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
          A style is a font, a line and a corner together. Those are the only two
          fonts the editor will ever draw a caption in.
        </p>
      </Field>

      <div className="p-3">
        <Tick className="block">Held by the notation</Tick>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
          {FIXED[category]}
        </p>
      </div>
    </div>
  );
}
