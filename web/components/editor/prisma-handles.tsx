"use client";

import { useState } from "react";
import { Minus, PanelRight, Pencil, Plus, Rows3, Trash2 } from "lucide-react";
import { grownPrisma, planPrisma } from "@/lib/prisma/build-prisma";
import type {
  PrismaBox,
  PrismaLine,
  PrismaSpec,
  PrismaStep,
} from "@/lib/prisma/spec";
import type { CanvasView } from "@/components/editor/pool-controls";
import {
  BarKey,
  HandleLayer,
  HitBox,
  PartBar,
  Rename,
  SheetKey,
  type Rect,
} from "@/components/editor/figure-handles";

/**
 * A PRISMA flow on the sheet.
 *
 * Every caption is a thing the reader can point at: a row, its total, one of
 * the lines under it, a side box and what is written in it. Pressing one raises
 * the few things worth doing to it — put a line under it, put a box beside the
 * row, rename it, take it away. The pair under the flow grows and shrinks the
 * whole run, because that is where the next row would go.
 */

interface PrismaHandlesProps {
  spec: PrismaSpec;
  box: Rect;
  view: CanvasView;
  picked: string | null;
  onPick: (id: string | null) => void;
  onChange: (spec: PrismaSpec, settled: boolean) => void;
}

/** `step:2:item:1` read back as `{ kind: "step", row: 2, part: "item", at: 1 }`. */
function partOf(id: string | null): {
  kind: string;
  row: number;
  part: string;
  at: number;
} {
  const bits = (id ?? "").split(":");
  return {
    kind: bits[0] ?? "",
    row: Number(bits[1]),
    part: bits[2] ?? "",
    at: Number(bits[3]),
  };
}

function newLine(): PrismaLine {
  return { label: "New line", count: "" };
}

