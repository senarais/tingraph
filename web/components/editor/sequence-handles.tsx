"use client";

import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Minus,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { fitSequence, planSequence } from "@/lib/sequence/layout-sequence";
import {
  freshParticipantId,
  freshStepId,
  insertAfter,
  messagesOf,
  moveStep,
  rewriteSteps,
  walkSequence,
  withoutParticipant,
  type SequenceSpec,
  type SequenceStep,
} from "@/lib/sequence/spec";
import type { CanvasView } from "@/components/editor/pool-controls";
import {
  ACCENT,
  BarKey,
  HandleLayer,
  HitBox,
  PartBar,
  Rename,
  SheetKey,
  useSceneAt,
  type Rect,
} from "@/components/editor/figure-handles";

/**
 * A sequence diagram on the sheet.
 *
 * The two gestures are the two things the notation is: drag a participant
 * along the top to change the order they stand in, and press a message to move
 * it up or down the order it is sent in. Everything a message says is written
 * where it is read, and a lifeline is added or dropped from the pair beside
 * the last one.
 */

interface SequenceHandlesProps {
  api: ExcalidrawImperativeAPI;
  spec: SequenceSpec;
  box: Rect;
  view: CanvasView;
  picked: string | null;
  onPick: (id: string | null) => void;
  onChange: (spec: SequenceSpec, settled: boolean) => void;
}

