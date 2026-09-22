"use client";

import { Maximize, Minus, Plus, Redo2, Undo2 } from "lucide-react";

/**
 * History, zoom and framing, in the corner of the sheet. Excalidraw's own
 * footer is gone with the rest of its chrome, so the sheet carries these.
 */
export default function CanvasTools({
  zoom,
  onZoom,
  onFit,
  onHistory,
  disabled,
}: {
  zoom: number;
  onZoom: (factor: number) => void;
  onFit: () => void;
  onHistory: (direction: "undo" | "redo") => void;
  disabled: boolean;
}) {
  return (
    <div className="slab-tight absolute bottom-4 left-4 z-10 flex items-stretch bg-white">
      <button
        type="button"
        onClick={() => onHistory("undo")}
        title="Undo"
        aria-label="Undo"
        className="border-r-2 border-edge px-2 py-1.5 text-ink transition-colors hover:bg-bone"
      >
        <Undo2 size={14} />
      </button>
      <button
        type="button"
        onClick={() => onHistory("redo")}
        title="Redo"
        aria-label="Redo"
        className="border-r-2 border-edge px-2 py-1.5 text-ink transition-colors hover:bg-bone"
      >
        <Redo2 size={14} />
      </button>
      <button
        type="button"
        onClick={() => onZoom(1 / 1.2)}
        title="Zoom out"
        aria-label="Zoom out"
        className="border-r-2 border-edge px-2 py-1.5 text-ink transition-colors hover:bg-bone"
      >
        <Minus size={14} />
      </button>
      <span className="grid w-14 place-items-center border-r-2 border-edge font-mono text-[11.5px] text-ink">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        onClick={() => onZoom(1.2)}
        title="Zoom in"
        aria-label="Zoom in"
        className="border-r-2 border-edge px-2 py-1.5 text-ink transition-colors hover:bg-bone"
      >
        <Plus size={14} />
      </button>
      <button
        type="button"
        onClick={onFit}
        disabled={disabled}
        title="Fit the drawing to the sheet"
        aria-label="Fit the drawing to the sheet"
        className="px-2 py-1.5 text-ink transition-colors hover:bg-bone disabled:opacity-40"
      >
        <Maximize size={14} />
      </button>
    </div>
  );
}
