"use client";

import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { controlsFor, readValues } from "@/lib/canvas/inspect";
import type { StylePatch } from "@/lib/canvas/restyle";
import { SHEET_STYLES } from "@/lib/sheet";
import { DiagramCategory } from "@/lib/types";
import { Segmented, Tick } from "@/components/editor/ui";

/**
 * What one picked element is allowed to look like.
 *
 * The panel is built from `controlsFor`, so a control is on the sheet only
 * when the notation genuinely leaves that choice open. What it holds fixed is
 * named at the bottom rather than shown greyed out.
 */

const STROKES = ["#1e1e1e", "#1e3a8a", "#991b1b", "#065f46", "#6b7280"];
const FILLS = ["transparent", "#ffffff", "#e5e7eb", "#7dd3fc", "#fca5a5", "#6ee7b7"];
const CORNER = { type: 3, value: 14 } as const;

interface InspectorProps {
  picked: ExcalidrawElement[];
  category: DiagramCategory;
  onPatch: (patch: StylePatch, was?: { strokeColor?: string }) => void;
}

function ColourRow({
  colours,
  value,
  onPick,
  label,
}: {
  colours: string[];
  value: string;
  onPick: (colour: string) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {colours.map((colour) => (
        <button
          key={colour}
          type="button"
          aria-label={`${label}: ${colour}`}
          aria-pressed={value === colour}
          title={colour === "transparent" ? "No fill" : colour}
          onClick={() => onPick(colour)}
          className={`h-6 w-6 border-2 border-edge ${
            value === colour ? "outline outline-2 outline-offset-1 outline-edge" : ""
          }`}
          style={
            colour === "transparent"
              ? {
                  backgroundImage:
                    "linear-gradient(45deg, transparent 44%, #a32a1c 44%, #a32a1c 56%, transparent 56%)",
                  backgroundColor: "#ffffff",
                }
              : { backgroundColor: colour }
          }
        />
      ))}
      <label
        title="Pick a colour"
        className="relative grid h-6 w-6 cursor-pointer place-items-center border-2 border-edge bg-white text-[9px] font-semibold text-ink"
      >
        <span aria-hidden="true">+</span>
        <input
          type="color"
          value={value === "transparent" ? "#ffffff" : value}
          onChange={(event) => onPick(event.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label={`${label}: pick a colour`}
        />
      </label>
    </div>
  );
}

export default function Inspector({ picked, category, onPatch }: InspectorProps) {
  const controls = controlsFor(picked, category);
  if (!controls.name) {
    return null;
  }
  const value = readValues(picked);

  return (
    <aside
      aria-label={`${controls.name} properties`}
      className="slab absolute right-4 top-4 z-20 max-h-[calc(100%-2rem)] w-[228px] overflow-y-auto bg-white"
    >
      <header className="flex items-baseline gap-2 border-b-2 border-edge bg-bone px-3 py-2">
        <span className="text-[12.5px] font-semibold text-ink">{controls.name}</span>
        {picked.length > 1 && (
          <span className="ml-auto text-[11px] text-ink-faint">
            {picked.length} pieces
          </span>
        )}
      </header>

      <div className="space-y-3 p-3">
        {controls.stroke && (
          <div>
            <Tick className="mb-1.5 block">Stroke</Tick>
            <ColourRow
              label="Stroke"
              colours={STROKES}
              value={value.strokeColor}
              onPick={(strokeColor) =>
                onPatch({ strokeColor }, { strokeColor: value.strokeColor })
              }
            />
          </div>
        )}

        {controls.fill && (
          <div>
            <Tick className="mb-1.5 block">Fill</Tick>
            <ColourRow
              label="Fill"
              colours={FILLS}
              value={value.backgroundColor}
              onPick={(backgroundColor) => onPatch({ backgroundColor })}
            />
          </div>
        )}

        {controls.weight && (
          <div>
            <Tick className="mb-1.5 block">Weight</Tick>
            <Segmented
              size="sm"
              options={[
                { value: 1, label: "Hair" },
                { value: 2, label: "Line" },
                { value: 4, label: "Bold" },
              ]}
              value={value.strokeWidth}
              onChange={(strokeWidth) => onPatch({ strokeWidth })}
            />
          </div>
        )}

        {controls.dash && (
          <div>
            <Tick className="mb-1.5 block">Line</Tick>
            <Segmented
              size="sm"
              options={[
                { value: "solid" as const, label: "Solid" },
                { value: "dashed" as const, label: "Dashed" },
                { value: "dotted" as const, label: "Dotted" },
              ]}
              value={value.strokeStyle}
              onChange={(strokeStyle) => onPatch({ strokeStyle })}
            />
          </div>
        )}

        {controls.corners && (
          <div>
            <Tick className="mb-1.5 block">Corners</Tick>
            <Segmented
              size="sm"
              options={[
                { value: "sharp" as const, label: "Square" },
                { value: "round" as const, label: "Round" },
              ]}
              value={value.rounded ? "round" : "sharp"}
              onChange={(corner) =>
                onPatch({ roundness: corner === "round" ? { ...CORNER } : null })
              }
            />
          </div>
        )}

        {controls.text && (
          <>
            <div>
              <Tick className="mb-1.5 block">Caption</Tick>
              <Segmented
                size="sm"
                options={SHEET_STYLES.map((style) => ({
                  value: style.fontFamily,
                  label: style.name,
                }))}
                value={value.fontFamily}
                onChange={(fontFamily) => onPatch({ fontFamily })}
              />
            </div>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Tick className="mb-1.5 block">Size</Tick>
                <Segmented
                  size="sm"
                  options={[
                    { value: 12, label: "S" },
                    { value: 16, label: "M" },
                    { value: 20, label: "L" },
                  ]}
                  value={value.fontSize}
                  onChange={(fontSize) => onPatch({ fontSize })}
                />
              </div>
              <div className="min-w-0 flex-1">
                <Tick className="mb-1.5 block">Align</Tick>
                <Segmented
                  size="sm"
                  options={[
                    { value: "left" as const, icon: AlignLeft, title: "Left" },
                    { value: "center" as const, icon: AlignCenter, title: "Centre" },
                    { value: "right" as const, icon: AlignRight, title: "Right" },
                  ]}
                  value={value.textAlign}
                  onChange={(textAlign) => onPatch({ textAlign })}
                />
              </div>
            </div>
          </>
        )}

        {controls.opacity && (
          <div>
            <Tick className="mb-1.5 block">Opacity {value.opacity}%</Tick>
            <input
              type="range"
              min={10}
              max={100}
              step={10}
              value={value.opacity}
              onChange={(event) => onPatch({ opacity: Number(event.target.value) })}
              aria-label="Opacity"
              className="h-6 w-full accent-[var(--edge)]"
            />
          </div>
        )}
      </div>

      {controls.fixed && (
        <p className="border-t-2 border-edge bg-bone px-3 py-2 text-[10.5px] leading-relaxed text-ink-faint">
          {controls.fixed}
        </p>
      )}
    </aside>
  );
}
