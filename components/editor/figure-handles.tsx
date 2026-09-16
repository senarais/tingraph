"use client";

import { useRef, type ReactNode } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { CanvasView } from "@/components/editor/pool-controls";

/**
 * The hardware every figure's handles are built from.
 *
 * Not diagram logic: a button hung over a point on the sheet is a button hung
 * over a point on the sheet, whether the point is a bone, a matrix cell or a
 * ring. What the handle *means* stays in the notation's own file — this is
 * only what it is made of, so the sheet feels the same whichever figure is on
 * it.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Rect extends Pt {
  width: number;
  height: number;
}

export const ACCENT = "#6b46ff";

/** Where a point on the sheet lands on the screen. */
export function spotOn(view: CanvasView, at: Pt): { left: number; top: number } {
  return {
    left: (at.x + view.scrollX) * view.zoom,
    top: (at.y + view.scrollY) * view.zoom,
  };
}

/** The pointer, in sheet units. */
export function useSceneAt(
  api: ExcalidrawImperativeAPI,
  svg: React.RefObject<SVGSVGElement | null>,
) {
  return (event: { clientX: number; clientY: number }): Pt => {
    const rect = svg.current?.getBoundingClientRect();
    const state = api.getAppState();
    return {
      x: (event.clientX - (rect?.left ?? 0)) / state.zoom.value - state.scrollX,
      y: (event.clientY - (rect?.top ?? 0)) / state.zoom.value - state.scrollY,
    };
  };
}

/** The layer the handles live on: over the sheet, out of every export. */
export function HandleLayer({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {children}
    </div>
  );
}

/**
 * A part of a figure the pointer can reach: a bone, a matrix cell, a ring's name.
 * Nothing is drawn for it — the mark underneath is the drawing — so it only
 * takes the press and says which part was pressed.
 */
export function HitBox({
  box,
  held,
  label,
  onPick,
  onRename,
}: {
  box: Rect;
  held: boolean;
  label: string;
  onPick: () => void;
  onRename?: () => void;
}) {
  return (
    <rect
      x={box.x - 2}
      y={box.y - 2}
      width={Math.max(8, box.width + 4)}
      height={Math.max(8, box.height + 4)}
      fill="transparent"
      strokeWidth={1.5}
      strokeDasharray="5 3"
      vectorEffect="non-scaling-stroke"
      // the part is the drawing underneath; the outline only says it can be
      // reached, which is why it shows under the pointer and stays when held
      className={held ? "stroke-[#6b46ff]" : "stroke-transparent hover:stroke-[#6b46ff99]"}
      aria-label={label}
      style={{ pointerEvents: "auto", cursor: onRename ? "text" : "pointer" }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPick();
      }}
      onDoubleClick={onRename}
    />
  );
}

/** One small key on the sheet: the `+` and `−` that grow and shrink a figure. */
export function SheetKey({
  view,
  at,
  label,
  onClick,
  children,
}: {
  view: CanvasView;
  at: Pt;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      onPointerDown={(event) => event.stopPropagation()}
      className="slab-tight pointer-events-auto absolute grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center bg-white text-ink transition-colors hover:bg-bone"
      style={spotOn(view, at)}
    >
      {children}
    </button>
  );
}

/**
 * Everything a picked part can do, in a bar beside it. It sits over the top of
 * the part by default; a part in a stack of others — one row of a table — asks
 * for `beside` instead, or the bar would cover the rows above it.
 */
export function PartBar({
  view,
  at,
  align = "above",
  children,
}: {
  view: CanvasView;
  at: Pt;
  align?: "above" | "beside";
  children: ReactNode;
}) {
  return (
    <div
      className={`slab-tight pointer-events-auto absolute flex items-stretch bg-white ${
        align === "above"
          ? "-translate-x-1/2 -translate-y-full"
          : "-translate-y-1/2"
      }`}
      style={spotOn(view, at)}
    >
      {children}
    </div>
  );
}

/** One press inside a part's bar. */
export function BarKey({
  label,
  onClick,
  disabled,
  danger,
  last,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={(event) => event.stopPropagation()}
      className={`p-1.5 transition-colors disabled:opacity-30 ${
        last ? "" : "border-r-2 border-edge"
      } ${danger ? "text-ink hover:bg-alert-tint hover:text-alert" : "text-ink hover:bg-bone"}`}
    >
      {children}
    </button>
  );
}

/**
 * Writing a name in place, over the mark it belongs to. A figure's captions
 * are cut from its spec, so Excalidraw's own caption editor would lose them at
 * the next redraw; this writes the spec instead.
 */
export function Rename({
  view,
  at,
  width,
  value,
  onCommit,
  onCancel,
}: {
  view: CanvasView;
  at: Pt;
  width: number;
  value: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const done = useRef(false);
  return (
    <input
      autoFocus
      defaultValue={value}
      aria-label="Rename this part"
      onFocus={(event) => event.target.select()}
      onBlur={(event) => {
        if (!done.current) {
          done.current = true;
          onCommit(event.target.value);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          (event.target as HTMLInputElement).blur();
        }
        if (event.key === "Escape") {
          done.current = true;
          onCancel();
        }
        event.stopPropagation();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 border-2 border-edge bg-white px-2 py-1 text-center font-mono text-[12px] text-ink outline-none"
      style={{
        ...spotOn(view, at),
        width: Math.max(120, width * view.zoom),
      }}
    />
  );
}
