"use client";

import { ChevronRight } from "lucide-react";
import BpmnGlyph from "@/components/bpmn-glyph";
import { PALETTE_GROUPS, PaletteItem, SHAPE_DRAG_TYPE } from "@/lib/palette";
import { DiagramCategory } from "@/lib/types";
import { Tick } from "@/components/editor/ui";

interface ShapeDrawerProps {
  category: DiagramCategory;
  /** drop one at the middle of the sheet, for a reader who would rather click */
  onPlace: (item: PaletteItem) => void;
  /** a block that only makes sense written down, such as a pool or a lane */
  onWrite: (item: PaletteItem) => void;
}

/**
 * The shapes this notation draws, and nothing else. Drag one onto the sheet,
 * or click it to have it land in the middle. A pool and a lane are structure
 * rather than shape, so those are written into the source instead.
 */
export default function ShapeDrawer({
  category,
  onPlace,
  onWrite,
}: ShapeDrawerProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <p className="border-b-2 border-edge px-3 py-2.5 text-[12px] leading-relaxed text-ink-soft">
        Drag a shape onto the sheet, or click it to drop one in the middle.
      </p>
      {PALETTE_GROUPS[category].map((group) => (
        <section key={group.title} className="border-b-2 border-edge p-3">
          <Tick className="mb-2.5 block">{group.title}</Tick>
          <ul className="grid grid-cols-2 gap-2">
            {group.items.map((item) =>
              item.droppable ? (
                <li key={item.type}>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(SHAPE_DRAG_TYPE, item.type);
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => onPlace(item)}
                    title={`Place ${item.label} on the sheet`}
                    className="slab-tight press flex w-full cursor-grab flex-col items-start gap-2 bg-white px-2.5 pb-2 pt-2.5 text-left active:cursor-grabbing"
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
                </li>
              ) : (
                <li key={item.type} className="col-span-2">
                  <button
                    type="button"
                    onClick={() => onWrite(item)}
                    title={`Write a ${item.label.toLowerCase()} into the source`}
                    className="slab-tight press flex w-full items-center gap-2 bg-white px-2.5 py-2 text-left"
                  >
                    <BpmnGlyph
                      type={item.type}
                      className="h-6 w-9 shrink-0 text-ink [stroke-linejoin:round]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium leading-tight text-ink">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] leading-tight text-ink-faint">
                        written into the source
                      </span>
                    </span>
                    <ChevronRight size={14} className="shrink-0 text-ink-faint" />
                  </button>
                </li>
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
