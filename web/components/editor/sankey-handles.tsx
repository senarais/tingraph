"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { planSankey } from "@/lib/sankey/build-sankey";
import { dropNode, withoutStrays, type SankeySpec } from "@/lib/sankey/spec";
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
 * A Sankey diagram on the sheet.
 *
 * Its bands are derived — a band is as wide as its flow and stands where the
 * nodes put it — so there is nothing to drag. What the sheet offers is the
 * names: every node and the title are renamed where they are read, a node can
 * be taken out with every flow that touched it, and the `+` adds a new node
 * fed from the first. The flows themselves are set in the panel.
 */

interface SankeyHandlesProps {
  spec: SankeySpec;
  box: Rect;
  view: CanvasView;
  picked: string | null;
  onPick: (id: string | null) => void;
  onChange: (spec: SankeySpec, settled: boolean) => void;
}

export default function SankeyHandles({ spec, box, view, picked, onPick, onChange }: SankeyHandlesProps) {
  const [naming, setNaming] = useState<string | null>(null);
  const plan = planSankey(spec, box);
  const scale = view.zoom;
  const [kind, key] = (picked ?? "").split(":");
  const node = kind === "node" ? Number(key) : -1;

  // two nodes with one name are one node in the source, so a rename onto a
  // name already taken is refused rather than merging them behind the reader's back
  const renameNode = (index: number, value: string) => {
    const name = value.trim();
    if (!name || spec.nodes.some((entry, i) => i !== index && entry.label === name)) return;
    onChange({ ...spec, nodes: spec.nodes.map((entry, i) => (i === index ? { ...entry, label: name } : entry)) }, true);
  };

  const chosen: { box: Rect; label: string; rename: (value: string) => void; node?: number } | null =
    kind === "title"
      ? { box: plan.title, label: spec.title, rename: (value) => onChange({ ...spec, title: value }, true) }
      : spec.nodes[node]
        ? { box: plan.nodes[node].label, label: spec.nodes[node].label, node, rename: (value) => renameNode(node, value) }
        : null;

  const add = () => {
    let n = spec.nodes.length + 1;
    while (spec.nodes.some((entry) => entry.label === `Node ${n}`)) n += 1;
    const value = Math.min(...spec.flows.map((flow) => flow.value), 10);
    onChange(
      {
        ...spec,
        nodes: [...spec.nodes, { label: `Node ${n}` }],
        flows: [...spec.flows, { from: 0, to: spec.nodes.length, value }],
      },
      true,
    );
    onPick(`node:${spec.nodes.length}`);
  };

  return (
    <>
      <svg className="absolute inset-0 z-20 h-full w-full" style={{ pointerEvents: "none", touchAction: "none" }}>
        <g transform={`translate(${view.scrollX * scale} ${view.scrollY * scale}) scale(${scale})`}>
          {spec.title && (
            <HitBox
              box={plan.title}
              held={picked === "title"}
              label={`Title: ${spec.title}`}
              onPick={() => onPick("title")}
              onRename={() => {
                onPick("title");
                setNaming("title");
              }}
            />
          )}
          {spec.nodes.map((entry, index) => (
            <HitBox
              key={`node-${index}`}
              box={plan.nodes[index].label}
              held={picked === `node:${index}`}
              label={`Node: ${entry.label}`}
              onPick={() => onPick(`node:${index}`)}
              onRename={() => {
                onPick(`node:${index}`);
                setNaming(`node:${index}`);
              }}
            />
          ))}
        </g>
      </svg>

      <HandleLayer>
        {spec.nodes.length > 0 && (
          <SheetKey view={view} at={plan.next} label="Add a node fed from the first" onClick={add}>
            <Plus size={12} />
          </SheetKey>
        )}

        {chosen && naming !== picked && (
          <PartBar view={view} at={{ x: chosen.box.x + chosen.box.width / 2, y: chosen.box.y - 6 }}>
            <BarKey label="Write here" onClick={() => setNaming(picked)} last={chosen.node === undefined}>
              <Pencil size={13} />
            </BarKey>
            {chosen.node !== undefined && (
              <BarKey
                label="Remove this node and its flows"
                danger
                disabled={spec.flows.length <= 1}
                onClick={() => {
                  const next = withoutStrays(dropNode(spec, chosen.node as number));
                  if (next.flows.length === 0) return;
                  onPick(null);
                  onChange(next, true);
                }}
                last
              >
                <Trash2 size={13} />
              </BarKey>
            )}
          </PartBar>
        )}

        {chosen && naming === picked && (
          <Rename
            view={view}
            at={{ x: chosen.box.x + chosen.box.width / 2, y: chosen.box.y + chosen.box.height / 2 }}
            width={Math.max(120, chosen.box.width)}
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
