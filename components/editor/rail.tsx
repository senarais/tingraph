"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChartColumn,
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
import { CONNECTORS, defaultConnector, type ConnectorKind } from "@/lib/connectors";
import { isChart, type DiagramCategory } from "@/lib/types";

/**
 * Every instrument the editor has, in one column. A tool takes the pointer; a
 * panel slides the drawer out beside it; the connector opens the short list of
 * lines its notation draws with. Pressing whatever is already held puts it
 * back, so the column is never in a state the reader cannot leave.
 *
 * Each instrument answers to a key as well as to the pointer, and says which
 * key on the label that comes out under the cursor.
 */

interface Entry {
  icon: LucideIcon;
  label: string;
  hint: string;
  /** the key that reaches for it */
  key: string;
  tool?: CanvasTool;
  drawer?: Drawer;
  /** the connector instrument, which opens its own list */
  lines?: true;
  /** left out of the column when the notation has no use for it */
  only?: "graph" | "chart";
}

const INSTRUMENTS: Entry[] = [
  { icon: Hand, label: "Hand", hint: "Pan the sheet", key: "0", tool: "hand" },
  {
    icon: MousePointer2,
    label: "Select",
    hint: "Pick and move",
    key: "1",
    tool: "selection",
  },
  {
    icon: Shapes,
    label: "Shapes",
    hint: "Drop a shape on the sheet",
    key: "2",
    drawer: "shapes",
    only: "graph",
  },
  {
    icon: ChartColumn,
    label: "Chart",
    hint: "Readings, colours and everything else",
    key: "2",
    drawer: "chart",
    only: "chart",
  },
  { icon: Type, label: "Text", hint: "Write on the sheet", key: "3", tool: "text" },
  { icon: ImageIcon, label: "Image", hint: "Place a picture", key: "4", tool: "image" },
  {
    icon: MoveUpRight,
    label: "Connector",
    hint: "Join two elements",
    key: "5",
    lines: true,
    only: "graph",
  },
  { icon: Pencil, label: "Draw", hint: "Freehand stroke", key: "6", tool: "freedraw" },
  { icon: Eraser, label: "Erase", hint: "Rub something out", key: "7", tool: "eraser" },
];

const PANELS: Entry[] = [
  {
    icon: Wand2,
    label: "Generate",
    hint: "Write the diagram as source",
    key: "8",
    drawer: "source",
  },
  { icon: Palette, label: "Style", hint: "Ink and drawing style", key: "9", drawer: "style" },
];

/**
 * What the column carries for one notation. A chart has no shapes to drop and
 * nothing to join, and a graph has no readings to set, so each is offered only
 * what it can use — and the key stays on the same number either way, so `2` is
 * always "this notation's own panel".
 */
function instrumentsFor(category: DiagramCategory): Entry[] {
  const wants = isChart(category) ? "chart" : "graph";
  return INSTRUMENTS.filter((entry) => !entry.only || entry.only === wants);
}

