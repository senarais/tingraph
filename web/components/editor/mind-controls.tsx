"use client";

import { useRef, useState } from "react";
import { Image as ImageIcon, Plus, Shapes, Trash2 } from "lucide-react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import type { FileId } from "@excalidraw/excalidraw/element/types";
import {
  MIND_SHAPES,
  freshMindId,
  parentOf,
  rewriteMind,
  type MindNode,
  type MindShape,
  type MindSpec,
} from "@/lib/mind/spec";
import { layoutMind, pinAt, type MindPlaced, type Pt } from "@/lib/mind/layout-mind";
import type { CanvasView } from "@/components/editor/pool-controls";

/**
 * Building a mind map on the sheet.
 *
 * This is where a mind map is actually made: press a branch and it offers the
 * four things a branch can do, drag it and it stays where it is put, press the
 * ring on its outward side and a new branch grows there. The panel in the rail
 * is for the look of the whole thing; everything about the tree itself happens
 * under the pointer.
 */

interface MindControlsProps {
  api: ExcalidrawImperativeAPI;
  spec: MindSpec;
  box: { x: number; y: number; width: number; height: number };
  view: CanvasView;
  picked: string | null;
  onPick: (id: string | null) => void;
  onChange: (spec: MindSpec, settled: boolean) => void;
}

const ACCENT = "#6b46ff";
/** how big a picture a node takes when one is dropped on it */
const PICTURE = 108;

