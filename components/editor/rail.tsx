"use client";

import {
  Eraser,
  Hand,
  Image as ImageIcon,
  MousePointer2,
  MoveUpRight,
  Palette,
  Pencil,
  Shapes,
  Type,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { useTingraphStore, type CanvasTool, type Drawer } from "@/lib/store";

/**
 * Every instrument the editor has, in one column. A tool takes the pointer; a
 * panel slides the drawer out beside it. Pressing whatever is already held
 * puts it back, so the column is never in a state the reader cannot leave.
 */

interface Entry {
  icon: LucideIcon;
  label: string;
  hint: string;
  tool?: CanvasTool;
  drawer?: Drawer;
}

const INSTRUMENTS: Entry[] = [
  { icon: Hand, label: "Hand", hint: "Pan the sheet", tool: "hand" },
  { icon: MousePointer2, label: "Select", hint: "Pick and move", tool: "selection" },
  { icon: Shapes, label: "Shapes", hint: "Drop a shape on the sheet", drawer: "shapes" },
  { icon: Type, label: "Text", hint: "Write on the sheet", tool: "text" },
  { icon: ImageIcon, label: "Image", hint: "Place a picture", tool: "image" },
  { icon: MoveUpRight, label: "Arrow", hint: "Draw a connector", tool: "arrow" },
  { icon: Pencil, label: "Draw", hint: "Freehand stroke", tool: "freedraw" },
  { icon: Eraser, label: "Erase", hint: "Rub something out", tool: "eraser" },
];

const PANELS: Entry[] = [
  { icon: Wand2, label: "Generate", hint: "Write the diagram as source", drawer: "source" },
  { icon: Palette, label: "Style", hint: "Ink and drawing style", drawer: "style" },
];

function RailButton({ entry }: { entry: Entry }) {
  const tool = useTingraphStore((s) => s.tool);
  const setTool = useTingraphStore((s) => s.setTool);
  const drawer = useTingraphStore((s) => s.drawer);
  const openDrawer = useTingraphStore((s) => s.openDrawer);
  const held = entry.tool ? tool === entry.tool : drawer === entry.drawer;
  const Icon = entry.icon;
  return (
    <button
      type="button"
      aria-pressed={held}
      aria-label={`${entry.label}: ${entry.hint}`}
      title={`${entry.label} — ${entry.hint}`}
      onClick={() => {
        if (entry.tool) {
          setTool(entry.tool);
        } else if (entry.drawer) {
          openDrawer(entry.drawer);
        }
      }}
      className={`grid h-10 w-10 place-items-center border-2 transition-colors ${
        held
          ? "border-edge bg-edge text-bone"
          : "border-transparent text-ink hover:border-edge hover:bg-white"
      }`}
    >
      <Icon size={17} />
    </button>
  );
}

export default function Rail() {
  return (
    <nav
      aria-label="Editor tools"
      className="flex w-14 shrink-0 flex-col items-center gap-1 border-r-2 border-edge bg-bone py-3"
    >
      {INSTRUMENTS.map((entry) => (
        <RailButton key={entry.label} entry={entry} />
      ))}
      <hr className="my-2 w-7 border-t-2 border-edge" />
      {PANELS.map((entry) => (
        <RailButton key={entry.label} entry={entry} />
      ))}
    </nav>
  );
}
