"use client";

import { useRef, useState } from "react";
import { Minus, Pencil, Plus } from "lucide-react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { planVenn } from "@/lib/venn/build-venn";
import { vennRegions, type VennSpec } from "@/lib/venn/spec";
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
  type Pt,
  type Rect,
} from "@/components/editor/figure-handles";

/**
 * A Venn diagram on the sheet.
 *
 * There is exactly one thing to drag — how far the rings sit into each other —
 * and everything else is writing: the name of a set, and what falls in each of
 * the regions they make. Both are written where they are read, so the reader
 * is never guessing which region `AB` was.
 */

interface VennHandlesProps {
  api: ExcalidrawImperativeAPI;
  spec: VennSpec;
  box: Rect;
  view: CanvasView;
  picked: string | null;
  onPick: (id: string | null) => void;
  onChange: (spec: VennSpec, settled: boolean) => void;
}

export default function VennHandles({
  api,
  spec,
  box,
  view,
  picked,
  onPick,
  onChange,
}: VennHandlesProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [held, setHeld] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const sceneAt = useSceneAt(api, svgRef);
  const plan = planVenn(spec, box);
  const scale = view.zoom;
  const [kind, key] = (picked ?? "").split(":");

  const pull = (at: Pt, settled: boolean) => {
    const reach = Math.hypot(at.x - plan.middle.x, at.y - plan.middle.y);
    const most = Math.max(1, plan.radius * 1.5);
    const overlap = Math.min(0.85, Math.max(0.1, 1 - reach / most));
    onChange(
      { ...spec, options: { ...spec.options, overlap: Math.round(overlap * 100) / 100 } },
      settled,
    );
  };

  const setRings = (count: number) =>
    onChange(
      {
        ...spec,
        sets:
          count === 3
            ? [...spec.sets, { label: "Set C" }].slice(0, 3)
            : spec.sets.slice(0, 2),
      },
      true,
    );

  /** The label box a region's writing sits in, centred on the spot it is drawn at. */
  const regionBox = (spot: Pt): Rect => ({
    x: spot.x - plan.radius * 0.45,
    y: spot.y - spec.options.fontSize,
    width: plan.radius * 0.9,
    height: spec.options.fontSize * 2,
  });

  const chosen =
    kind === "title"
      ? {
          box: plan.title,
          label: spec.title,
          rename: (value: string) => onChange({ ...spec, title: value }, true),
        }
      : kind === "set" && spec.sets[Number(key)]
      ? (() => {
          const spot = plan.names[Number(key)];
          return {
            box: { x: spot.at.x - 60, y: spot.at.y - 12, width: 120, height: 24 },
            label: spec.sets[Number(key)].label,
            rename: (value: string) =>
              onChange(
                {
                  ...spec,
                  sets: spec.sets.map((entry, i) =>
                    i === Number(key) ? { ...entry, label: value } : entry,
                  ),
                },
                true,
              ),
          };
        })()
      : kind === "region" && plan.spots[key]
        ? {
            box: regionBox(plan.spots[key]),
            label: spec.regions[key] ?? "",
            rename: (value: string) =>
              onChange({ ...spec, regions: { ...spec.regions, [key]: value } }, true),
          }
        : null;

  return (
    <>
      <svg
        ref={svgRef}
        className="absolute inset-0 z-20 h-full w-full"
        style={{ pointerEvents: "none", touchAction: "none" }}
      >
        <g transform={`translate(${view.scrollX * scale} ${view.scrollY * scale}) scale(${scale})`}>
          <HitBox
            box={plan.title}
            held={picked === "title"}
            label={`Title: ${spec.title}`}
            onPick={() => onPick("title")}
            onRename={() => {
              onPick("title");
              setNaming("title");
            }}
          />
          {vennRegions(spec.sets.length).map((entry) => {
            const spot = plan.spots[entry];
            return spot ? (
              <HitBox
                key={`region-${entry}`}
                box={regionBox(spot)}
                held={picked === `region:${entry}`}
                label={`Region ${entry}`}
                onPick={() => onPick(`region:${entry}`)}
                onRename={() => {
                  onPick(`region:${entry}`);
                  setNaming(`region:${entry}`);
                }}
              />
            ) : null;
          })}
          {plan.names.map((spot, index) => (
            <HitBox
              key={`set-${index}`}
              box={{ x: spot.at.x - 60, y: spot.at.y - 12, width: 120, height: 24 }}
              held={picked === `set:${index}`}
              label={`Set ${"ABC".charAt(index)}: ${spec.sets[index]?.label ?? ""}`}
              onPick={() => onPick(`set:${index}`)}
              onRename={() => {
                onPick(`set:${index}`);
                setNaming(`set:${index}`);
              }}
            />
          ))}
          {plan.centres.map((centre, index) => (
            <circle
              key={`ring-${index}`}
              cx={centre.x}
              cy={centre.y}
              r={6 / scale}
              fill="#ffffff"
              stroke={ACCENT}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: "auto", cursor: "move" }}
              onPointerDown={(event) => {
                event.stopPropagation();
                try {
                  (event.target as Element).setPointerCapture(event.pointerId);
                } catch {
                  // a pointer that has already gone; the drag still reads fine
                }
                setHeld(true);
              }}
              onPointerMove={(event) => {
                if (held) {
                  pull(sceneAt(event), false);
                }
              }}
              onPointerUp={(event) => {
                if (held) {
                  pull(sceneAt(event), true);
                  setHeld(false);
                }
              }}
            />
          ))}
        </g>
      </svg>

      <HandleLayer>
        {/* two rings or three: the pair below the drawing is the whole choice */}
        <SheetKey
          view={view}
          at={{ x: plan.middle.x - 14, y: box.y + box.height - 14 }}
          label="Add a third ring"
          onClick={() => setRings(3)}
        >
          <Plus size={12} />
        </SheetKey>
        <SheetKey
          view={view}
          at={{ x: plan.middle.x + 14, y: box.y + box.height - 14 }}
          label="Go back to two rings"
          onClick={() => setRings(2)}
        >
          <Minus size={12} />
        </SheetKey>

        {chosen && !held && naming !== picked && (
          <PartBar
            view={view}
            at={{ x: chosen.box.x + chosen.box.width / 2, y: chosen.box.y - 6 }}
          >
            <BarKey label="Write here" onClick={() => setNaming(picked)} last>
              <Pencil size={13} />
            </BarKey>
          </PartBar>
        )}

        {chosen && naming === picked && (
          <Rename
            view={view}
            at={{
              x: chosen.box.x + chosen.box.width / 2,
              y: chosen.box.y + chosen.box.height / 2,
            }}
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