export default function SequenceHandles({
  api,
  spec,
  box,
  view,
  picked,
  onPick,
  onChange,
}: SequenceHandlesProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [held, setHeld] = useState<number | null>(null);
  const sceneAt = useSceneAt(api, svgRef);
  const plan = planSequence(spec, box);
  const scale = view.zoom;
  const [kind, key] = (picked ?? "").split(":");

  const build = (next: SequenceSpec, settled = true) =>
    onChange(fitSequence(next), settled);

  // --- participants
  const order = (from: number, to: number, settled: boolean) => {
    if (to < 0 || to >= spec.participants.length || to === from) {
      return;
    }
    const next = [...spec.participants];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange({ ...spec, participants: next }, settled);
  };

  const addParticipant = () =>
    build({
      ...spec,
      participants: [
        ...spec.participants,
        {
          id: freshParticipantId(spec),
          label: `Participant ${spec.participants.length + 1}`,
          kind: "object",
        },
      ],
    });

  const dropParticipant = (index: number) => {
    const gone = spec.participants[index];
    if (!gone) {
      return;
    }
    onPick(null);
    build({
      ...spec,
      participants: spec.participants.filter((_, at) => at !== index),
      steps: withoutParticipant(spec.steps, gone.id),
    });
  };

  // --- messages
  const rows = walkSequence(spec.steps);
  const lastId = rows.length > 0 ? rows[rows.length - 1].step.id : null;

  const addMessage = () =>
    build({
      ...spec,
      steps: insertAfter(spec.steps, lastId, {
        type: "message",
        id: freshStepId(spec.steps),
        from: spec.participants[0]?.id ?? "",
        to: spec.participants[1]?.id ?? spec.participants[0]?.id ?? "",
        label: "message()",
        kind: "sync",
      } as SequenceStep),
    });

  const dropLast = () => {
    const sent = messagesOf(spec.steps);
    const gone = sent[sent.length - 1];
    if (!gone) {
      return;
    }
    onPick(null);
    build({ ...spec, steps: rewriteSteps(spec.steps, gone.id, () => null) });
  };

  const writeStep = (id: string, change: (found: SequenceStep) => SequenceStep | null) =>
    onChange({ ...spec, steps: rewriteSteps(spec.steps, id, change) }, true);

  // --- whatever is picked, and what writing into it means
  const head = kind === "head" ? plan.heads[Number(key)] : undefined;
  const message = kind === "msg" ? plan.messages.find((entry) => entry.id === key) : undefined;
  const fragment =
    kind === "frag" ? plan.fragments.find((entry) => entry.id === key) : undefined;

  const chosen = head
    ? {
        box: head.caption,
        // the bar clears the whole head, or it would sit on the stick figure
        // of the very participant it belongs to
        above: head.box.y,
        label: head.label,
        rename: (value: string) =>
          onChange(
            {
              ...spec,
              participants: spec.participants.map((entry, at) =>
                at === head.index ? { ...entry, label: value } : entry,
              ),
            },
            true,
          ),
      }
    : message
      ? {
          box: message.caption,
          above: message.caption.y,
          label: message.label,
          rename: (value: string) =>
            writeStep(message.id, (found) => ({ ...found, label: value }) as SequenceStep),
        }
      : fragment
        ? {
            box: fragment.tab,
            above: fragment.tab.y,
            label: fragment.sections[0]?.guard ?? "",
            rename: (value: string) =>
              writeStep(fragment.id, (found) =>
                found.type === "fragment"
                  ? {
                      ...found,
                      sections: found.sections.map((section, at) =>
                        at === 0 ? { ...section, guard: value } : section,
                      ),
                    }
                  : found,
              ),
          }
        : null;

  return (
    <>
      <svg
        ref={svgRef}
        className="absolute inset-0 z-20 h-full w-full"
        style={{ pointerEvents: "none", touchAction: "none" }}
      >
        <g
          transform={`translate(${view.scrollX * scale} ${view.scrollY * scale}) scale(${scale})`}
        >
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
          {plan.heads.map((entry) => (
            <HitBox
              key={`head-${entry.index}`}
              box={entry.caption}
              held={picked === `head:${entry.index}`}
              label={`Participant: ${entry.label}`}
              onPick={() => onPick(`head:${entry.index}`)}
              onRename={() => {
                onPick(`head:${entry.index}`);
                setNaming(`head:${entry.index}`);
              }}
            />
          ))}
          {plan.messages.map((entry) => (
            <HitBox
              key={`msg-${entry.id}`}
              box={entry.caption}
              held={picked === `msg:${entry.id}`}
              label={`Message ${entry.number}: ${entry.label}`}
              onPick={() => onPick(`msg:${entry.id}`)}
              onRename={() => {
                onPick(`msg:${entry.id}`);
                setNaming(`msg:${entry.id}`);
              }}
            />
          ))}
          {plan.fragments.map((entry) => (
            <HitBox
              key={`frag-${entry.id}`}
              box={entry.tab}
              held={picked === `frag:${entry.id}`}
              label={`Fragment: ${entry.kind}`}
              onPick={() => onPick(`frag:${entry.id}`)}
              onRename={() => {
                onPick(`frag:${entry.id}`);
                setNaming(`frag:${entry.id}`);
              }}
            />
          ))}
          {/* the grip that changes the order the lifelines stand in */}
          {plan.heads.map((entry) => (
            <circle
              key={`grip-${entry.index}`}
              cx={entry.x}
              cy={entry.box.y - 10}
              r={6 / scale}
              fill="#ffffff"
              stroke={ACCENT}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: "auto", cursor: "ew-resize" }}
              onPointerDown={(event) => {
                event.stopPropagation();
                try {
                  (event.target as Element).setPointerCapture(event.pointerId);
                } catch {
                  // a pointer that has already gone; the drag still reads fine
                }
                setHeld(entry.index);
                onPick(`head:${entry.index}`);
              }}
              onPointerMove={(event) => {
                if (held === null) {
                  return;
                }
                const at = sceneAt(event);
                const to = plan.heads.reduce(
                  (best, other) =>
                    Math.abs(other.x - at.x) < Math.abs(plan.heads[best].x - at.x)
                      ? other.index
                      : best,
                  held,
                );
                if (to !== held) {
                  order(held, to, false);
                  setHeld(to);
                  onPick(`head:${to}`);
                }
              }}
              onPointerUp={() => {
                if (held !== null) {
                  order(held, held, true);
                  setHeld(null);
                }
              }}
            />
          ))}
        </g>
      </svg>

      <HandleLayer>
        <SheetKey
          view={view}
          at={{ x: plan.addHead.x, y: plan.addHead.y - 12 }}
          label="Add a participant"
          onClick={addParticipant}
        >
          <Plus size={12} />
        </SheetKey>
        <SheetKey
          view={view}
          at={{ x: plan.addHead.x, y: plan.addHead.y + 14 }}
          label="Take the last participant off"
          onClick={() => dropParticipant(spec.participants.length - 1)}
        >
          <Minus size={12} />
        </SheetKey>
        <SheetKey
          view={view}
          at={{ x: plan.addStep.x - 14, y: plan.addStep.y }}
          label="Add a message"
          onClick={addMessage}
        >
          <Plus size={12} />
        </SheetKey>
        <SheetKey
          view={view}
          at={{ x: plan.addStep.x + 14, y: plan.addStep.y }}
          label="Take the last message off"
          onClick={dropLast}
        >
          <Minus size={12} />
        </SheetKey>

        {chosen && held === null && naming !== picked && (
          <PartBar
            view={view}
            at={{
              x: chosen.box.x + chosen.box.width / 2,
              y: chosen.above - 6,
            }}
          >
            <BarKey label="Write here" onClick={() => setNaming(picked)}>
              <Pencil size={13} />
            </BarKey>
            {head && (
              <>
                <BarKey
                  label="Move it left"
                  onClick={() => order(head.index, head.index - 1, true)}
                >
                  <ArrowLeft size={13} />
                </BarKey>
                <BarKey
                  label="Move it right"
                  onClick={() => order(head.index, head.index + 1, true)}
                >
                  <ArrowRight size={13} />
                </BarKey>
                <BarKey
                  label="Take it off"
                  danger
                  last
                  onClick={() => dropParticipant(head.index)}
                >
                  <Trash2 size={13} />
                </BarKey>
              </>
            )}
            {message && (
              <>
                <BarKey
                  label="Send it earlier"
                  onClick={() =>
                    onChange({ ...spec, steps: moveStep(spec.steps, message.id, -1) }, true)
                  }
                >
                  <ArrowUp size={13} />
                </BarKey>
                <BarKey
                  label="Send it later"
                  onClick={() =>
                    onChange({ ...spec, steps: moveStep(spec.steps, message.id, 1) }, true)
                  }
                >
                  <ArrowDown size={13} />
                </BarKey>
                <BarKey
                  label="Add one after it"
                  onClick={() =>
                    build({
                      ...spec,
                      steps: insertAfter(spec.steps, message.id, {
                        type: "message",
                        id: freshStepId(spec.steps),
                        from: spec.participants[message.from]?.id ?? "",
                        to: spec.participants[message.to]?.id ?? "",
                        label: "message()",
                        kind: "sync",
                      } as SequenceStep),
                    })
                  }
                >
                  <Plus size={13} />
                </BarKey>
                <BarKey
                  label="Take it off"
                  danger
                  last
                  onClick={() => {
                    onPick(null);
                    build({
                      ...spec,
                      steps: rewriteSteps(spec.steps, message.id, () => null),
                    });
                  }}
                >
                  <Trash2 size={13} />
                </BarKey>
              </>
            )}
            {fragment && (
              <BarKey
                label="Take the fragment off"
                danger
                last
                onClick={() => {
                  onPick(null);
                  build({
                    ...spec,
                    steps: rewriteSteps(spec.steps, fragment.id, () => null),
                  });
                }}
              >
                <Trash2 size={13} />
              </BarKey>
            )}
          </PartBar>
        )}

        {picked === "title" && naming !== "title" && (
          <PartBar
            view={view}
            at={{ x: plan.title.x + plan.title.width / 2, y: plan.title.y - 6 }}
          >
            <BarKey label="Write here" onClick={() => setNaming("title")} last>
              <Pencil size={13} />
            </BarKey>
          </PartBar>
        )}

        {naming === "title" && (
          <Rename
            view={view}
            at={{
              x: plan.title.x + plan.title.width / 2,
              y: plan.title.y + plan.title.height / 2,
            }}
            width={plan.title.width}
            value={spec.title}
            onCommit={(value) => {
              onChange({ ...spec, title: value }, true);
              setNaming(null);
            }}
            onCancel={() => setNaming(null)}
          />
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
