"use client";

import { useState } from "react";
import { Columns3, Minus, Pencil, Trash2 } from "lucide-react";
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
  onAddLane: (frame: FrameBox) => void;
  onRemoveLane: (frame: FrameBox) => void;
}

const RAIL_WIDTH = 30;

export default function FrameControls({
  frames,
  kind,
  view,
  onRename,
  onRemove,
  onAddLane,
  onRemoveLane,
}: FrameControlsProps) {
  const [naming, setNaming] = useState<FrameBox | null>(null);
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {frames.map((frame) => {
        const right = (frame.x + frame.width + view.scrollX) * view.zoom;
        const top = (frame.y + view.scrollY) * view.zoom;
        if (top > view.height || right < 0) {
          return null;
        }
        const left = Math.min(right + 8, view.width - RAIL_WIDTH - 8);
        return (
          <div
            key={frame.unit}
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
