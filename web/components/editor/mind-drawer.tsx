"use client";

import { Plus, Trash2 } from "lucide-react";
import { PALETTES } from "@/lib/chart/spec";
import {
  MIND_SHAPES,
  MIND_STYLES,
  findMind,
  freshMindId,
  parentOf,
  rewriteMind,
  walkMind,
  type MindNode,
  type MindSpec,
} from "@/lib/mind/spec";
import { Field, Segmented, SlabButton, Tick } from "@/components/editor/ui";
import {
  Choice,
  ColourDot,
  IconButton,
  SizeField,
  Slider,
  TextField,
} from "@/components/editor/figure-fields";

/**
 * A mind map's settings.
 *
 * Most of a mind map is built on the sheet — that is where the branches are
 * added, moved and named — so this panel is for the things the sheet cannot
 * say: how the whole map is arranged, what it is drawn in, and the outline of
 * the tree for a reader who would rather type it than drag it.
 */

interface MindDrawerProps {
  spec: MindSpec;
  onChange: (spec: MindSpec) => void;
  /** the node the reader has hold of on the sheet, if any */
  picked: string | null;
  onPick: (id: string | null) => void;
}

/** One row of the outline, indented by how deep it sits. */
function Row({
  node,
  depth,
  spec,
  onChange,
  picked,
  onPick,
}: {
  node: MindNode;
  depth: number;
  spec: MindSpec;
  onChange: (spec: MindSpec) => void;
  picked: string | null;
  onPick: (id: string | null) => void;
}) {
  const root = spec.root;
  const write = (next: MindNode | null) => {
    const rewritten = rewriteMind(root, node.id, () => next);
    if (rewritten) {
      onChange({ ...spec, root: rewritten });
    }
  };
  const held = picked === node.id;
  return (
    <div
      className={`flex items-center gap-1.5 py-0.5 ${held ? "bg-bone" : ""}`}
      style={{ paddingLeft: depth * 12 }}
    >
      <button
        type="button"
        title="Show this branch on the sheet"
        onClick={() => onPick(node.id)}
        className="h-4 w-4 shrink-0 border-2 border-edge"
        style={{ backgroundColor: node.color ?? "transparent" }}
      />
      <TextField
        value={node.label}
        title={`Name of ${node.label}`}
        onCommit={(label) => write({ ...node, label })}
      />
      <IconButton
        label={`Add a branch under ${node.label}`}
        onClick={() =>
          write({
            ...node,
            children: [
              ...node.children,
              { id: freshMindId(root), label: "New branch", children: [] },
            ],
          })
        }
      >
        <Plus size={12} />
      </IconButton>
      {depth > 0 && (
        <IconButton label={`Remove ${node.label}`} danger onClick={() => write(null)}>
          <Trash2 size={12} />
        </IconButton>
      )}
    </div>
  );
}

