"use client";

import { useState } from "react";
import { CornerDownRight, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { planFishbone } from "@/lib/fishbone/build-fishbone";
import type { FishboneCause, FishboneSpec } from "@/lib/fishbone/spec";
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
 * Building a fishbone on the sheet.
 *
 * The method is "keep asking what is behind that", so the sheet is built for
 * exactly that: press a bone or a cause and it offers the one thing worth
 * doing to it — put something behind it, rename it, drop it. The spine carries
 * the pair that adds and removes bones, and nothing else is drawn until the
 * reader presses something, because a fishbone is dense enough already.
 */

interface FishboneHandlesProps {
  spec: FishboneSpec;
  box: Rect;
  view: CanvasView;
  picked: string | null;
  onPick: (id: string | null) => void;
  onChange: (spec: FishboneSpec, settled: boolean) => void;
}

/** `cause:2:1` read back as the two numbers in it. */
function partOf(id: string | null): { kind: string; at: number[] } {
  const bits = (id ?? "").split(":");
  return { kind: bits[0] ?? "", at: bits.slice(1).map(Number) };
}

export default function FishboneHandles({
  spec,
  box,
  view,
  picked,
  onPick,
  onChange,
}: FishboneHandlesProps) {
  const [naming, setNaming] = useState<string | null>(null);
  const plan = planFishbone(spec, box);
  const part = partOf(picked);

  const write = (bones: FishboneSpec["bones"]) => onChange({ ...spec, bones }, true);

  const writeBone = (index: number, patch: Partial<FishboneSpec["bones"][number]>) =>
    write(spec.bones.map((bone, at) => (at === index ? { ...bone, ...patch } : bone)));

  const writeCause = (bone: number, index: number, patch: Partial<FishboneCause>) =>
    writeBone(bone, {
      causes: spec.bones[bone].causes.map((cause, at) =>
        at === index ? { ...cause, ...patch } : cause,
      ),
    });

  const addBone = () =>
    write([...spec.bones, { label: `Bone ${spec.bones.length + 1}`, causes: [] }]);

  const dropBone = (index: number) => {
    write(spec.bones.filter((_, at) => at !== index));
    onPick(null);
  };

  const addCause = (bone: number) => {
    const index = spec.bones[bone].causes.length;
    writeBone(bone, {
      causes: [...spec.bones[bone].causes, { label: "A cause", causes: [] }],
    });
    onPick(`cause:${bone}:${index}`);
    setNaming(`cause:${bone}:${index}`);
  };

  const dropCause = (bone: number, index: number) => {
    writeBone(bone, { causes: spec.bones[bone].causes.filter((_, at) => at !== index) });
    onPick(null);
  };

  const addBehind = (bone: number, index: number) => {
    const cause = spec.bones[bone].causes[index];
    writeCause(bone, index, { causes: [...cause.causes, "Behind it"] });
    onPick(`deep:${bone}:${index}:${cause.causes.length}`);
    setNaming(`deep:${bone}:${index}:${cause.causes.length}`);
  };

  const dropBehind = (bone: number, index: number, deep: number) => {
    const cause = spec.bones[bone].causes[index];
    writeCause(bone, index, { causes: cause.causes.filter((_, at) => at !== deep) });
    onPick(null);
  };

  /** What the reader is pointing at, and what renaming it writes. */
  const chosen = (() => {
    const [bone, index, deep] = part.at;
    if (part.kind === "head") {
      return {
        box: plan.head,
        label: spec.title,
        rename: (title: string) => onChange({ ...spec, title }, true),
      };
    }
    if (part.kind === "bone" && spec.bones[bone]) {
      const at = plan.bones[bone];
      return {
        box: at.name,
        label: spec.bones[bone].label,
        rename: (label: string) => writeBone(bone, { label }),
      };
    }
    if (part.kind === "cause" && spec.bones[bone]?.causes[index]) {
      const at = plan.bones[bone].causes[index];
      return {
        box: at.text,
        label: spec.bones[bone].causes[index].label,
        rename: (label: string) => writeCause(bone, index, { label }),
      };
    }
    if (part.kind === "deep" && spec.bones[bone]?.causes[index]?.causes[deep] !== undefined) {
      const cause = spec.bones[bone].causes[index];
      const at = plan.bones[bone].causes[index];
      const size = spec.options.fontSize;
      return {
        box: {
          x: at.from.x + 10,
          y: at.from.y + 3 + deep * (size + 2) - size / 2,
          width: Math.max(60, at.text.width - 10),
          height: size + 2,
        },
        label: cause.causes[deep],
        rename: (label: string) =>
          writeCause(bone, index, {
            causes: cause.causes.map((held, at2) => (at2 === deep ? label : held)),
          }),
      };
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
            box={plan.head}
            held={picked === "head"}
            label={`The effect: ${spec.title}`}
            onPick={() => onPick("head")}
            onRename={() => start("head")}
          />
          {plan.bones.map((bone) => (
            <HitBox
              key={`bone-${bone.index}`}
              box={bone.name}
              held={picked === `bone:${bone.index}`}
              label={`Bone: ${bone.label}`}
              onPick={() => onPick(`bone:${bone.index}`)}
              onRename={() => start(`bone:${bone.index}`)}
            />
          ))}
          {plan.bones.flatMap((bone) =>
            bone.causes.map((cause, index) => (
              <HitBox
                key={`cause-${bone.index}-${index}`}
                box={cause.text}
                held={picked === `cause:${bone.index}:${index}`}
                label={`Cause: ${cause.label}`}
                onPick={() => onPick(`cause:${bone.index}:${index}`)}
                onRename={() => start(`cause:${bone.index}:${index}`)}
              />
            )),
          )}
          {plan.bones.flatMap((bone) =>
            bone.causes.flatMap((cause, index) =>
              cause.causes.map((deeper, deep) => (
                <HitBox
                  key={`deep-${bone.index}-${index}-${deep}`}
                  box={{
                    x: cause.from.x + 10,
                    y:
                      cause.from.y +
                      3 +
                      deep * (spec.options.fontSize + 2) -
                      spec.options.fontSize / 2,
                    width: Math.max(60, cause.text.width - 10),
                    height: spec.options.fontSize + 2,
                  }}
                  held={picked === `deep:${bone.index}:${index}:${deep}`}
                  label={`Behind it: ${deeper}`}
                  onPick={() => onPick(`deep:${bone.index}:${index}:${deep}`)}
                  onRename={() => start(`deep:${bone.index}:${index}:${deep}`)}
                />
              )),
            ),
          )}
        </g>
      </svg>

      <HandleLayer>
        {/* the pair on the spine adds and takes away bones */}
        <SheetKey
          view={view}
          at={{ x: plan.spine.from.x + 8, y: plan.spine.from.y - 13 }}
          label="Add a bone to this fishbone"
          onClick={addBone}
        >
          <Plus size={12} />
        </SheetKey>
        <SheetKey
          view={view}
          at={{ x: plan.spine.from.x + 8, y: plan.spine.from.y + 13 }}
          label="Remove the last bone"
          onClick={() => spec.bones.length > 0 && dropBone(spec.bones.length - 1)}
        >
          <Minus size={12} />
        </SheetKey>

        {chosen && naming !== picked && (
          <PartBar
            view={view}
            at={{ x: chosen.box.x + chosen.box.width / 2, y: chosen.box.y - 6 }}
          >
            {part.kind === "bone" && (
              <BarKey label="Add a cause to this bone" onClick={() => addCause(part.at[0])}>
                <Plus size={13} />
              </BarKey>
            )}
            {part.kind === "cause" && (
              <BarKey
                label="Add what is behind this cause"
                onClick={() => addBehind(part.at[0], part.at[1])}
              >
                <CornerDownRight size={13} />
              </BarKey>
            )}
            <BarKey label="Rename this" onClick={() => setNaming(picked)}>
              <Pencil size={13} />
            </BarKey>
            <BarKey
              label="Remove this"
              danger
              last
              onClick={() => {
                const [bone, index, deep] = part.at;
                if (part.kind === "bone") {
                  dropBone(bone);
                } else if (part.kind === "cause") {
                  dropCause(bone, index);
                } else {
                  dropBehind(bone, index, deep);
                }
              }}
            >
              <Trash2 size={13} />
            </BarKey>
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