export default function PrismaHandles({
  spec,
  box,
  view,
  picked,
  onPick,
  onChange,
}: PrismaHandlesProps) {
  const [naming, setNaming] = useState<string | null>(null);
  const plan = planPrisma(spec, box);
  const part = partOf(picked);

  // a row, a line or a longer caption can make the flow taller than its frame;
  // the notation grows the sheet rather than drawing outside it
  const write = (patch: Partial<PrismaSpec>) =>
    onChange(grownPrisma({ ...spec, ...patch }), true);
  const writeStep = (index: number, patch: Partial<PrismaStep>) =>
    write({
      steps: spec.steps.map((step, at) => (at === index ? { ...step, ...patch } : step)),
    });
  const writeSide = (index: number, patch: Partial<PrismaBox>) => {
    const side = spec.steps[index]?.side;
    if (!side) {
      return;
    }
    writeStep(index, { side: { ...side, ...patch } });
  };
  const writeItem = (index: number, side: boolean, at: number, patch: Partial<PrismaLine>) => {
    const holder = side ? spec.steps[index]?.side : spec.steps[index];
    if (!holder) {
      return;
    }
    const items = holder.items.map((line, i) => (i === at ? { ...line, ...patch } : line));
    if (side) {
      writeSide(index, { items });
    } else {
      writeStep(index, { items });
    }
  };

  const addStep = () => {
    const index = spec.steps.length;
    const band = spec.steps[index - 1]?.band ?? "";
    write({ steps: [...spec.steps, { band, title: "New row", count: "", items: [] }] });
    onPick(`step:${index}:title`);
    setNaming(`step:${index}:title`);
  };

  const dropStep = (index: number) => {
    if (spec.steps.length <= 1) {
      return;
    }
    write({ steps: spec.steps.filter((_, at) => at !== index) });
    onPick(null);
  };

  const addSide = (index: number) => {
    writeStep(index, {
      side: { title: "Records excluded", count: "", items: [] },
    });
    onPick(`side:${index}:title`);
    setNaming(`side:${index}:title`);
  };

  const dropSide = (index: number) => {
    const step = spec.steps[index];
    if (!step?.side) {
      return;
    }
    const plain: PrismaStep = {
      band: step.band,
      title: step.title,
      count: step.count,
      items: step.items,
    };
    write({ steps: spec.steps.map((entry, at) => (at === index ? plain : entry)) });
    onPick(null);
  };

  const addItem = (index: number, side: boolean) => {
    const holder = side ? spec.steps[index]?.side : spec.steps[index];
    if (!holder) {
      return;
    }
    const at = holder.items.length;
    if (side) {
      writeSide(index, { items: [...holder.items, newLine()] });
      onPick(`side:${index}:item:${at}`);
      setNaming(`side:${index}:item:${at}`);
    } else {
      writeStep(index, { items: [...holder.items, newLine()] });
      onPick(`step:${index}:item:${at}`);
      setNaming(`step:${index}:item:${at}`);
    }
  };

  const dropItem = (index: number, side: boolean, at: number) => {
    const holder = side ? spec.steps[index]?.side : spec.steps[index];
    if (!holder) {
      return;
    }
    const items = holder.items.filter((_, i) => i !== at);
    if (side) {
      writeSide(index, { items });
    } else {
      writeStep(index, { items });
    }
    onPick(null);
  };

  /** What the reader is pointing at, and what renaming it writes. */
  const chosen = (() => {
    const row = plan.rows[part.row];
    if (part.kind === "title") {
      return {
        box: plan.title,
        label: spec.title,
        remove: null,
        rename: (title: string) => write({ title }),
      };
    }
    if (!row || !spec.steps[part.row]) {
      return null;
    }
    const step = spec.steps[part.row];
    if (part.kind === "step") {
      if (part.part === "title") {
        return {
          box: row.title,
          label: step.title,
          remove: {
            label: "Remove this row",
            run: () => dropStep(part.row),
          },
          rename: (title: string) => writeStep(part.row, { title }),
        };
      }
      if (part.part === "count" && row.count) {
        return {
          box: row.count,
          label: step.count,
          remove: {
            label: "Clear the count",
            run: () => {
              writeStep(part.row, { count: "" });
              onPick(null);
            },
          },
          rename: (count: string) => writeStep(part.row, { count }),
        };
      }
      if (part.part === "item" && step.items[part.at] && row.items[part.at]) {
        return {
          box: row.items[part.at],
          label: step.items[part.at].label,
          remove: {
            label: "Remove this line",
            run: () => dropItem(part.row, false, part.at),
          },
          rename: (label: string) => writeItem(part.row, false, part.at, { label }),
        };
      }
    }
    if (part.kind === "side" && row.side && step.side) {
      const side = step.side;
      if (part.part === "title") {
        return {
          box: row.side.title,
          label: side.title,
          remove: { label: "Remove this side box", run: () => dropSide(part.row) },
          rename: (title: string) => writeSide(part.row, { title }),
        };
      }
      if (part.part === "count" && row.side.count) {
        return {
          box: row.side.count,
          label: side.count,
          remove: {
            label: "Clear the count",
            run: () => {
              writeSide(part.row, { count: "" });
              onPick(null);
            },
          },
          rename: (count: string) => writeSide(part.row, { count }),
        };
      }
      if (part.part === "item" && side.items[part.at] && row.side.items[part.at]) {
        return {
          box: row.side.items[part.at],
          label: side.items[part.at].label,
          remove: {
            label: "Remove this line",
            run: () => dropItem(part.row, true, part.at),
          },
          rename: (label: string) => writeItem(part.row, true, part.at, { label }),
        };
      }
    }
    return null;
  })();

  const start = (id: string) => {
    onPick(id);
    setNaming(id);
  };

  return (
    <>
      <svg
        className="absolute inset-0 z-20 h-full w-full"
        style={{ pointerEvents: "none", touchAction: "none" }}
      >
        <g
          transform={`translate(${view.scrollX * view.zoom} ${
            view.scrollY * view.zoom
          }) scale(${view.zoom})`}
        >
          <HitBox
            box={plan.title}
            held={picked === "title"}
            label={`Title: ${spec.title}`}
            onPick={() => onPick("title")}
            onRename={() => start("title")}
          />
          {plan.rows.map((row) => {
            const step = spec.steps[row.index];
            const id = `step:${row.index}`;
            return (
              <g key={id}>
                <HitBox
                  box={row.title}
                  held={picked === `${id}:title`}
                  label={`Row: ${step.title}`}
                  onPick={() => onPick(`${id}:title`)}
                  onRename={() => start(`${id}:title`)}
                />
                {row.count && (
                  <HitBox
                    box={row.count}
                    held={picked === `${id}:count`}
                    label={`Count: ${step.count}`}
                    onPick={() => onPick(`${id}:count`)}
                    onRename={() => start(`${id}:count`)}
                  />
                )}
                {row.items.map((item, at) => (
                  <HitBox
                    key={`${id}:item:${at}`}
                    box={item}
                    held={picked === `${id}:item:${at}`}
                    label={`Line: ${step.items[at]?.label ?? ""}`}
                    onPick={() => onPick(`${id}:item:${at}`)}
                    onRename={() => start(`${id}:item:${at}`)}
                  />
                ))}
                {row.side && step.side && (
                  <g>
                    <HitBox
                      box={row.side.title}
                      held={picked === `side:${row.index}:title`}
                      label={`Side box: ${step.side.title}`}
                      onPick={() => onPick(`side:${row.index}:title`)}
                      onRename={() => start(`side:${row.index}:title`)}
                    />
                    {row.side.count && (
                      <HitBox
                        box={row.side.count}
                        held={picked === `side:${row.index}:count`}
                        label={`Count: ${step.side.count}`}
                        onPick={() => onPick(`side:${row.index}:count`)}
                        onRename={() => start(`side:${row.index}:count`)}
                      />
                    )}
                    {row.side.items.map((item, at) => (
                      <HitBox
                        key={`side:${row.index}:item:${at}`}
                        box={item}
                        held={picked === `side:${row.index}:item:${at}`}
                        label={`Line: ${step.side?.items[at]?.label ?? ""}`}
                        onPick={() => onPick(`side:${row.index}:item:${at}`)}
                        onRename={() => start(`side:${row.index}:item:${at}`)}
                      />
                    ))}
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <HandleLayer>
        <SheetKey
          view={view}
          at={plan.add}
          label="Add a row to this flow"
          onClick={addStep}
        >
          <Plus size={12} />
        </SheetKey>
        <SheetKey
          view={view}
          at={plan.remove}
          label="Remove the last row"
          onClick={() => dropStep(spec.steps.length - 1)}
        >
          <Minus size={12} />
        </SheetKey>

        {chosen && naming !== picked && (
          <PartBar
            view={view}
            at={{ x: chosen.box.x + chosen.box.width / 2, y: chosen.box.y - 6 }}
          >
            {part.kind === "step" && part.part === "title" && (
              <BarKey
                label="Add a line under this row"
                onClick={() => addItem(part.row, false)}
              >
                <Rows3 size={13} />
              </BarKey>
            )}
            {part.kind === "step" &&
              part.part === "title" &&
              !spec.steps[part.row]?.side && (
                <BarKey
                  label="Add a box for what was excluded"
                  onClick={() => addSide(part.row)}
                >
                  <PanelRight size={13} />
                </BarKey>
              )}
            {part.kind === "side" && part.part === "title" && (
              <BarKey label="Add a line under this box" onClick={() => addItem(part.row, true)}>
                <Rows3 size={13} />
              </BarKey>
            )}
            <BarKey
              label="Rename this"
              last={!chosen.remove}
              onClick={() => setNaming(picked)}
            >
              <Pencil size={13} />
            </BarKey>
            {chosen.remove && (
              <BarKey label={chosen.remove.label} danger last onClick={chosen.remove.run}>
                <Trash2 size={13} />
              </BarKey>
            )}
          </PartBar>
        )}

        {chosen && naming === picked && (
          <Rename
            view={view}
            at={{
              x: chosen.box.x + chosen.box.width / 2,
              y: chosen.box.y + chosen.box.height / 2,
            }}
            width={chosen.box.width}
            value={chosen.label}
            onCommit={(value) => {
              chosen.rename(value);
              setNaming(null);
            }}
            onCancel={() => setNaming(null)}
          />
        )}
      </HandleLayer>
    </>
  );
}
