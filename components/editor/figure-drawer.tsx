"use client";

import { Plus } from "lucide-react";
import type { FigureOnSheet } from "@/lib/canvas/scene";
import type { FigureSpec } from "@/lib/figures/spec";
import { figureDef } from "@/lib/figures/registry";
import { ResetButton } from "@/components/editor/figure-fields";
import { isChart, isFigure, type DiagramCategory } from "@/lib/types";
import ChartDrawer from "@/components/editor/chart-drawer";
import MindDrawer from "@/components/editor/mind-drawer";
import MatrixDrawer from "@/components/editor/matrix-drawer";
import VennDrawer from "@/components/editor/venn-drawer";
import FishboneDrawer from "@/components/editor/fishbone-drawer";
import SequenceDrawer from "@/components/editor/sequence-drawer";
import { SlabButton } from "@/components/editor/ui";

/**
 * The panel for whatever figure is on the sheet, and the one place that knows
 * which figure has which panel. Every one of them is built on its own terms —
 * a fishbone's panel is a list of causes, a Venn's is a list of regions — so
 * there is nothing to share here beyond picking the right one.
 */

interface FigureDrawerProps {
  category: DiagramCategory;
  figure: FigureOnSheet | null;
  onChange: (spec: FigureSpec) => void;
  onAdd: () => void;
  picked: string | null;
  onPick: (id: string | null) => void;
}

export default function FigureDrawer({
  category,
  figure,
  onChange,
  onAdd,
  picked,
  onPick,
}: FigureDrawerProps) {
  if (!figure) {
    const def = figureDef(category);
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <p className="text-[12px] leading-relaxed text-ink-soft">
          Nothing on the sheet yet. Write it in the source and press Generate,
          or drop a blank one here and build it up with these controls.
        </p>
        {isFigure(category) && def && (
          <SlabButton onClick={onAdd} tone="solid" className="mt-3">
            <Plus size={13} />
            Add {isChart(category) ? `a ${category} chart` : `a ${def.label.toLowerCase()}`}
          </SlabButton>
        )}
      </div>
    );
  }

  const { spec } = figure;
  const def = figureDef(spec.kind);

  const panel = () => {
    switch (spec.kind) {
      case "bar":
      case "line":
      case "pie":
      case "scatter":
        return <ChartDrawer spec={spec} onChange={onChange} />;
      case "mind":
        return (
          <MindDrawer spec={spec} onChange={onChange} picked={picked} onPick={onPick} />
        );
      case "matrix":
        return <MatrixDrawer spec={spec} onChange={onChange} />;
      case "venn":
        return <VennDrawer spec={spec} onChange={onChange} />;
      case "sequence":
        return <SequenceDrawer spec={spec} onChange={onChange} />;
      default:
        return <FishboneDrawer spec={spec} onChange={onChange} />;
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {panel()}
      {def && (
        <ResetButton
          what={def.label.toLowerCase()}
          onReset={() => {
            onPick(null);
            onChange(def.blank());
          }}
        />
      )}
    </div>
  );
}
