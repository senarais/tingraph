"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { DiagramCategory } from "@/lib/types";

const FLOW_ROWS: Array<[string, string]> = [
  ['flow "Title" {', "open a flowchart diagram"],
  ["start ID \"Label\"", "terminator (ellipse)"],
  ["process ID \"Label\"", "process step (rectangle); alias: task"],
  ["decision ID \"Label\"", "branch point (diamond)"],
  ["io ID \"Label\"", "input/output (shaded rect); alias: data"],
  ["end ID \"Label\"", "terminator (ellipse)"],
  ["A -> B", "directed edge"],
  ["A [Yes] -> B", "edge with a label"],
  ["A -> B -> C", "edge chain"],
  ["# comment", "line comment (also //)"],
];

const BPMN_ROWS: Array<[string, string]> = [
  ['bpmn "Title" {', "open a BPMN 2.0 diagram"],
  ['pool ID "Label" {', "participant with lanes inside"],
  ["lane ID \"Label\" {", "lane inside a pool (or standalone)"],
  ["start ID \"Label\"", "start event (thin circle)"],
  ["msg-start ID \"Label\"", "message start (circle + white envelope)"],
  ["msg-end ID \"Label\"", "message end (thick circle + black envelope)"],
  ["timer ID \"Label\"", "timer event (double circle + clock)"],
  ["task ID \"Label\"", "task (rounded rectangle)"],
  ["send-task ID \"Label\"", "send task (black envelope marker)"],
  ["recv-task ID \"Label\"", "receive task (white envelope marker)"],
  ["script-task ID \"Label\"", "script task (page marker)"],
  ["user-task ID \"Label\"", "user task (user marker)"],
  ["gw-ex ID \"Label\"", "exclusive gateway (diamond + X)"],
  ["gw-para ID \"Label\"", "parallel gateway (diamond + +)"],
  ["gw-inc ID \"Label\"", "inclusive gateway (diamond + O)"],
  ["data ID \"Label\"", "data object reference (document)"],
  ["end ID \"Label\"", "end event (thick circle)"],
  ["A -> B", "sequence flow (solid, filled arrowhead)"],
  ["A [Yes] -> B", "conditional sequence flow"],
  ["D -.-> A", "data association (dotted, open arrowhead)"],
];

interface CheatSheetProps {
  category: DiagramCategory;
  open: boolean;
  onToggle: () => void;
}

export default function CheatSheet({ category, open, onToggle }: CheatSheetProps) {
  const rows = category === "flow" ? FLOW_ROWS : BPMN_ROWS;
  return (
    <div className="border-t border-zinc-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-800"
      >
        <span>{category === "flow" ? "Flowchart" : "BPMN"} syntax cheat sheet</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <dl className="max-h-64 overflow-y-auto px-3 pb-3">
          {rows.map(([syntax, meaning]) => (
            <div
              key={syntax}
              className="flex items-baseline gap-2 border-b border-zinc-100 py-1 last:border-0"
            >
              <dt>
                <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-900">
                  {syntax}
                </code>
              </dt>
              <dd className="text-[11px] text-zinc-500">{meaning}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