export default function MindDrawer({
  spec,
  onChange,
  picked,
  onPick,
}: MindDrawerProps) {
  const { options } = spec;
  const set = <K extends keyof MindSpec["options"]>(
    key: K,
    value: MindSpec["options"][K],
  ) => onChange({ ...spec, options: { ...options, [key]: value } });

  const chosen = picked ? findMind(spec.root, picked) : null;
  const writeNode = (id: string, patch: Partial<MindNode>) => {
    const next = rewriteMind(spec.root, id, (found) => ({ ...found, ...patch }));
    if (next) {
      onChange({ ...spec, root: next });
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Field label="Title" className="border-b-2 border-edge p-3">
        <TextField
          value={spec.title}
          onCommit={(title) => onChange({ ...spec, title })}
          title="What the map is called"
        />
      </Field>

      {chosen && (
        <Field
          label={`Branch · ${chosen.label}`}
          className="border-b-2 border-edge p-3"
        >
          <Tick className="mb-1.5 block">Shape</Tick>
          <Choice
            columns={3}
            options={[{ id: "", name: "Default" } as { id: string; name: string }, ...MIND_SHAPES]}
            value={chosen.shape ?? ""}
            onChange={(shape) =>
              writeNode(chosen.id, {
                shape: (shape || undefined) as MindNode["shape"],
              })
            }
          />
          <div className="mt-2.5 flex items-center gap-2">
            <ColourDot
              colour={chosen.color ?? options.color}
              title="Colour of this branch"
              onPick={(color) => writeNode(chosen.id, { color })}
            />
            <button
              type="button"
              onClick={() => writeNode(chosen.id, { color: undefined })}
              className="text-[11px] text-ink underline underline-offset-2"
            >
              Back to the palette
            </button>
          </div>
          {chosen.at && (
            <button
              type="button"
              onClick={() => writeNode(chosen.id, { at: undefined })}
              className="mt-2 block text-[11px] text-ink underline underline-offset-2"
            >
              Let the layout place it again
            </button>
          )}
          {chosen.image && (
            <button
              type="button"
              onClick={() => writeNode(chosen.id, { image: undefined })}
              className="mt-2 block text-[11px] text-ink underline underline-offset-2"
            >
              Take the picture off
            </button>
          )}
          <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
            A branch is added, moved, renamed and given a picture on the sheet.
            Press one to see what it can do.
          </p>
        </Field>
      )}

      <Field label="Outline" className="border-b-2 border-edge p-3">
        <div className="space-y-0.5">
          {walkMind(spec.root).map(({ node, depth }) => (
            <Row
              key={node.id}
              node={node}
              depth={depth}
              spec={spec}
              onChange={onChange}
              picked={picked}
              onPick={onPick}
            />
          ))}
        </div>
        <SlabButton
          className="mt-2"
          onClick={() =>
            onChange({
              ...spec,
              root: {
                ...spec.root,
                children: [
                  ...spec.root.children,
                  { id: freshMindId(spec.root), label: "New branch", children: [] },
                ],
              },
            })
          }
        >
          <Plus size={12} />
          Add a branch
        </SlabButton>
        {picked && parentOf(spec.root, picked) && (
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            Moving a branch on the sheet takes everything under it along.
          </p>
        )}
      </Field>

      <Field label="Arrangement" className="border-b-2 border-edge p-3">
        <Segmented
          size="sm"
          value={options.layout}
          onChange={(value) => set("layout", value)}
          options={[
            { value: "radial", label: "Around" },
            { value: "sides", label: "Two sides" },
            { value: "down", label: "Downward" },
          ]}
        />
        <div className="mt-2.5 space-y-2">
          <Slider
            label="Spread"
            value={options.spread}
            min={90}
            max={280}
            step={5}
            onChange={(value) => set("spread", value)}
          />
          <Slider
            label="Text"
            value={options.fontSize}
            min={9}
            max={22}
            step={1}
            onChange={(value) => set("fontSize", value)}
          />
        </div>
      </Field>

      <Field label="Branches" className="border-b-2 border-edge p-3">
        <Tick className="mb-1.5 block">Shape</Tick>
        <Choice
          columns={3}
          options={MIND_SHAPES}
          value={options.shape}
          onChange={(value) => set("shape", value)}
        />
        <Tick className="mb-1.5 mt-3 block">Line</Tick>
        <Segmented
          size="sm"
          value={options.line}
          onChange={(value) => set("line", value)}
          options={[
            { value: "curve", label: "Curved" },
            { value: "elbow", label: "Square" },
            { value: "straight", label: "Straight" },
          ]}
        />
      </Field>

      <Field label="Colour" className="border-b-2 border-edge p-3">
        <Choice
          options={PALETTES}
          value={options.palette}
          onChange={(value) => set("palette", value)}
        />
        {options.palette === "single" && (
          <div className="mt-2 flex items-center gap-2">
            <ColourDot
              colour={options.color}
              title="The one colour the map takes"
              onPick={(value) => set("color", value)}
            />
            <span className="font-mono text-[11px] text-ink-faint">
              Every branch takes this colour.
            </span>
          </div>
        )}
        <div className="mt-2.5">
          <Segmented
            size="sm"
            value={options.branchColors ? "branch" : "level"}
            onChange={(value) => set("branchColors", value === "branch")}
            options={[
              { value: "branch", label: "One hue per branch" },
              { value: "level", label: "One per level" },
            ]}
          />
        </div>
      </Field>

      <Field label="Drawing" className="border-b-2 border-edge p-3">
        <Choice
          options={MIND_STYLES}
          value={options.style}
          onChange={(value) => set("style", value)}
        />
        <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
          Formal is black outlines on white with the colour carried by the
          lines, which is what a paper wants. The washed fills a mind map is
          usually drawn with are Soft.
        </p>
      </Field>

      <SizeField
        width={options.width}
        height={options.height}
        onChange={(size) => onChange({ ...spec, options: { ...options, ...size } })}
        note="The map is fitted to this, so a bigger sheet spreads the branches rather than growing them."
      />
    </div>
  );
}
