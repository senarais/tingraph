"use client";

import { Plus, Rows3, Trash2 } from "lucide-react";
import type { PoolBox } from "@/lib/canvas/scene";

export interface CanvasView {
  scrollX: number;
  scrollY: number;
  zoom: number;
  width: number;
  height: number;
}

interface PoolControlsProps {
  pools: PoolBox[];
  view: CanvasView;
  onAddLane: (pool: PoolBox) => void;
  onAddPool: (pool: PoolBox) => void;
  onRemove: (pool: PoolBox) => void;
}

const RAIL_WIDTH = 30;

/**
 * A small rail beside every pool on the sheet. It lives in the DOM rather than
 * the drawing, so it never lands in an export.
 */
export default function PoolControls({
  pools,
  view,
  onAddLane,
  onAddPool,
  onRemove,
}: PoolControlsProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {pools.map((pool) => {
        const right = (pool.x + pool.width + view.scrollX) * view.zoom;
        const top = (pool.y + view.scrollY) * view.zoom;
        const height = pool.height * view.zoom;
        const middle = top + height / 2;
        if (middle < 0 || middle > view.height || right < 0) {
          return null;
        }
        const left = Math.min(right + 8, view.width - RAIL_WIDTH - 8);
        return (
          <div
            key={pool.unit}
            style={{ left, top: middle }}
            className="pointer-events-auto absolute -translate-y-1/2 rounded-md border border-rule bg-raised p-0.5 shadow-sm"
          >
            <button
              type="button"
              onClick={() => onAddLane(pool)}
              title="Add a lane to this pool"
              aria-label="Add a lane to this pool"
              className="block rounded p-1 text-ink-soft transition-colors hover:bg-blueprint-tint hover:text-blueprint"
            >
              <Rows3 size={14} />
            </button>
            <button
              type="button"
              onClick={() => onAddPool(pool)}
              title="Add a pool below this one"
              aria-label="Add a pool below this one"
              className="block rounded p-1 text-ink-soft transition-colors hover:bg-blueprint-tint hover:text-blueprint"
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              onClick={() => onRemove(pool)}
              title="Delete this pool and everything in it"
              aria-label="Delete this pool and everything in it"
              className="block rounded p-1 text-ink-soft transition-colors hover:bg-alert-tint hover:text-alert"
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
