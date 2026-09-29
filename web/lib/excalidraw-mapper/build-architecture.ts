import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { FileId } from "@excalidraw/excalidraw/element/types";
import { marked, nodeUnit } from "@/lib/canvas/units";
import type { PositionedNode } from "@/lib/types";
import type { Theme } from "@/lib/excalidraw-mapper/theme";

const SYMBOLS: Record<string, { text: string; color: string }> = {
  client: { text: "USER", color: "#2563eb" },
  service: { text: "API", color: "#7c3aed" },
  database: { text: "DB", color: "#2563eb" },
  storage: { text: "DATA", color: "#16a34a" },
  queue: { text: "EVENT", color: "#db2777" },
  cloud: { text: "CLOUD", color: "#0891b2" },
  external: { text: "EXT", color: "#d97706" },
};

/** Individually movable boxes; the large outlined zone is deliberately a backdrop. */
export function architectureNodeSkeletons(node: PositionedNode, theme: Theme): ExcalidrawElementSkeleton[] {
  const unit = nodeUnit("architecture", node.id);
  const zone = node.type === "zone";
  const common = {
    roughness: theme.roughness,
    strokeWidth: 1.5,
    strokeStyle: "solid" as const,
    fillStyle: "solid" as const,
    opacity: 100,
    groupIds: [unit],
  };
  const base = {
    type: "rectangle",
    id: node.id,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    ...common,
    strokeColor: theme.strokeColor,
    backgroundColor: zone ? "transparent" : "#ffffff",
    roundness: zone ? null : { type: 3, value: 10 },
    ...marked({ unit, kind: "node", core: true }),
  } as ExcalidrawElementSkeleton;
  const band = zone
    ? { x: node.x + 12, y: node.y + 8, width: Math.min(node.width - 24, 260), height: 32 }
    : { x: node.x + 8, y: node.y + node.height - 39, width: node.width - 16, height: 31 };
  const out: ExcalidrawElementSkeleton[] = [base];
  if (!zone) {
    if (node.image) {
      const space = { width: Math.max(1, node.width - 16), height: Math.max(1, node.height - 50) };
      const scale = Math.min(space.width / node.image.width, space.height / node.image.height);
      const width = Math.max(1, node.image.width * scale);
      const height = Math.max(1, node.image.height * scale);
      out.push({
        type: "image",
        id: `${node.id}-picture`,
        x: node.x + 8 + (space.width - width) / 2,
        y: node.y + 6 + (space.height - height) / 2,
        width,
        height,
        fileId: node.image.fileId as FileId,
        ...common,
        strokeColor: "transparent",
        backgroundColor: "transparent",
        ...marked({ unit, kind: "node" }),
      } as ExcalidrawElementSkeleton);
    } else {
      const symbol = SYMBOLS[node.type] ?? SYMBOLS.service;
      out.push({
        type: "rectangle",
        id: `${node.id}-symbol`,
        x: node.x + node.width / 2 - 24,
        y: node.y + 9,
        width: 48,
        height: Math.max(22, node.height - 57),
        ...common,
        strokeColor: "#ffffff",
        backgroundColor: symbol.color,
        roundness: { type: 3, value: 6 },
        ...marked({ unit, kind: "node" }),
        label: { text: symbol.text, fontSize: 10, fontFamily: theme.fontFamily },
      } as ExcalidrawElementSkeleton);
    }
  }
  out.push({
    type: "rectangle",
    id: `${node.id}-name`,
    ...band,
    ...common,
    strokeColor: theme.strokeColor,
    strokeWidth: 0,
    backgroundColor: "#ffffff",
    roundness: null,
    ...marked({ unit, kind: "node", core: true, part: "name" }),
    label: { text: node.label, fontSize: zone ? 16 : 13, fontFamily: theme.fontFamily },
  } as ExcalidrawElementSkeleton);
  return out;
}
