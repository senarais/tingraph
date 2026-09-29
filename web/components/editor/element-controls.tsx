"use client";

import type { ElementOnSheet } from "@/lib/canvas/elements";
import type { FrameBox } from "@/lib/canvas/frames";
import type { DiagramCategory, DSLNode } from "@/lib/types";
import ErdHandles from "@/components/editor/erd-handles";
import ArchitectureImage from "@/components/editor/architecture-image";
import FrameControls from "@/components/editor/frame-controls";
import type { CanvasView } from "@/components/editor/pool-controls";

/**
 * The handles a settable graph puts on the sheet, and the one place that knows
 * which notation has which. The twin of `figure-controls.tsx`: a table is built
 * row by row, a boundary is named and sized, an activity's partitions are added
 * along the right — so this only picks the right kit and hands it the sheet.
 */

interface ElementControlsProps {
  category: DiagramCategory;
  elements: ElementOnSheet[];
  frames: FrameBox[];
  /** the element the reader has hold of, when exactly one is held */
  held: string | null;
  picked: string | null;
  onPick: (id: string | null) => void;
  view: CanvasView;
  onChange: (unit: string, spec: DSLNode) => void;
  onRenameFrame: (unit: string, label: string) => void;
  onRemoveFrame: (frame: FrameBox) => void;
  onAddFrame: (frame: FrameBox) => void;
  onAddLane: (frame: FrameBox) => void;
  onRemoveLane: (frame: FrameBox) => void;
  onResizeLane: (unit: string, boundary: number, at: number, settled: boolean) => void;
  onImage: (unit: string, file: File) => void;
  imageMessage: string;
}

export default function ElementControls({
  category,
  elements,
  frames,
  held,
  picked,
  onPick,
  view,
  onChange,
  onRenameFrame,
  onRemoveFrame,
  onAddFrame,
  onAddLane,
  onRemoveLane,
  onResizeLane,
  onImage,
  imageMessage,
}: ElementControlsProps) {
  if (category === "architecture") {
    const selected = elements.find((entry) => entry.unit === held);
    if (!selected) return null;
    return <div className="pointer-events-none absolute z-20" style={{
      left: (selected.box.x + view.scrollX) * view.zoom,
      top: (selected.box.y + view.scrollY) * view.zoom - 36,
    }}><div className="pointer-events-auto flex items-center gap-1 border border-edge bg-white p-0.5 shadow-sm">
      <select aria-label="Change component type" value={selected.spec.type} onChange={(event) => onChange(selected.unit, { ...selected.spec, type: event.target.value as DSLNode["type"], image: undefined })} className="max-w-28 bg-white px-1 py-1 text-[11px] capitalize text-ink">
        {["zone", "client", "service", "database", "storage", "queue", "cloud", "external"].map((type) => <option key={type} value={type}>{type}</option>)}
      </select>
      {selected.spec.type !== "zone" && <ArchitectureImage onFile={(file) => onImage(selected.unit, file)} />}
      {selected.spec.image && <button type="button" onClick={() => onChange(selected.unit, { ...selected.spec, image: undefined })} className="px-1 text-[11px] underline">Remove image</button>}
    </div>{imageMessage && <p role="alert" className="bg-white px-2 py-1 text-[11px] text-alert">{imageMessage}</p>}</div>;
  }
  if (category === "erd") {
    return (
      <ErdHandles
        tables={elements}
        held={held}
        picked={picked}
        onPick={onPick}
        view={view}
        onChange={onChange}
      />
    );
  }
  if (category === "usecase" || category === "activity") {
    return (
      <FrameControls
        frames={frames}
        kind={category === "usecase" ? "boundary" : "partitions"}
        view={view}
        onRename={onRenameFrame}
        onRemove={onRemoveFrame}
        onAddFrame={onAddFrame}
        onAddLane={onAddLane}
        onRemoveLane={onRemoveLane}
        onResizeLane={onResizeLane}
      />
    );
  }
  return null;
}
