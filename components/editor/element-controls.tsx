"use client";

import type { ElementOnSheet } from "@/lib/canvas/elements";
import type { FrameBox } from "@/lib/canvas/frames";
import type { DiagramCategory, DSLNode } from "@/lib/types";
import ErdHandles from "@/components/editor/erd-handles";
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
  onAddLane: (frame: FrameBox) => void;
  onRemoveLane: (frame: FrameBox) => void;
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
  onAddLane,
  onRemoveLane,
}: ElementControlsProps) {
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
        onAddLane={onAddLane}
        onRemoveLane={onRemoveLane}
      />
    );
  }
  return null;
}
