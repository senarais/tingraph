"use client";

import { useEffect, useRef, useState } from "react";
import {
  Blend,
  ChartColumn,
  Eraser,
  Fish,
  Grid2x2,
  Hand,
  Image as ImageIcon,
  MousePointer2,
  MoveUpRight,
  Palette,
  Pencil,
  Shapes,
  Type,
  Wand2,
  Waypoints,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";
import { useTingraphStore, type CanvasTool, type Drawer } from "@/lib/store";
import { CONNECTORS, defaultConnector, type ConnectorKind } from "@/lib/connectors";
import { figureDef } from "@/lib/figures/registry";
import { isFigure, type DiagramCategory } from "@/lib/types";

/**
 * Every instrument the editor has, in one column. A tool takes the pointer; a
 * panel slides the drawer out beside it; the connector opens the short list of
 * lines its notation draws with. Pressing whatever is already held puts it
 * back, so the column is never in a state the reader cannot leave.
 *
 * Only the two instruments that decide what the pointer *is* answer to a key:
 * the hand and the pointer itself. Everything else is pressed, because a
 * letter or a digit belongs to whatever the reader is writing — a caption on
 * the sheet, a name in a panel, a line of source — far more often than it
 * belongs to a tool.
 */

interface Entry {
  icon: LucideIcon;
  label: string;
  hint: string;
  /** the key that reaches for it, on the two that have one */
  key?: string;
  tool?: CanvasTool;
  drawer?: Drawer;
  /** the connector instrument, which opens its own list */
  lines?: true;
  /** left out of the column when the notation has no use for it */
  only?: "graph" | "figure";
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
    drawer: "shapes",
    only: "graph",
  },
  {
    icon: ChartColumn,
    label: "Figure",
    hint: "Everything this diagram is made of",
    drawer: "figure",
    only: "figure",
  },
  { icon: Type, label: "Text", hint: "Write on the sheet", tool: "text" },
  { icon: ImageIcon, label: "Image", hint: "Place a picture", tool: "image" },
  {
    icon: MoveUpRight,
    label: "Connector",
    hint: "Join two elements",
    lines: true,
    only: "graph",
  },
  { icon: Pencil, label: "Draw", hint: "Freehand stroke", tool: "freedraw" },
  { icon: Eraser, label: "Erase", hint: "Rub something out", tool: "eraser" },
];

const PANELS: Entry[] = [
  {
    icon: Wand2,
    label: "Generate",
    hint: "Write the diagram as source",
    drawer: "source",
  },
  { icon: Palette, label: "Style", hint: "Ink and drawing style", drawer: "style" },
];

/** The panel a figure opens under, said and drawn the way that figure is. */
const FIGURE_ICONS: Partial<Record<DiagramCategory, LucideIcon>> = {
  mind: Waypoints,
  matrix: Grid2x2,
  venn: Blend,
  fishbone: Fish,
  sequence: MessagesSquare,
};

/**
 * What the column carries for one notation. A figure has no shapes to drop and
 * nothing to join, and a graph has no spec to set, so each is offered only
 * what it can use. The figure's own panel is named and drawn after the figure
 * it opens — Fishbone, Venn, Mind map — because "Chart" means nothing on a
 * sheet that holds none.
 */
function instrumentsFor(category: DiagramCategory): Entry[] {
  const wants = isFigure(category) ? "figure" : "graph";
  const def = figureDef(category);
  return INSTRUMENTS.filter((entry) => !entry.only || entry.only === wants).map(
    (entry) =>
      entry.drawer === "figure" && def
        ? {
            ...entry,
            label: def.label,
            icon: FIGURE_ICONS[category] ?? entry.icon,
            hint: `Everything this ${def.label.toLowerCase()} is made of`,
          }
        : entry,
  );
}

/**
 * Whether a key press belongs to whatever the reader is typing into.
 *
 * The code editor is the awkward one: Monaco writes through an `EditContext`
 * on a plain `div`, which is neither an input nor contenteditable, so it has
 * to be recognised by where it sits rather than by what it is. Miss it and
 * every letter typed into the source reaches for a tool instead.
 */
function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement &&
      (target.isContentEditable || target.closest(".monaco-editor") !== null))
  );
}

