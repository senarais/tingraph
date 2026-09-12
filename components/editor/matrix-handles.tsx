"use client";

import { useRef, useState } from "react";
import { Minus, Pencil, Plus, Trash2 } from "lucide-react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { itemAt, matrixField, matrixQuadrants, matrixTitle } from "@/lib/matrix/build-matrix";
import { QUADRANT_NAMES, type MatrixSpec } from "@/lib/matrix/spec";
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
 * A 2×2 matrix on the sheet.
 *
 * The whole point of a matrix is *where a thing sits*, so the sheet is where
 * the items live: drag one and the two numbers behind it are written from
 * where it lands. The four quadrants are named in place, because a quadrant's
 * name is the reading of that corner and is easiest to judge against the
 * corner itself.
 */

interface MatrixHandlesProps {
  api: ExcalidrawImperativeAPI;
  spec: MatrixSpec;
  box: Rect;
  view: CanvasView;
  picked: string | null;
  onPick: (id: string | null) => void;
  onChange: (spec: MatrixSpec, settled: boolean) => void;
}

export default function MatrixHandles({
  api,
  spec,
  box,
  view,
  picked,
  onPick,
  onChange,
}: MatrixHandlesProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [held, setHeld] = useState<number | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const sceneAt = useSceneAt(api, svgRef);
  const field = matrixField(spec, box);
  const quadrants = matrixQuadrants(spec, box);
  const scale = view.zoom;

  const [kind, at] = (picked ?? "").split(":");
  const index = Number(at);

  const place = (item: number, to: Pt, settled: boolean) => {
    const x = Math.min(1, Math.max(0, (to.x - field.x) / Math.max(1, field.width)));
    const y = Math.min(1, Math.max(0, 1 - (to.y - field.y) / Math.max(1, field.height)));
    onChange(
      {
        ...spec,
        items: spec.items.map((entry, i) =>
          i === item
            ? { ...entry, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 }
            : entry,
        ),
      },
      settled,
    );
  };

  const writeItem = (item: number, label: string) =>
    onChange(
      {
        ...spec,
        items: spec.items.map((entry, i) => (i === item ? { ...entry, label } : entry)),
      },
      true,
    );

  const addItem = () => {
    const next = spec.items.length;
    onChange(
      {
        ...spec,
        items: [...spec.items, { label: `Item ${next + 1}`, x: 0.5, y: 0.5 }],
      },
      true,
    );
    onPick(`item:${next}`);
    setNaming(`item:${next}`);
  };

  const dropItem = (item: number) => {
    onChange({ ...spec, items: spec.items.filter((_, i) => i !== item) }, true);
    onPick(null);
  };

  /** What is being pointed at: the title, an item, or a quadrant's name. */
  const chosen =
    kind === "title"
      ? {
          box: matrixTitle(box),
          label: spec.title,
          rename: (value: string) => onChange({ ...spec, title: value }, true),
        }
      : kind === "item" && spec.items[index]
      ? (() => {
          const spot = itemAt(spec, box, spec.items[index]);
          return {
            box: { x: spot.x - 50, y: spot.y - 12, width: 100, height: 24 },
            label: spec.items[index].label,
            rename: (value: string) => writeItem(index, value),
          };
        })()
      : kind === "quadrant" && quadrants[index]
        ? {
            box: quadrants[index],
            label: spec.quadrants[index].label,
            rename: (value: string) =>
              onChange(
                {
                  ...spec,
                  quadrants: spec.quadrants.map((entry, i) =>
                    i === index ? { ...entry, label: value } : entry,
                  ) as MatrixSpec["quadrants"],
                },
                true,
              ),
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
            box={matrixTitle(box)}
            held={picked === "title"}
            label={`Title: ${spec.title}`}
            onPick={() => onPick("title")}
            onRename={() => {
              onPick("title");
              setNaming("title");
            }}
          />
          {quadrants.map((quadrant, at2) => (
            <HitBox
              key={`quadrant-${at2}`}
              box={{
                x: quadrant.x + quadrant.width / 2 - 60,
                y:
                  spec.options.labels === "inside"
                    ? quadrant.y + 10
                    : quadrant.y + quadrant.height / 2 - 12,
                width: 120,
                height: 26,
              }}
              held={picked === `quadrant:${at2}`}
              label={`${QUADRANT_NAMES[at2]} quadrant: ${spec.quadrants[at2].label}`}
              onPick={() => onPick(`quadrant:${at2}`)}
              onRename={() => {
                onPick(`quadrant:${at2}`);
                setNaming(`quadrant:${at2}`);
              }}
            />
          ))}
          {spec.items.map((item, at2) => {
            const where = itemAt(spec, box, item);
            return (
              <circle
                key={`item-${at2}`}
                cx={where.x}
                cy={where.y}
                r={13 / scale}
                fill="transparent"
                stroke={picked === `item:${at2}` || held === at2 ? ACCENT : "transparent"}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: "auto", cursor: "grab" }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  try {
                    (event.target as Element).setPointerCapture(event.pointerId);
                  } catch {
                    // a pointer that has already gone; the drag still reads fine
                  }
                  onPick(`item:${at2}`);
                  setHeld(at2);
                }}
                onPointerMove={(event) => {
                  if (held === at2) {
                    place(at2, sceneAt(event), false);
                  }
                }}
                onPointerUp={(event) => {
                  if (held === at2) {
                    place(at2, sceneAt(event), true);
                    setHeld(null);
                  }
                }}
                onDoubleClick={() => {
                  onPick(`item:${at2}`);
                  setNaming(`item:${at2}`);
                }}
              />
            );
          })}
        </g>
      </svg>

      <HandleLayer>
        {/* the pair under the field puts work into it and takes it back out */}
        <SheetKey
          view={view}
          at={{ x: field.x + field.width - 26, y: field.y + field.height + 16 }}
          label="Place an item in the field"
          onClick={addItem}
        >
          <Plus size={12} />
        </SheetKey>
        <SheetKey
          view={view}
          at={{ x: field.x + field.width - 2, y: field.y + field.height + 16 }}
          label="Take the last item back out"
          onClick={() => spec.items.length > 0 && dropItem(spec.items.length - 1)}
        >
          <Minus size={12} />
        </SheetKey>

        {chosen && !held && naming !== picked && (
          <PartBar
            view={view}
            at={{ x: chosen.box.x + chosen.box.width / 2, y: chosen.box.y - 6 }}
          >
            <BarKey label="Rename this" onClick={() => setNaming(picked)} last={kind !== "item"}>
              <Pencil size={13} />
            </BarKey>
            {kind === "item" && (
              <BarKey label="Take this item out" danger last onClick={() => dropItem(index)}>
                <Trash2 size={13} />
              </BarKey>
            )}
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