export default function MindControls({
  api,
  spec,
  box,
  view,
  picked,
  onPick,
  onChange,
}: MindControlsProps) {
  const [held, setHeld] = useState<{ id: string; from: Pt } | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [shapes, setShapes] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const inner = spec.title
    ? { x: box.x, y: box.y + 28, width: box.width, height: Math.max(80, box.height - 28) }
    : box;
  const drawing = layoutMind(spec, inner);
  const scale = view.zoom;
  const size = (value: number) => value / scale;
  const chosen = drawing.nodes.find((entry) => entry.id === picked) ?? null;

  const sceneAt = (event: { clientX: number; clientY: number }): Pt => {
    const rect = svgRef.current?.getBoundingClientRect();
    const state = api.getAppState();
    return {
      x: (event.clientX - (rect?.left ?? 0)) / state.zoom.value - state.scrollX,
      y: (event.clientY - (rect?.top ?? 0)) / state.zoom.value - state.scrollY,
    };
  };
  const onSheet = (at: Pt) => ({
    left: (at.x + view.scrollX) * scale,
    top: (at.y + view.scrollY) * scale,
  });

  const writeNode = (id: string, patch: Partial<MindNode>, settled = true) => {
    const next = rewriteMind(spec.root, id, (found) => ({ ...found, ...patch }));
    if (next) {
      onChange({ ...spec, root: next }, settled);
    }
  };

  /** A branch grows on the side the node already faces away from its parent. */
  const addChild = (entry: MindPlaced) => {
    const id = freshMindId(spec.root);
    const next = rewriteMind(spec.root, entry.id, (found) => ({
      ...found,
      children: [...found.children, { id, label: "New branch", children: [] }],
    }));
    if (next) {
      onChange({ ...spec, root: next }, true);
      onPick(id);
      setNaming(id);
    }
  };

  const dropNode = (id: string) => {
    if (!parentOf(spec.root, id)) {
      return;
    }
    const next = rewriteMind(spec.root, id, () => null);
    if (next) {
      onChange({ ...spec, root: next }, true);
      onPick(null);
    }
  };

  /**
   * A picture in place of the shape. The file is handed to Excalidraw, which
   * keeps it with the drawing and puts it in an export; the node only records
   * the name it was filed under.
   */
  const takePicture = async (file: File) => {
    if (!picked) {
      return;
    }
    const dataURL = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const shape = await new Promise<{ width: number; height: number }>((resolve) => {
      const picture = new window.Image();
      picture.onload = () =>
        resolve({ width: picture.naturalWidth, height: picture.naturalHeight });
      picture.onerror = () => resolve({ width: 1, height: 1 });
      picture.src = dataURL;
    });
    const fileId = `mind-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    api.addFiles([
      {
        id: fileId as FileId,
        dataURL: dataURL as BinaryFileData["dataURL"],
        mimeType: file.type as BinaryFileData["mimeType"],
        created: Date.now(),
      },
    ]);
    const ratio = shape.height / Math.max(1, shape.width);
    writeNode(picked, {
      image: {
        fileId,
        width: PICTURE,
        height: Math.max(40, Math.round(PICTURE * ratio)),
      },
    });
  };

  const move = (event: React.PointerEvent) => {
    if (!held) {
      return;
    }
    const at = sceneAt(event);
    writeNode(held.id, { at: pinAt(drawing, at) }, false);
  };
  const up = (event: React.PointerEvent) => {
    if (!held) {
      return;
    }
    writeNode(held.id, { at: pinAt(drawing, sceneAt(event)) }, true);
    setHeld(null);
  };

  /** The ring that grows a branch, on the far side of the node from its parent. */
  const growAt = (entry: MindPlaced): Pt => {
    const reach = Math.max(entry.box.width, entry.box.height) / 2 + 13;
    return {
      x: entry.at.x + Math.cos(entry.angle) * reach,
      y: entry.at.y + Math.sin(entry.angle) * reach,
    };
  };

  return (
    <>
      <svg
        ref={svgRef}
        className="absolute inset-0 z-20 h-full w-full"
        style={{ pointerEvents: "none", touchAction: "none" }}
        onPointerMove={held ? move : undefined}
        onPointerUp={held ? up : undefined}
      >
        <g
          transform={`translate(${view.scrollX * scale} ${view.scrollY * scale}) scale(${scale})`}
        >
          {chosen && (
            <rect
              x={chosen.box.x - 4}
              y={chosen.box.y - 4}
              width={chosen.box.width + 8}
              height={chosen.box.height + 8}
              fill="none"
              stroke={ACCENT}
              strokeWidth={1.5}
              strokeDasharray="5 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {drawing.nodes.map((entry) => (
            <rect
              key={entry.id}
              x={entry.box.x}
              y={entry.box.y}
              width={entry.box.width}
              height={entry.box.height}
              fill="transparent"
              stroke="none"
              style={{ pointerEvents: "auto", cursor: "grab" }}
              onPointerDown={(event) => {
                event.stopPropagation();
                try {
                  (event.target as Element).setPointerCapture(event.pointerId);
                } catch {
                  // a pointer that has already gone; the press still reads fine
                }
                onPick(entry.id);
                setShapes(false);
                setHeld({ id: entry.id, from: entry.at });
              }}
              onPointerMove={move}
              onPointerUp={up}
              onDoubleClick={() => {
                onPick(entry.id);
                setNaming(entry.id);
              }}
            />
          ))}
          {drawing.nodes.map((entry) => {
            const spot = growAt(entry);
            const shown = picked === entry.id;
            return (
              <circle
                key={`grow-${entry.id}`}
                cx={spot.x}
                cy={spot.y}
                r={size(7)}
                fill="#ffffff"
                stroke={ACCENT}
                strokeWidth={1.5}
                opacity={shown ? 1 : 0}
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: shown ? "auto" : "none", cursor: "pointer" }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => addChild(entry)}
              />
            );
          })}
          {chosen && (
            <path
              d={`M${growAt(chosen).x - size(4)},${growAt(chosen).y}h${size(8)}M${
                growAt(chosen).x
              },${growAt(chosen).y - size(4)}v${size(8)}`}
              stroke={ACCENT}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: "none" }}
            />
          )}
        </g>
      </svg>

      {/* what a branch can do, in a bar over the top of it */}
      {chosen && !held && (
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
          <div
            className="slab-tight pointer-events-auto absolute flex -translate-x-1/2 -translate-y-full items-stretch bg-white"
            style={onSheet({ x: chosen.at.x, y: chosen.box.y - 10 })}
          >
            <button
              type="button"
              title="Add a branch under this one"
              aria-label="Add a branch under this one"
              onClick={() => addChild(chosen)}
              className="border-r-2 border-edge p-1.5 text-ink transition-colors hover:bg-bone"
            >
              <Plus size={13} />
            </button>
            <button
              type="button"
              title="Change what this branch is drawn as"
              aria-label="Change what this branch is drawn as"
              onClick={() => setShapes((open) => !open)}
              className={`border-r-2 border-edge p-1.5 transition-colors ${
                shapes ? "bg-edge text-bone" : "text-ink hover:bg-bone"
              }`}
            >
              <Shapes size={13} />
            </button>
            <button
              type="button"
              title="Put a picture here instead of a shape"
              aria-label="Put a picture here instead of a shape"
              onClick={() => fileRef.current?.click()}
              className="border-r-2 border-edge p-1.5 text-ink transition-colors hover:bg-bone"
            >
              <ImageIcon size={13} />
            </button>
            <button
              type="button"
              title="Remove this branch"
              aria-label="Remove this branch"
              disabled={!parentOf(spec.root, chosen.id)}
              onClick={() => dropNode(chosen.id)}
              className="p-1.5 text-ink transition-colors hover:bg-alert-tint hover:text-alert disabled:opacity-30"
            >
              <Trash2 size={13} />
            </button>
          </div>

          {shapes && (
            <div
              className="slab-tight pointer-events-auto absolute w-40 -translate-x-1/2 bg-white"
              style={onSheet({ x: chosen.at.x, y: chosen.box.y + chosen.box.height + 10 })}
            >
              {[{ id: "" as const, name: "Default" }, ...MIND_SHAPES].map((entry) => (
                <button
                  key={entry.id || "default"}
                  type="button"
                  onClick={() => {
                    writeNode(chosen.id, {
                      shape: (entry.id || undefined) as MindShape | undefined,
                      image: undefined,
                    });
                    setShapes(false);
                  }}
                  className={`block w-full px-2.5 py-1.5 text-left font-mono text-[11.5px] transition-colors ${
                    (chosen.node.shape ?? "") === entry.id
                      ? "bg-edge text-bone"
                      : "text-ink hover:bg-bone"
                  }`}
                >
                  {entry.name}
                </button>
              ))}
            </div>
          )}

          {naming === chosen.id && (
            <input
              autoFocus
              defaultValue={chosen.node.label}
              aria-label="Name of this branch"
              onBlur={(event) => {
                writeNode(chosen.id, { label: event.target.value });
                setNaming(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  (event.target as HTMLInputElement).blur();
                }
                if (event.key === "Escape") {
                  setNaming(null);
                }
              }}
              className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 border-2 border-edge bg-white px-2 py-1 text-center font-mono text-[12px] text-ink outline-none"
              style={{ ...onSheet(chosen.at), width: Math.max(120, chosen.box.width * scale) }}
            />
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void takePicture(file);
          }
          event.target.value = "";
        }}
      />
    </>
  );
}
