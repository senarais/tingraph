"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Check, Plus, Search } from "lucide-react";
import BpmnGlyph from "@/components/bpmn-glyph";
import { DiagramArt } from "@/components/site/diagram-art";
import { useBlankDragImage } from "@/components/editor/shape-drawer";
import { Segmented, SlabButton, Tick } from "@/components/editor/ui";
import { CONNECTORS } from "@/lib/connectors";
import { ACCENTS, FAMILIES, READY_DIAGRAMS, type DiagramFamily } from "@/lib/diagrams";
import { figureDef } from "@/lib/figures/registry";
import { PALETTE_GROUPS, SHAPE_DRAG_TYPE, type PaletteItem } from "@/lib/palette";
import { STRUCTURES } from "@/lib/studio";
import { STARTERS, TEMPLATES, TEMPLATE_LABELS } from "@/lib/templates";
import { isFigure, type DiagramCategory } from "@/lib/types";

/**
 * Studio's library: every notation Tingraph draws, and for the one in hand,
 * what it is drawn with.
 *
 * Two levels, so neither is crowded: the notations, searchable and filtered
 * by what they show; and one notation, opened on two separate tabs — its
 * shapes, placed one at a time, and its examples, whole drawings placed
 * beside whatever is already on the sheet.
 */

interface LibraryDrawerProps {
  /** the notation in hand */
  notation: DiagramCategory;
  onNotation: (notation: DiagramCategory) => void;
  /** one shape dropped in the middle of the sheet */
  onPlace: (item: PaletteItem) => void;
  /** a shape picked up and let go of again: the sheet draws the preview */
  onDrag: (item: PaletteItem | null) => void;
  /** a pool, a boundary or partitions, drawn from their own small source */
  onStructure: (source: string) => void;
  /** an empty figure of the notation in hand */
  onFigure: () => void;
  /** a whole example drawn beside what is on the sheet */
  onExample: (source: string) => void;
}

type Tab = "shapes" | "examples";

/** The title an example source opens with, for its card. */
function titleOf(source: string): string {
  return source.match(/^\s*\w+\s+"((?:[^"\\]|\\.)*)"/)?.[1] ?? "Example";
}

