"use client";

import { DiagramCategory } from "@/lib/types";

const FLOW_SECTIONS: Array<{ title: string; rows: Array<[string, string]> }> = [
  {
    title: "Diagram",
    rows: [['flow "Title" {', "open a flowchart"]],
  },
  {
    title: "Nodes",
    rows: [
      ['start ID "Label"', "terminator (ellipse)"],
      ['process ID "Label"', "process step; alias: task"],
      ['decision ID "Label"', "branch point (diamond)"],
      ['io ID "Label"', "input/output; alias: data"],
      ['end ID "Label"', "terminator (ellipse)"],
    ],
  },
  {
    title: "Edges",
    rows: [
      ["A -> B", "directed edge"],
      ["A [Yes] -> B", "edge with a caption"],
      ["A -> B -> C", "chain"],
      ["# comment", "line comment (also //)"],
    ],
  },
];

const BPMN_SECTIONS: Array<{ title: string; rows: Array<[string, string]> }> = [
  {
    title: "Diagram",
    rows: [
      ['bpmn "Title" {', "open a BPMN 2.0 diagram"],
      ['pool ID "Label" {', "participant, holds lanes"],
      ['lane ID "Label" {', "role inside a pool"],
    ],
  },
  {
    title: "Events",
    rows: [
      ['start ID "Label"', "start event (thin circle)"],
      ['msg-start ID "Label"', "message start (open envelope)"],
      ['timer ID "Label"', "timer event (clock)"],
      ['end ID "Label"', "end event (thick circle)"],
      ['msg-end ID "Label"', "message end (filled envelope)"],
    ],
  },
  {
    title: "Activities",
    rows: [
      ['task ID "Label"', "task (rounded rectangle)"],
      ['send-task ID "Label"', "send task"],
      ['recv-task ID "Label"', "receive task"],
      ['script-task ID "Label"', "script task"],
      ['user-task ID "Label"', "user task"],
    ],
  },
  {
    title: "Gateways & data",
    rows: [
      ['gw-ex ID "Label"', "exclusive gateway (X)"],
      ['gw-para ID "Label"', "parallel gateway (+)"],
      ['gw-inc ID "Label"', "inclusive gateway (O)"],
      ['data ID "Label"', "data object (document)"],
    ],
  },
  {
    title: "Flows",
    rows: [
      ["A -> B", "sequence flow"],
      ["A [Yes] -> B", "conditional flow"],
      ["A -.-> D", "data association (dotted)"],
    ],
  },
];

interface CheatSheetProps {
  category: DiagramCategory;
}

export default function CheatSheet({ category }: CheatSheetProps) {
  const sections = category === "flow" ? FLOW_SECTIONS : BPMN_SECTIONS;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <p className="border-b border-rule px-4 py-3 text-[12px] leading-relaxed text-ink-soft">
        Declare every element once, then wire the flows. Layout, spacing and
        routing are worked out for you — drag anything afterwards on the sheet.
      </p>
      {sections.map((section) => (
        <section key={section.title} className="border-b border-rule px-4 py-3">
          <h3 className="tick mb-2">{section.title}</h3>
          <dl className="space-y-1.5">
            {section.rows.map(([syntax, meaning]) => (
              <div key={syntax} className="flex items-baseline gap-2">
                <dt className="shrink-0">
                  <code className="rounded border border-rule bg-raised px-1.5 py-0.5 font-mono text-[11px] text-ink">
                    {syntax}
                  </code>
                </dt>
                <dd className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">
                  {meaning}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
