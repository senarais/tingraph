"use client";

import { Columns3, Rows3, SquareDashed, Table2, type LucideIcon } from "lucide-react";
import type { ElementOnSheet, LinkOnSheet } from "@/lib/canvas/elements";
import type { LinkMark } from "@/lib/canvas/units";
import type { DiagramCategory, DSLNode } from "@/lib/types";
import type { FrameBox } from "@/lib/canvas/frames";
import type { PoolBox } from "@/lib/canvas/scene";
import BpmnDrawer from "@/components/editor/bpmn-drawer";
import ErdDrawer from "@/components/editor/erd-drawer";
import UseCaseDrawer from "@/components/editor/usecase-drawer";
import ActivityDrawer from "@/components/editor/activity-drawer";

/**
 * The panel for a graph whose elements are set rather than only drawn, and the
 * one place that knows which notation has which. It is the twin of
 * `figure-drawer.tsx`: a fishbone's panel is a list of causes and an ERD's is a
 * list of tables, so there is nothing to share here beyond picking the right
 * one and handing it the sheet.
 */

export interface ElementPanel {
  /** what the rail calls it, and what the drawer's header says */
  label: string;
  hint: string;
  icon: LucideIcon;
}

const PANELS: Partial<Record<DiagramCategory, ElementPanel>> = {
  bpmn: {
    label: "Pools & lanes",
    hint: "Every participant pool and the lanes inside it",
    icon: Rows3,
  },
  erd: {
    label: "Tables",
    hint: "Every table, its columns and its relations",
    icon: Table2,
  },
  usecase: {
    label: "System",
    hint: "The boundary, its use cases and its actors",
    icon: SquareDashed,
  },
  activity: {
    label: "Partitions",
    hint: "The partitions and the steps standing in them",
    icon: Columns3,
  },
};

export function elementPanel(category: DiagramCategory): ElementPanel | null {
  return PANELS[category] ?? null;
}

export interface ElementDrawerProps {
  category: DiagramCategory;
  /** every element on the sheet that carries a spec */
  elements: ElementOnSheet[];
  /** every connector on the sheet, for the notations that list them */
  links: LinkOnSheet[];
  /** the chrome a notation draws round its elements */
  frames: FrameBox[];
  /** BPMN participant pools and their ordered lane bands */
  pools: PoolBox[];
  /** picks one element on the sheet, so its own handles come out with it */
  onSelect: (unit: string) => void;
  onChange: (unit: string, spec: DSLNode) => void;
  onAdd: (type: string) => void;
  onRemove: (unit: string) => void;
  onLink: (id: string, patch: Partial<LinkMark>) => void;
  onLabelLink: (id: string, label: string) => void;
  onRemoveLink: (id: string) => void;
  onFrame: (unit: string, patch: { label?: string }) => void;
  onAddFrame: () => void;
  onRemoveFrame: (unit: string) => void;
  onAddLane: (frame: FrameBox) => void;
  onRemoveLane: (frame: FrameBox) => void;
  onRenameLane: (unit: string, label: string) => void;
  onRenamePoolPart: (unit: string, label: string) => void;
  onAddPool: (pool: PoolBox) => void;
  onRemovePool: (pool: PoolBox) => void;
  onAddPoolLane: (pool: PoolBox) => void;
  onRemovePoolLane: (pool: PoolBox) => void;
}

export default function ElementDrawer(props: ElementDrawerProps) {
  switch (props.category) {
    case "bpmn":
      return <BpmnDrawer {...props} />;
    case "erd":
      return (
        <ErdDrawer
          tables={props.elements}
          links={props.links}
          onSelect={props.onSelect}
          onChange={props.onChange}
          onAdd={() => props.onAdd("entity")}
          onRemove={props.onRemove}
          onLink={props.onLink}
          onLabelLink={props.onLabelLink}
          onRemoveLink={props.onRemoveLink}
        />
      );
    case "usecase":
      return <UseCaseDrawer {...props} />;
    default:
      return <ActivityDrawer {...props} />;
  }
}