/** Whether a key press belongs to whatever the reader is typing into. */
function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/** How a line is drawn, in miniature, beside its name. */
function LineSample({ kind }: { kind: ConnectorKind }) {
  const dash =
    kind.strokeStyle === "dashed" ? "7 4" : kind.strokeStyle === "dotted" ? "1 4" : undefined;
  return (
    <svg width="38" height="12" viewBox="0 0 38 12" aria-hidden="true" className="shrink-0">
      <line
        x1={kind.startArrowhead ? 6 : 1}
        y1="6"
        x2={kind.endArrowhead ? 29 : 37}
        y2="6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray={dash}
        strokeLinecap="butt"
      />
      {kind.startArrowhead === "circle_outline" && (
        <circle cx="3.5" cy="6" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      )}
      {kind.endArrowhead === "triangle" && (
        <path d="M29 1.5 L37 6 L29 10.5 Z" fill="currentColor" />
      )}
      {kind.endArrowhead === "triangle_outline" && (
        <path
          d="M29 1.5 L37 6 L29 10.5 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/** The label that comes out beside an instrument when the cursor rests on it. */
function Label({ entry, shown }: { entry: Entry; shown: boolean }) {
  if (!shown) {
    return null;
  }
  return (
    <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 flex -translate-y-1/2 items-center gap-2 border-2 border-edge bg-edge px-2 py-1 text-bone shadow-[3px_3px_0_var(--edge)]">
      <span className="whitespace-nowrap font-mono text-[11.5px] leading-none">
        {entry.label}
      </span>
      <kbd className="border border-bone/50 px-1 font-mono text-[10px] leading-[14px] text-bone">
        {entry.key}
      </kbd>
    </div>
  );
}

function RailButton({
  entry,
  held,
  onPress,
  children,
}: {
  entry: Entry;
  held: boolean;
  onPress: () => void;
  children?: React.ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const Icon = entry.icon;
  const rest = () => {
    timer.current = setTimeout(() => setShown(true), 380);
  };
  const leave = () => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    setShown(false);
  };
  useEffect(() => leave, []);
  return (
    <div className="relative" onPointerEnter={rest} onPointerLeave={leave}>
      <button
        type="button"
        aria-pressed={held}
        aria-keyshortcuts={entry.key}
        aria-label={`${entry.label}: ${entry.hint}`}
        onClick={() => {
          leave();
          onPress();
        }}
        className={`grid h-10 w-10 place-items-center border-2 transition-colors ${
          held
            ? "border-edge bg-edge text-bone"
            : "border-transparent text-ink hover:border-edge hover:bg-white"
        }`}
      >
        <Icon size={17} />
      </button>
      <Label entry={entry} shown={shown && !children} />
      {children}
    </div>
  );
}

export default function Rail({ category }: { category: DiagramCategory }) {
  const tool = useTingraphStore((s) => s.tool);
  const setTool = useTingraphStore((s) => s.setTool);
  const drawer = useTingraphStore((s) => s.drawer);
  const openDrawer = useTingraphStore((s) => s.openDrawer);
  const connector = useTingraphStore((s) => s.connector);
  const setConnector = useTingraphStore((s) => s.setConnector);
  const panning = useTingraphStore((s) => s.panning);
  const setPanning = useTingraphStore((s) => s.setPanning);
  const [lines, setLines] = useState(false);

  // the list of lines is a panel over the sheet, so it shuts when the reader
  // reaches past it
  useEffect(() => {
    if (!lines) {
      return;
    }
    const away = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest?.("nav[aria-label='Editor tools']")) {
        setLines(false);
      }
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [lines]);

  const press = (entry: Entry) => {
    if (entry.lines) {
      // nothing held: take the notation's own line and show the rest of them.
      // already held: the list opens, and pressing again puts the line back
      if (connector === null) {
        setConnector(defaultConnector(category));
        setLines(true);
      } else if (lines) {
        setConnector(null);
        setLines(false);
      } else {
        setLines(true);
      }
      return;
    }
    setLines(false);
    if (entry.tool) {
      setTool(entry.tool);
    } else if (entry.drawer) {
      openDrawer(entry.drawer);
    }
  };

  /**
   * The keyboard half of the column. It runs before Excalidraw's own handler
   * and stops the event there, so a key that would have reached for a tool
   * Tingraph does not carry — a bare rectangle, Excalidraw's own arrow —
   * never gets that far.
   */
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (typing(event.target) || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (event.key === " ") {
        // Excalidraw pans while space is down; the column only says so
        setPanning(true);
        return;
      }
      if (event.key === "Escape" && connector !== null) {
        setConnector(null);
        setLines(false);
        return;
      }
      const entry = [...instrumentsFor(category), ...PANELS].find(
        (instrument) => instrument.key === event.key,
      );
      if (entry) {
        event.preventDefault();
        event.stopPropagation();
        press(entry);
        return;
      }
      // Excalidraw's own tool letters reach for instruments this editor does
      // not carry, so they are swallowed rather than left to bounce
      if (/^[a-z]$/.test(event.key)) {
        const column = instrumentsFor(category);
        const by = (label: string) => column.find((entry) => entry.label === label);
        const named: Record<string, Entry | undefined> = {
          v: by("Select"),
          h: by("Hand"),
          t: by("Text"),
          a: by("Connector"),
          e: by("Erase"),
        };
        const reached = named[event.key];
        if (reached || "rdolfpkx".includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          if (reached) {
            press(reached);
          }
        }
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === " ") {
        setPanning(false);
      }
    };
    document.addEventListener("keydown", down, true);
    document.addEventListener("keyup", up, true);
    return () => {
      document.removeEventListener("keydown", down, true);
      document.removeEventListener("keyup", up, true);
    };
  });

  const isHeld = (entry: Entry): boolean => {
    if (entry.lines) {
      return connector !== null;
    }
    if (entry.tool === "hand") {
      return tool === "hand" || panning;
    }
    if (entry.tool) {
      return tool === entry.tool && connector === null;
    }
    return drawer === entry.drawer;
  };

  return (
    <nav
      aria-label="Editor tools"
      className="flex w-14 shrink-0 flex-col items-center gap-1 border-r-2 border-edge bg-bone py-3"
    >
      {instrumentsFor(category).map((entry) => (
        <RailButton
          key={entry.label}
          entry={entry}
          held={isHeld(entry)}
          onPress={() => press(entry)}
        >
          {entry.lines && lines && connector !== null && (
            <div className="slab-tight absolute left-full top-0 z-50 ml-2 w-60 bg-white">
              <p className="border-b-2 border-edge px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                Connector · hold space to pan
              </p>
              {CONNECTORS[category].map((kind) => (
                <button
                  key={kind.id}
                  type="button"
                  onClick={() => {
                    setConnector(kind.id);
                    setLines(false);
                  }}
                  className={`flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors ${
                    connector === kind.id ? "bg-edge text-bone" : "text-ink hover:bg-bone"
                  }`}
                >
                  <LineSample kind={kind} />
                  <span className="min-w-0">
                    <span className="block font-mono text-[11.5px] leading-tight">
                      {kind.label}
                    </span>
                    <span
                      className={`block font-mono text-[10px] leading-tight ${
                        connector === kind.id ? "text-bone/70" : "text-ink-faint"
                      }`}
                    >
                      {kind.hint}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </RailButton>
      ))}
      <hr className="my-2 w-7 border-t-2 border-edge" />
      {PANELS.map((entry) => (
        <RailButton
          key={entry.label}
          entry={entry}
          held={isHeld(entry)}
          onPress={() => press(entry)}
        />
      ))}
    </nav>
  );
}