/** The only keys the column answers to, and what they reach for. */
const POINTER_KEYS: Record<string, CanvasTool | undefined> = {
  "0": "hand",
  h: "hand",
  "1": "selection",
  v: "selection",
};

/**
 * The keys Excalidraw would otherwise take a tool from. Tingraph draws its
 * shapes from the notation rather than from a toolbar, so these reach for
 * nothing — they are stopped so that they do nothing at all.
 */
const STOLEN_KEYS = new Set("rdolfpkxaeti23456789".split(""));

/**
 * One end of a line, drawn the way Excalidraw draws it: `at` is the tip and
 * `way` says which end of the sample it sits on, so a crow's foot opens
 * towards the table it belongs to whichever end that is.
 */
function LineHead({
  head,
  at,
  way,
}: {
  head: ConnectorKind["endArrowhead"];
  at: number;
  way: 1 | -1;
}) {
  if (!head) {
    return null;
  }
  const back = at - way * 7;
  const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.5 } as const;
  switch (head) {
    case "triangle":
      return <path d={`M${back} 1.5L${at} 6L${back} 10.5Z`} fill="currentColor" />;
    case "triangle_outline":
      return (
        <path d={`M${back} 1.5L${at} 6L${back} 10.5Z`} {...line} strokeLinejoin="round" />
      );
    case "arrow":
      return <path d={`M${back} 1.8L${at} 6L${back} 10.2`} {...line} />;
    case "circle_outline":
      return (
        <circle cx={at - way * 2.5} cy="6" r="2.5" {...line} />
      );
    case "crowfoot_one":
      return <path d={`M${at - way * 4} 1.5V10.5`} {...line} />;
    case "crowfoot_many":
      return <path d={`M${back} 6L${at} 1M${back} 6L${at} 11M${back} 6L${at} 6`} {...line} />;
    case "crowfoot_one_or_many":
      return (
        <g {...line}>
          <path d={`M${back} 6L${at} 1M${back} 6L${at} 11`} />
          <path d={`M${back - way * 3} 1.5V10.5`} />
        </g>
      );
    default:
      return null;
  }
}

/** How a line is drawn, in miniature, beside its name. */
function LineSample({ kind }: { kind: ConnectorKind }) {
  const dash =
    kind.strokeStyle === "dashed" ? "7 4" : kind.strokeStyle === "dotted" ? "1 4" : undefined;
  return (
    <svg width="40" height="12" viewBox="0 0 40 12" aria-hidden="true" className="shrink-0">
      <line
        x1={kind.startArrowhead ? 8 : 1}
        y1="6"
        x2={kind.endArrowhead ? 32 : 39}
        y2="6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray={dash}
        strokeLinecap="butt"
      />
      <LineHead head={kind.startArrowhead} at={1} way={-1} />
      <LineHead head={kind.endArrowhead} at={39} way={1} />
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
      {entry.key && (
        <kbd className="border border-bone/50 px-1 font-mono text-[10px] leading-[14px] text-bone">
          {entry.key}
        </kbd>
      )}
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
   * The keyboard half of the column.
   *
   * Two instruments answer to a key, and they are the two that say what the
   * pointer is: `1` or `v` for the pointer, `0` or `h` for the hand. Every
   * other key Excalidraw would take one of its own tools from is swallowed
   * here instead — the rail is the only place a tool is chosen, so a stray `r`
   * must not leave a rectangle tool in the reader's hand.
   *
   * Nothing is swallowed while the reader is writing: in a panel field, in a
   * caption on the sheet, or in the code editor. The Generate panel goes
   * further and takes the keyboard entirely — it is open in order to be typed
   * into, so not even the pointer keys are answered while it is out.
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
      const wanted = POINTER_KEYS[event.key];
      const entry = wanted
        ? instrumentsFor(category).find((instrument) => instrument.tool === wanted)
        : undefined;
      if (entry) {
        event.preventDefault();
        event.stopPropagation();
        // the source panel is out to be written in, so it keeps the keyboard
        if (drawer !== "source") {
          press(entry);
        }
        return;
      }
      // every other tool key Excalidraw carries: stopped here, answered by
      // nothing, so the rail stays the only place a tool comes from
      if (STOLEN_KEYS.has(event.key)) {
        event.preventDefault();
        event.stopPropagation();
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
              {CONNECTORS[category]
                .filter((kind) => !kind.hidden)
                .map((kind) => (
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
