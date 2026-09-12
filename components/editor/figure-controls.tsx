"use client";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { FigureOnSheet } from "@/lib/canvas/scene";
import type { FigureSpec } from "@/lib/figures/spec";
import ChartControls from "@/components/editor/chart-controls";
import MindControls from "@/components/editor/mind-controls";
import MatrixHandles from "@/components/editor/matrix-handles";
import VennHandles from "@/components/editor/venn-handles";
import FishboneHandles from "@/components/editor/fishbone-handles";
import SequenceHandles from "@/components/editor/sequence-handles";
import type { CanvasView } from "@/components/editor/pool-controls";

/**
 * The handles every figure puts on the sheet, and the one place that knows
 * which figure has which. Each notation's gestures are its own — a bar chart
 * is dragged by its ends, a mind map by its branches, a fishbone is built bone
 * by bone — so this only picks the right kit and hands it the spec.
 */

interface FigureControlsProps {
  api: ExcalidrawImperativeAPI | null;
  figure: FigureOnSheet | null;
  view: CanvasView;
  /** the part of the figure the reader has hold of, for the figures that have parts */
  picked: string | null;
  onPick: (id: string | null) => void;
  onChange: (spec: FigureSpec, settled: boolean) => void;
}

export default function FigureControls({
  api,
  figure,
  view,
  picked,
  onPick,
  onChange,
}: FigureControlsProps) {
  if (!api || !figure) {
    return null;
  }
  const { spec, box } = figure;
  switch (spec.kind) {
    case "bar":
    case "line":
    case "pie":
    case "scatter":
      return (
        <ChartControls api={api} spec={spec} box={box} view={view} onChange={onChange} />
      );
    case "mind":
      return (
        <MindControls
          api={api}
          spec={spec}
          box={box}
          view={view}
          picked={picked}
          onPick={onPick}
          onChange={onChange}
        />
      );
    case "matrix":
      return (
        <MatrixHandles
          api={api}
          spec={spec}
          box={box}
          view={view}
          picked={picked}
          onPick={onPick}
          onChange={onChange}
        />
      );
    case "venn":
      return (
        <VennHandles
          api={api}
          spec={spec}
          box={box}
          view={view}
          picked={picked}
          onPick={onPick}
          onChange={onChange}
        />
      );
    case "sequence":
      return (
        <SequenceHandles
          api={api}
          spec={spec}
          box={box}
          view={view}
          picked={picked}
          onPick={onPick}
          onChange={onChange}
        />
      );
    default:
      return (
        <FishboneHandles
          spec={spec}
          box={box}
          view={view}
          picked={picked}
          onPick={onPick}
          onChange={onChange}
        />
      );
  }
}