export default function LibraryDrawer(props: LibraryDrawerProps) {
  const [view, setView] = useState<"notations" | "notation">("notation");
  const [tab, setTab] = useState<Tab>("shapes");

  if (view === "notations") {
    return (
      <NotationList
        current={props.notation}
        onPick={(notation) => {
          props.onNotation(notation);
          setView("notation");
          setTab("shapes");
        }}
      />
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b-2 border-edge p-3">
        <button
          type="button"
          onClick={() => setView("notations")}
          className="flex items-center gap-1.5 text-[11px] text-ink-faint transition-colors hover:text-ink"
        >
          <ArrowLeft size={12} aria-hidden="true" />
          All notations
        </button>
        <div className="mt-2 flex items-baseline gap-2">
          <h3 className="min-w-0 truncate text-[14px] font-semibold tracking-tight text-ink">
            {TEMPLATE_LABELS[props.notation]}
          </h3>
          <code className="border border-edge bg-white px-1.5 py-0.5 text-[10.5px] text-ink">
            {props.notation}
          </code>
        </div>
        <div className="mt-3">
          <Segmented
            size="sm"
            options={[
              { value: "shapes" as const, label: "Shapes" },
              { value: "examples" as const, label: "Examples" },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "shapes" ? <Shapes {...props} /> : <Examples {...props} />}
      </div>
    </div>
  );
}

function NotationList({
  current,
  onPick,
}: {
  current: DiagramCategory;
  onPick: (notation: DiagramCategory) => void;
}) {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<DiagramFamily | "all">("all");
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return READY_DIAGRAMS.filter(
      (kind) =>
        kind.keyword &&
        (family === "all" || kind.family === family) &&
        (!needle ||
          `${kind.name} ${kind.keyword} ${kind.summary} ${kind.parts.join(" ")}`
            .toLowerCase()
            .includes(needle)),
    );
  }, [query, family]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2.5 border-b-2 border-edge p-3">
        <label className="flex items-center gap-2 border-2 border-edge bg-white px-2">
          <Search size={13} className="shrink-0 text-ink-faint" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notations"
            aria-label="Search notations"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[12px] text-ink placeholder:text-ink-faint"
          />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="What it shows">
          {(["all", ...FAMILIES] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              aria-pressed={family === entry}
              onClick={() => setFamily(entry)}
              className={`border-2 border-edge px-2 py-0.5 text-[11px] transition-colors ${
                family === entry ? "bg-edge text-bone" : "bg-white text-ink hover:bg-bone"
              }`}
            >
              {entry === "all" ? "All" : entry}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {shown.length === 0 ? (
          <p className="text-[12px] text-ink-faint">No notation matches.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {shown.map((kind) => {
              const notation = kind.keyword as DiagramCategory;
              const held = notation === current;
              return (
                <li key={kind.id}>
                  <button
                    type="button"
                    onClick={() => onPick(notation)}
                    aria-pressed={held}
                    title={kind.summary}
                    className={`slab-tight press flex w-full flex-col overflow-hidden text-left ${
                      held ? "bg-edge text-bone" : "bg-white text-ink"
                    }`}
                  >
                    <span
                      className="flex h-16 w-full items-center justify-center border-b-2 border-edge px-2 py-1.5"
                      style={{ backgroundColor: ACCENTS[kind.accent].wash }}
                    >
                      <DiagramArt id={kind.id} accent={kind.accent} className="h-full w-full" />
                    </span>
                    <span className="flex w-full items-center gap-1.5 px-2 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium leading-tight">
                        {kind.name}
                      </span>
                      {held && <Check size={12} aria-hidden="true" className="shrink-0" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Shapes({ notation, onPlace, onDrag, onStructure, onFigure }: LibraryDrawerProps) {
  const blank = useBlankDragImage();
  if (isFigure(notation)) {
    const name = TEMPLATE_LABELS[notation].toLowerCase();
    const panel = figureDef(notation)?.label ?? "figure";
    return (
      <section className="p-3">
        <p className="text-[12px] leading-relaxed text-ink-soft">
          A {name} is one object, drawn from its own settings. Place an empty one, then fill it
          in from the {panel} panel in the rail or with its handles on the sheet.
        </p>
        <SlabButton tone="solid" className="mt-3 w-full" onClick={onFigure}>
          <Plus size={13} />
          Add {name}
        </SlabButton>
      </section>
    );
  }
  const structures = STRUCTURES[notation] ?? {};
  const lines = CONNECTORS[notation].filter((kind) => !kind.hidden);
  return (
    <>
      <p className="border-b-2 border-edge px-3 py-2.5 text-[12px] leading-relaxed text-ink-soft">
        Drag a shape onto the sheet, or click it to drop one in the middle.
      </p>
      {PALETTE_GROUPS[notation].map((group) => {
        const items = group.items.filter((item) => item.droppable || structures[item.type]);
        if (items.length === 0) return null;
        return (
          <section key={group.title} className="border-b-2 border-edge p-3">
            <Tick className="mb-2.5 block">{group.title}</Tick>
            <ul className="grid grid-cols-2 gap-2">
              {items.map((item) => {
                const structure = item.droppable ? null : structures[item.type];
                return (
                  <li key={item.type} className={structure ? "col-span-2" : undefined}>
                    <button
                      type="button"
                      draggable={!structure}
                      onDragStart={
                        structure
                          ? undefined
                          : (event) => {
                              event.dataTransfer.setData(SHAPE_DRAG_TYPE, item.type);
                              event.dataTransfer.effectAllowed = "copy";
                              if (blank) event.dataTransfer.setDragImage(blank, 0, 0);
                              onDrag(item);
                            }
                      }
                      onDragEnd={structure ? undefined : () => onDrag(null)}
                      onClick={() => (structure ? onStructure(structure.source) : onPlace(item))}
                      title={structure ? `Place a ${structure.label.toLowerCase()}` : `Place ${item.label} on the sheet`}
                      className={`slab-tight press flex w-full bg-white text-left ${
                        structure
                          ? "items-center gap-2 px-2.5 py-2"
                          : "cursor-grab flex-col items-start gap-2 px-2.5 pb-2 pt-2.5 active:cursor-grabbing"
                      }`}
                    >
                      <BpmnGlyph
                        type={item.type}
                        className={`${structure ? "h-6 w-9 shrink-0" : "h-7 w-full"} text-ink [stroke-linejoin:round]`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium leading-tight text-ink">
                          {structure ? structure.label : item.label}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] leading-tight text-ink-faint">
                          {structure ? "more come from its own controls" : item.hint}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {lines.length > 0 && (
        <section className="p-3">
          <Tick className="mb-2 block">Connectors</Tick>
          <p className="text-[11.5px] leading-relaxed text-ink-soft">
            Join two shapes with the Connector in the rail:{" "}
            {lines.map((kind) => kind.label.toLowerCase()).join(", ")}.
          </p>
        </section>
      )}
    </>
  );
}

function Examples({ notation, onExample }: LibraryDrawerProps) {
  const examples = [
    { id: "template", label: `${TEMPLATE_LABELS[notation]} example`, source: TEMPLATES[notation] },
    ...STARTERS.filter((starter) => starter.category === notation).map((starter) => ({
      id: starter.id,
      label: starter.label,
      source: starter.source,
    })),
  ];
  return (
    <>
      <p className="border-b-2 border-edge px-3 py-2.5 text-[12px] leading-relaxed text-ink-soft">
        A whole drawing to start from, placed beside what is already on the sheet. It is yours to
        edit; nothing else on the sheet changes.
      </p>
      <ul className="space-y-2 p-3">
        {examples.map((example) => (
          <li key={example.id} className="slab-tight flex items-center gap-3 bg-white px-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium leading-tight text-ink">
                {example.label}
              </span>
              <span className="mt-0.5 block truncate text-[11px] leading-tight text-ink-faint">
                {titleOf(example.source)}
              </span>
            </span>
            <SlabButton onClick={() => onExample(example.source)} title="Place this example on the sheet">
              <Plus size={13} />
              Insert
            </SlabButton>
          </li>
        ))}
      </ul>
    </>
  );
}
