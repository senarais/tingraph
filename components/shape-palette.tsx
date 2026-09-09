"use client";

import { MousePointerSquareDashed } from "lucide-react";
import BpmnGlyph from "@/components/bpmn-glyph";
import { PALETTE_GROUPS, PaletteItem } from "@/lib/palette";
import { DiagramCategory } from "@/lib/types";

interface ShapePaletteProps {
  category: DiagramCategory;
  onInsertCode: (item: PaletteItem) => void;
  onDropOnCanvas: (item: PaletteItem) => void;
}

export default function ShapePalette({
  category,
  onInsertCode,
  onDropOnCanvas,
}: ShapePaletteProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <p className="border-b border-rule px-4 py-3 text-[12px] leading-relaxed text-ink-soft">
        Click a shape to write it into the source; it reaches the sheet on the
        next <span className="whitespace-nowrap font-medium text-ink">Generate</span>.
        Use{" "}
        <span className="whitespace-nowrap font-medium text-ink">place on canvas</span>{" "}
        to drop one straight onto the sheet instead.
      </p>
      {PALETTE_GROUPS[category].map((group) => (
        <section key={group.title} className="border-b border-rule px-4 py-3">
          <h3 className="tick mb-2.5">{group.title}</h3>
          <ul className="grid grid-cols-2 gap-2">
            {group.items.map((item) => (
              <li key={item.type} className="group relative">
                <button
                  type="button"
                  onClick={() => onInsertCode(item)}
                  title={`Insert ${item.type} into the source`}
                  className="flex w-full flex-col items-start gap-2 rounded-md border border-rule bg-raised px-2.5 pb-2 pt-2.5 text-left transition-colors hover:border-blueprint hover:bg-blueprint-tint"
                >
                  <BpmnGlyph
                    type={item.type}
                    className="h-7 w-full text-ink [stroke-linejoin:round]"
                  />
                  <span className="w-full">
                    <span className="block truncate text-[12px] font-medium leading-tight text-ink">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] leading-tight text-ink-faint">
                      {item.hint}
                    </span>
                  </span>
                </button>
                {item.droppable && (
                  <button
                    type="button"
                    onClick={() => onDropOnCanvas(item)}
                    title={`Place ${item.label} on canvas`}
                    aria-label={`Place ${item.label} on canvas`}
                    className="absolute right-1.5 top-1.5 hidden rounded border border-rule bg-raised p-1 text-ink-soft transition-colors hover:border-blueprint hover:text-blueprint group-hover:block focus-visible:block"
                  >
                    <MousePointerSquareDashed size={13} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
