"use client";

import { Fragment, useRef, useState } from "react";
import { Minus, Plus, Rows3, Trash2 } from "lucide-react";
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
  onRemoveLane: (pool: PoolBox) => void;
  onAddPool: (pool: PoolBox) => void;
  onRemove: (pool: PoolBox) => void;
  onResizeLane: (unit: string, boundary: number, at: number, settled: boolean) => void;
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
  onRemoveLane,
  onAddPool,
  onRemove,
  onResizeLane,
}: PoolControlsProps) {
  const root = useRef<HTMLDivElement>(null);
  const [sizing, setSizing] = useState<{ unit: string; boundary: number } | null>(null);

  const resize = (event: React.PointerEvent, settled: boolean) => {
    if (!sizing) {
      return;
    }
    const box = root.current?.getBoundingClientRect();
    if (!box) {
      return;
    }
    const y = (event.clientY - box.top) / view.zoom - view.scrollY;
    onResizeLane(sizing.unit, sizing.boundary, y, settled);
    if (settled) {
      setSizing(null);
    }
  };

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
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
          <Fragment key={pool.unit}>
            {pool.lanes.map((lane, boundary) => (
              <button
                key={`${pool.unit}-${boundary}`}
                type="button"
                title={
                  boundary === pool.lanes.length - 1
                    ? "Resize the pool and its last lane"
                    : "Resize the two lanes around this divider"
                }
                aria-label="Resize lane boundary"
                style={{
                  left: (pool.x + view.scrollX) * view.zoom,
                  top: (lane.bottom + view.scrollY) * view.zoom,
                  width: pool.width * view.zoom,
                }}
                className="group pointer-events-auto absolute h-3 -translate-y-1/2 cursor-row-resize touch-none"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setSizing({ unit: pool.unit, boundary });
                }}
                onPointerMove={(event) => resize(event, false)}
                onPointerUp={(event) => resize(event, true)}
              >
                <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-[#6b46ff] opacity-0 transition-opacity group-hover:opacity-70" />
              </button>
            ))}
            <div
              style={{ left, top: middle }}
              className="slab-tight pointer-events-auto absolute -translate-y-1/2 bg-white"
            >
              <button
                type="button"
                onClick={() => onAddLane(pool)}
                title="Add a lane to this pool"
                aria-label="Add a lane to this pool"
                className="block border-b-2 border-edge p-1.5 text-ink transition-colors hover:bg-bone"
              >
                <Rows3 size={14} />
              </button>
              <button
                type="button"
                onClick={() => onRemoveLane(pool)}
                title="Take the bottom lane off this pool"
                aria-label="Take the bottom lane off this pool"
                className="block border-b-2 border-edge p-1.5 text-ink transition-colors hover:bg-alert-tint hover:text-alert"
              >
                <Minus size={14} />
              </button>
              <button
                type="button"
                onClick={() => onAddPool(pool)}
                title="Add a pool below this one"
                aria-label="Add a pool below this one"
                className="block border-b-2 border-edge p-1.5 text-ink transition-colors hover:bg-bone"
              >
                <Plus size={14} />
              </button>
              <button
                type="button"
                onClick={() => onRemove(pool)}
                title="Delete this pool and everything in it"
                aria-label="Delete this pool and everything in it"
                className="block p-1.5 text-ink transition-colors hover:bg-alert-tint hover:text-alert"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
