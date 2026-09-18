"use client";

import { Fragment, useRef, useState } from "react";
import { Columns3, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import type { FrameBox } from "@/lib/canvas/frames";
import { Rename } from "@/components/editor/figure-handles";
import type { CanvasView } from "@/components/editor/pool-controls";

/**
 * The rail beside a frame: a use case boundary, or the frame an activity's
 * partitions are ruled inside.
 *
 * A pool has its own rail already (`pool-controls.tsx`) and offers lanes; a
 * frame is deliberately not a pool. A boundary has no lanes to offer at all,
 * and an activity's partitions are columns, so they are added along the
 * right-hand edge rather than the bottom. The two cases are close enough to
 * share the hardware and far enough apart to need different keys on it.
 */

interface FrameControlsProps {
  frames: FrameBox[];
  /** a boundary is named and deleted; partitions are added and taken off */
  kind: "boundary" | "partitions";
  view: CanvasView;
  onRename: (unit: string, label: string) => void;
  onRemove: (frame: FrameBox) => void;
  onAddFrame: (frame: FrameBox) => void;
  onAddLane: (frame: FrameBox) => void;
  onRemoveLane: (frame: FrameBox) => void;
  onResizeLane: (unit: string, boundary: number, at: number, settled: boolean) => void;
}

const RAIL_WIDTH = 30;

export default function FrameControls({
  frames,
  kind,
  view,
  onRename,
  onRemove,
  onAddFrame,
  onAddLane,
  onRemoveLane,
  onResizeLane,
}: FrameControlsProps) {
  const [naming, setNaming] = useState<FrameBox | null>(null);
  const [sizing, setSizing] = useState<{ unit: string; boundary: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const resize = (event: React.PointerEvent, settled: boolean) => {
    if (!sizing) {
      return;
    }
    const box = root.current?.getBoundingClientRect();
    if (!box) {
      return;
    }
    const x = (event.clientX - box.left) / view.zoom - view.scrollX;
    onResizeLane(sizing.unit, sizing.boundary, x, settled);
    if (settled) {
      setSizing(null);
    }
  };

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {frames.map((frame) => {
        const right = (frame.x + frame.width + view.scrollX) * view.zoom;
        const top = (frame.y + view.scrollY) * view.zoom;
        if (top > view.height || right < 0) {
          return null;
        }
        const left = Math.min(right + 8, view.width - RAIL_WIDTH - 8);
        return (
          <Fragment key={frame.unit}>
            {kind === "partitions" &&
              frame.lanes.map((lane, boundary) => (
                <button
                  key={`${frame.unit}-${boundary}`}
                  type="button"
                  title={
                    boundary === frame.lanes.length - 1
                      ? "Resize the activity pool and its last partition"
                      : "Resize the two partitions around this divider"
                  }
                  aria-label="Resize partition boundary"
                  style={{
                    left: (lane.x + lane.width + view.scrollX) * view.zoom,
                    top,
                    height: frame.height * view.zoom,
                  }}
                  className="group pointer-events-auto absolute w-3 -translate-x-1/2 cursor-col-resize touch-none"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setSizing({ unit: frame.unit, boundary });
                  }}
                  onPointerMove={(event) => resize(event, false)}
                  onPointerUp={(event) => resize(event, true)}
                >
                  <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-[#6b46ff] opacity-0 transition-opacity group-hover:opacity-70" />
                </button>
              ))}
            <div
              style={{ left, top: Math.max(8, top) }}
              className="slab-tight pointer-events-auto absolute bg-white"
            >
            <button
              type="button"
              onClick={() => setNaming(frame)}
              title="Rename this frame"
              aria-label="Rename this frame"
              className="block border-b-2 border-edge p-1.5 text-ink transition-colors hover:bg-bone"
            >
              <Pencil size={14} />
            </button>
            {kind === "partitions" && (
              <>
                <button
                  type="button"
                  onClick={() => onAddLane(frame)}
                  title="Add a partition on the right"
                  aria-label="Add a partition on the right"
                  className="block border-b-2 border-edge p-1.5 text-ink transition-colors hover:bg-bone"
                >
                  <Columns3 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveLane(frame)}
                  title="Take the right-hand partition off"
                  aria-label="Take the right-hand partition off"
                  className="block border-b-2 border-edge p-1.5 text-ink transition-colors hover:bg-alert-tint hover:text-alert"
                >
                  <Minus size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => onAddFrame(frame)}
                  title="Add an activity pool below"
                  aria-label="Add an activity pool below"
                  className="block border-b-2 border-edge p-1.5 text-ink transition-colors hover:bg-bone"
                >
                  <Plus size={14} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => onRemove(frame)}
              title={
                kind === "boundary"
                  ? "Delete this boundary and leave what is inside it"
                  : "Delete this frame and its partitions"
              }
              aria-label="Delete this frame"
              className="block p-1.5 text-ink transition-colors hover:bg-alert-tint hover:text-alert"
            >
              <Trash2 size={14} />
            </button>
            </div>
          </Fragment>
        );
      })}
      {naming && (
        <div className="pointer-events-auto absolute inset-0">
          <Rename
            view={view}
            at={{ x: naming.x + naming.width / 2, y: naming.y + naming.head / 2 }}
            width={Math.min(320, naming.width)}
            value={naming.label}
            onCommit={(value) => {
              onRename(naming.unit, value.trim());
              setNaming(null);
            }}
            onCancel={() => setNaming(null)}
          />
        </div>
      )}
    </div>
  );
}
