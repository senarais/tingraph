"use client";

import { useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { ITEM_RADIUS, planQuadrant, quadrantShare } from "@/lib/quadrant/build-quadrant";
import { QUADRANT_CORNERS, clampShare, type QuadrantCorner, type QuadrantSpec } from "@/lib/quadrant/spec";
import type { CanvasView } from "@/components/editor/pool-controls";
import {
  ACCENT,
  BarKey,
  HandleLayer,
  HitBox,
  PartBar,
  Rename,
  SheetKey,
  useSceneAt,
  type Rect,
} from "@/components/editor/figure-handles";

/**
 * A 2×2 quadrant on the sheet.
 *
 * An item is placed by dragging its dot: where it lands is read back as a
 * share of each axis and written to the spec, so the panel shows the same two
 * numbers the source does. Every caption — the title, each axis's name and
 * ends, each quarter, each item — is renamed where it is read. A `+` under
 * the field drops a new item in the middle.
 */

interface QuadrantHandlesProps {
  api: ExcalidrawImperativeAPI;
  spec: QuadrantSpec;
  box: Rect;
  view: CanvasView;
  picked: string | null;
  onPick: (id: string | null) => void;
  onChange: (spec: QuadrantSpec, settled: boolean) => void;
}

type AxisPart = "label" | "low" | "high";

export default function QuadrantHandles({
  api,
  spec,
  box,
  view,
  picked,
  onPick,
  onChange,
}: QuadrantHandlesProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [held, setHeld] = useState<number | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const sceneAt = useSceneAt(api, svgRef);
  const plan = planQuadrant(spec, box);
  const scale = view.zoom;
  const [kind, key, part] = (picked ?? "").split(":");

  const move = (index: number, at: { x: number; y: number }, settled: boolean) => {
    const share = quadrantShare(plan.field, at);
    onChange(
      {
        ...spec,
        items: spec.items.map((item, i) =>
          i === index ? { ...item, x: clampShare(share.x), y: clampShare(share.y) } : item,
        ),
      },
      settled,
    );
  };

  const axisBoxes = (which: "x" | "y") => (which === "x" ? plan.xLabels : plan.yLabels);
  const axisKey: Record<AxisPart, "name" | "low" | "high"> = { label: "name", low: "low", high: "high" };

  const chosen: { box: Rect; label: string; rename: (value: string) => void; item?: number } | null =
    kind === "title"
      ? { box: plan.title, label: spec.title, rename: (value) => onChange({ ...spec, title: value }, true) }
      : kind === "axis" && (key === "x" || key === "y") && part in axisKey
        ? {
            box: axisBoxes(key)[axisKey[part as AxisPart]],
            label: spec[key][part as AxisPart],
            rename: (value) => onChange({ ...spec, [key]: { ...spec[key], [part]: value } }, true),
          }
        : kind === "quarter" && (QUADRANT_CORNERS as string[]).includes(key)
          ? (() => {
              const place = plan.quarters[key as QuadrantCorner];
              return {
                box: { x: place.at.x - place.width / 2, y: place.at.y - 12, width: place.width, height: 24 },
                label: spec.quarters[key as QuadrantCorner] ?? "",
                rename: (value: string) =>
                  onChange({ ...spec, quarters: { ...spec.quarters, [key]: value } }, true),
              };
            })()
          : kind === "item" && spec.items[Number(key)]
            ? {
                box: plan.items[Number(key)].label,
                label: spec.items[Number(key)].label,
                item: Number(key),
                rename: (value: string) =>
                  onChange(
                    {
                      ...spec,
                      items: spec.items.map((item, i) => (i === Number(key) ? { ...item, label: value } : item)),
                    },
                    true,
                  ),
              }
            : null;

  const named = (id: string, rect: Rect, label: string) => (
    <HitBox
      key={id}
      box={rect}
      held={picked === id}
      label={label}
      onPick={() => onPick(id)}
      onRename={() => {
        onPick(id);
        setNaming(id);
      }}
    />
  );

  return (
    <>
      <svg ref={svgRef} className="absolute inset-0 z-20 h-full w-full" style={{ pointerEvents: "none", touchAction: "none" }}>
        <g transform={`translate(${view.scrollX * scale} ${view.scrollY * scale}) scale(${scale})`}>
          {named("title", plan.title, `Title: ${spec.title}`)}
          {(["x", "y"] as const).flatMap((which) =>
            (["label", "low", "high"] as const).map((piece) =>
              named(`axis:${which}:${piece}`, axisBoxes(which)[axisKey[piece]], `${which} axis ${piece}`),
            ),
          )}
          {QUADRANT_CORNERS.map((corner) => {
            const place = plan.quarters[corner];
            return named(
              `quarter:${corner}`,
              { x: place.at.x - place.width / 2, y: place.at.y - 12, width: place.width, height: 24 },
              `Quarter ${corner}`,
            );
          })}
          {spec.items.map((item, index) => named(`item:${index}`, plan.items[index].label, `Item: ${item.label}`))}
          {spec.items.map((item, index) => (
            <circle
              key={`dot-${index}`}
              cx={plan.items[index].at.x}
              cy={plan.items[index].at.y}
              r={Math.max(ITEM_RADIUS + 3, 7 / scale)}
              fill="transparent"
              stroke={picked === `item:${index}` ? ACCENT : "transparent"}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              aria-label={`Move ${item.label}`}
              style={{ pointerEvents: "auto", cursor: "move" }}
              onPointerDown={(event) => {
                event.stopPropagation();
                try {
                  (event.target as Element).setPointerCapture(event.pointerId);
                } catch {
                  // a pointer that has already gone; the drag still reads fine
                }
                onPick(`item:${index}`);
                setHeld(index);
              }}
              onPointerMove={(event) => {
                if (held === index) move(index, sceneAt(event), false);
              }}
              onPointerUp={(event) => {
                if (held === index) {
                  move(index, sceneAt(event), true);
                  setHeld(null);
                }
              }}
            />
          ))}
        </g>
      </svg>

      <HandleLayer>
        <SheetKey
          view={view}
          at={{ x: plan.field.x + plan.field.width / 2, y: box.y + box.height - 8 }}
          label="Plot an item in the middle"
          onClick={() =>
            onChange({ ...spec, items: [...spec.items, { label: `Item ${spec.items.length + 1}`, x: 50, y: 50 }] }, true)
          }
        >
          <Plus size={12} />
        </SheetKey>

        {chosen && held === null && naming !== picked && (
          <PartBar view={view} at={{ x: chosen.box.x + chosen.box.width / 2, y: chosen.box.y - 6 }}>
            <BarKey label="Write here" onClick={() => setNaming(picked)} last={chosen.item === undefined}>
              <Pencil size={13} />
            </BarKey>
            {chosen.item !== undefined && (
              <BarKey
                label="Remove this item"
                danger
                onClick={() => {
                  onPick(null);
                  onChange({ ...spec, items: spec.items.filter((_, i) => i !== chosen.item) }, true);
                }}
                last
              >
                <Trash2 size={13} />
              </BarKey>
            )}
          </PartBar>
        )}

        {chosen && naming === picked && (
          <Rename
            view={view}
            at={{ x: chosen.box.x + chosen.box.width / 2, y: chosen.box.y + chosen.box.height / 2 }}
            width={chosen.box.width}
            value={chosen.label}
            onCommit={(value) => {
              chosen.rename(value);
              setNaming(null);
            }}
            onCancel={() => setNaming(null)}
          />
        )}
      </HandleLayer>
    </>
  );
}
