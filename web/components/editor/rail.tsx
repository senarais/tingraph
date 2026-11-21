"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Blend,
  Circle,
  Diamond,
  Minus,
  Square,
  ChartColumn,
  Eraser,
  Fish,
  Grid3x3,
  Hand,
  Image as ImageIcon,
  Library,
  MousePointer2,
  MoveUpRight,
  Palette,
  Pencil,
  Shapes,
  Sheet,
  Sparkles,
  Table2,
  Type,
  Wand2,
  Waypoints,
  MessagesSquare,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useTingraphStore, type CanvasTool, type Drawer } from "@/lib/store";
import { CONNECTORS, defaultConnector, type ConnectorKind } from "@/lib/connectors";
import { figureDef } from "@/lib/figures/registry";
import { elementPanel } from "@/components/editor/element-drawer";
import { isFigure, type DiagramCategory } from "@/lib/types";

/**
 * Every instrument the editor has, in one column. A tool takes the pointer; a
 * panel slides the drawer out beside it; the connector opens the short list of
 * lines its notation draws with. Pressing whatever is already held puts it
 * back, so the column is never in a state the reader cannot leave.
 *
 * Every instrument has a key, shown beside its name and in its tooltip. A key
 * is only answered while the reader is not writing: not in a field, a caption
 * or the code editor, not while the Generate panel is out (it is open to be
 * typed into), and not behind a dialog. The keyboard half is the effect in
 * `Rail`; `shortcutFor` says what each letter reaches for.
 */

interface Entry {
  icon: LucideIcon;
  label: string;
  hint: string;
  /** the letter that reaches for it */
  key?: string;
  /** a second key for the same thing (the digit Excalidraw gives the pointer and hand) */
  alt?: string;
  tool?: CanvasTool;
  drawer?: Drawer;
  /** the connector instrument, which opens its own list */
  lines?: true;
  /** Studio's plain shapes, which open their own list */
  basics?: true;
  /** left out of the column when the notation has no use for it */
  only?: "graph" | "figure" | "settable" | "studio";
}

const INSTRUMENTS: Entry[] = [
  { icon: Hand, label: "Hand", hint: "Pan the sheet", key: "h", alt: "0", tool: "hand" },
  {
    icon: MousePointer2,
    label: "Select",
    hint: "Pick and move",
    key: "v",
    alt: "1",
    tool: "selection",
  },
  {
    icon: Shapes,
    label: "Shapes",
    hint: "Drop a shape on the sheet",
    key: "s",
    drawer: "shapes",
    only: "graph",
  },
  {
    icon: ChartColumn,
    label: "Figure",
    hint: "Everything this diagram is made of",
    key: "f",
    drawer: "figure",
    only: "figure",
  },
  {
    icon: Table2,
    label: "Elements",
    hint: "Everything this diagram is made of",
    key: "f",
    drawer: "elements",
    only: "settable",
  },
  {
    icon: Square,
    label: "Shapes",
    hint: "Rectangle, diamond, ellipse, arrow, line",
    key: "s",
    basics: true,
    only: "studio",
  },
  {
    icon: Sheet,
    label: "Table",
    hint: "Paste, import or make a table",
    key: "g",
    drawer: "table",
    only: "studio",
  },
  { icon: Type, label: "Text", hint: "Write on the sheet", key: "t", tool: "text" },
  { icon: ImageIcon, label: "Image", hint: "Place a picture", key: "i", tool: "image" },
  {
    icon: MoveUpRight,
    label: "Connector",
    hint: "Join two elements",
    key: "c",
    lines: true,
    only: "graph",
  },
  { icon: Pencil, label: "Draw", hint: "Freehand stroke", key: "p", tool: "freedraw" },
  { icon: Eraser, label: "Erase", hint: "Rub something out", key: "e", tool: "eraser" },
];

/**
 * Studio's plain shapes: Excalidraw's own, for whatever no notation draws. An
 * arrow drawn with them is an Excalidraw arrow, not a Tingraph connector; it
 * belongs to no notation and is routed by nothing.
 */
const BASICS: Array<{
  tool: CanvasTool;
  label: string;
  hint: string;
  icon: LucideIcon;
  key: string;
}> = [
  { tool: "rectangle", label: "Rectangle", hint: "a box, drawn by dragging", icon: Square, key: "r" },
  { tool: "diamond", label: "Diamond", hint: "a rhombus", icon: Diamond, key: "d" },
  { tool: "ellipse", label: "Ellipse", hint: "a circle or an oval", icon: Circle, key: "o" },
  { tool: "arrow", label: "Arrow", hint: "a free arrow, bent with its handles", icon: ArrowUpRight, key: "a" },
  { tool: "line", label: "Line", hint: "a plain line or polyline", icon: Minus, key: "l" },
];

const PANELS: Entry[] = [
  {
    icon: Wand2,
    label: "Generate",
    hint: "Write the diagram as source",
    key: "g",
    drawer: "source",
  },
  {
    icon: Sparkles,
    label: "Tingraph AI",
    hint: "Describe the diagram and have it written",
    key: "a",
    drawer: "ai",
  },
  { icon: Palette, label: "Style", hint: "Ink and drawing style", key: "y", drawer: "style" },
];

/** The panel a figure opens under, said and drawn the way that figure is. */
const FIGURE_ICONS: Partial<Record<DiagramCategory, LucideIcon>> = {
  mind: Waypoints,
  matrix: Grid3x3,
  venn: Blend,
  fishbone: Fish,
  sequence: MessagesSquare,
  prisma: Workflow,
};

/**
 * What the column carries for one notation. A figure has no shapes to drop and
 * nothing to join, and a graph has no spec to set, so each is offered only
 * what it can use. The figure's own panel is named and drawn after the figure
 * it opens — Fishbone, Venn, Mind map — because "Chart" means nothing on a
 * sheet that holds none.
 */
function instrumentsFor(category: DiagramCategory, mode: RailMode = "editor"): Entry[] {
  const figure = isFigure(category);
  const def = figureDef(category);
  const panel = elementPanel(category);
  return INSTRUMENTS.filter((entry) => {
    // Studio's library holds every notation, so it is always there to open
    if (mode === "studio" && entry.drawer === "shapes") {
      return true;
    }
    if (!entry.only) {
      return true;
    }
    if (entry.only === "studio") {
      return mode === "studio";
    }
    if (entry.only === "figure") {
      return figure;
    }
    if (entry.only === "settable") {
      return panel !== null;
    }
    return !figure;
  }).map((entry) => {
    if (mode === "studio" && entry.drawer === "shapes") {
      return {
        ...entry,
        icon: Library,
        label: "Library",
        key: "b",
        hint: "Every notation: its shapes and its examples",
      };
    }
    if (entry.drawer === "figure" && def) {
      return {
        ...entry,
        label: def.label,
        icon: FIGURE_ICONS[category] ?? entry.icon,
        hint: `Everything this ${def.label.toLowerCase()} is made of`,
      };
    }
    if (entry.drawer === "elements" && panel) {
      return { ...entry, label: panel.label, icon: panel.icon, hint: panel.hint };
    }
    return entry;
  });
}

/**
 * Whether one of Tingraph's own dialogs stands over the sheet. Excalidraw keeps
 * a hidden `aria-modal` colour picker alive inside its own tree, which is not
 * a dialog and must not silence the keys.
 */
export function overDialog(): boolean {
  return document.querySelector("dialog[open], [aria-modal='true']:not(.excalidraw *)") !== null;
}

type Shortcut = { entry: Entry } | { shape: CanvasTool };

/**
 * What a letter reaches for in this notation and mode: an instrument or panel
 * of the column, or one of Studio's plain shapes. Only what the column offers
 * answers, so `a` is Tingraph AI on the editor and the arrow in Studio.
 */
export function shortcutFor(key: string, category: DiagramCategory, mode: RailMode): Shortcut | null {
  const column = [
    ...instrumentsFor(category, mode),
    ...PANELS.filter((entry) => mode === "editor" || entry.drawer === "style"),
  ];
  const entry = column.find((item) => item.key === key || item.alt === key);
  if (entry) {
    return { entry };
  }
  const shape = mode === "studio" ? BASICS.find((item) => item.key === key) : undefined;
  return shape ? { shape: shape.tool } : null;
}

/**
 * Whether a key press belongs to whatever the reader is typing into.
 *
 * The code editor is the awkward one: Monaco writes through an `EditContext`
 * on a plain `div`, which is neither an input nor contenteditable, so it has
 * to be recognised by where it sits rather than by what it is. Miss it and
 * every letter typed into the source reaches for a tool instead.
 */
export function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement &&
      (target.isContentEditable || target.closest(".monaco-editor") !== null))
  );
}

/**
 * The keys Excalidraw would otherwise take a tool from. Those the rail gives
 * its own meaning are answered by the rail; the rest reach for nothing — they
 * are stopped so that they do nothing at all, and the rail stays the only
 * place a tool is chosen.
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
    <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 items-center gap-2 border-2 border-edge bg-edge px-2 py-1 text-bone shadow-[3px_3px_0_var(--edge)] sm:flex">
      <span className="whitespace-nowrap font-mono text-[11.5px] leading-none">
        {entry.label}
      </span>
      {entry.key && (
        <kbd className="border border-bone/50 px-1 font-mono text-[10px] leading-[14px] text-bone">
          {entry.key.toUpperCase()}
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
        aria-keyshortcuts={entry.key ? [entry.key, entry.alt].filter(Boolean).join(" ").toUpperCase() : undefined}
        aria-label={`${entry.label}: ${entry.hint}`}
        onClick={() => {
          leave();
          onPress();
        }}
        className={`grid h-11 w-11 place-items-center border-2 transition-colors sm:h-10 sm:w-10 ${
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

/**
 * The editor's column, or Studio's: Studio draws by hand in every notation,
 * so it has a library in place of the shape drawer and carries neither
 * Generate nor Tingraph AI.
 */
export type RailMode = "editor" | "studio";

export default function Rail({
  category,
  onOpenAi = () => {},
  mode = "editor",
}: {
  category: DiagramCategory;
  onOpenAi?: () => void;
  mode?: RailMode;
}) {
  const tool = useTingraphStore((s) => s.tool);
  const setTool = useTingraphStore((s) => s.setTool);
  const drawer = useTingraphStore((s) => s.drawer);
  const openDrawer = useTingraphStore((s) => s.openDrawer);
  const connector = useTingraphStore((s) => s.connector);
  const setConnector = useTingraphStore((s) => s.setConnector);
  const panning = useTingraphStore((s) => s.panning);
  const setPanning = useTingraphStore((s) => s.setPanning);
  const [lines, setLines] = useState(false);
  const [basics, setBasics] = useState(false);
  const basic = BASICS.find((entry) => entry.tool === tool) ?? null;

  // the lists are panels over the sheet, so they shut when the reader
  // reaches past them
  useEffect(() => {
    if (!lines && !basics) {
      return;
    }
    const away = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest?.("nav[aria-label='Editor tools']")) {
        setLines(false);
        setBasics(false);
      }
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [lines, basics]);

  const press = (entry: Entry) => {
    if (entry.basics) {
      setLines(false);
      setBasics(!basics);
      return;
    }
    setBasics(false);
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
      if (entry.drawer === "ai") {
        onOpenAi();
      } else {
        openDrawer(entry.drawer);
      }
    }
  };

  /**
   * The keyboard half of the column.
   *
   * Every instrument answers to the letter shown beside it (the pointer and
   * the hand to a digit as well). Every other key Excalidraw would take one of
   * its own tools from is swallowed here instead — the rail is the only place
   * a tool is chosen, so a stray `r` must not leave a rectangle tool in the
   * reader's hand where the sheet has no use for one.
   *
   * Nothing is answered, or swallowed, while the reader is writing: in a panel
   * field, in a caption on the sheet, or in the code editor. The Generate panel
   * goes further and takes the keyboard entirely while it is out — it is open
   * in order to be typed into — and so does a dialog standing over the sheet.
   * Both still stop the key from reaching Excalidraw; neither acts on it.
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
        setBasics(false);
        return;
      }
      // a shifted letter is Excalidraw's own (Shift+H and Shift+V flip the
      // selection), so it goes through untouched, as it always has; Caps Lock
      // alone still reaches the rail, which is why the letter is lowered
      if (event.shiftKey) {
        return;
      }
      const key = event.key.toLowerCase();
      const entry = shortcutFor(key, category, mode);
      if (!entry && !STOLEN_KEYS.has(key)) {
        return;
      }
      // either way Excalidraw never sees it
      event.preventDefault();
      event.stopPropagation();
      if (!entry || drawer === "source" || overDialog()) {
        return;
      }
      if ("shape" in entry) {
        // a plain shape from Studio's list
        setLines(false);
        setBasics(false);
        setTool(entry.shape);
        return;
      }
      press(entry.entry);
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
    if (entry.basics) {
      return basic !== null && connector === null;
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
      className="order-2 flex h-14 w-full shrink-0 items-center gap-1 overflow-x-auto border-t-2 border-edge bg-bone px-2 sm:order-none sm:h-auto sm:w-14 sm:flex-col sm:overflow-visible sm:border-r-2 sm:border-t-0 sm:px-0 sm:py-3"
    >
      {instrumentsFor(category, mode).map((entry) => (
        <RailButton
          key={entry.label}
          entry={entry.basics && basic ? { ...entry, icon: basic.icon } : entry}
          held={isHeld(entry)}
          onPress={() => press(entry)}
        >
          {entry.basics && basics && (
            <div className="slab-tight fixed bottom-16 left-2 right-2 z-50 bg-white sm:absolute sm:bottom-auto sm:left-full sm:right-auto sm:top-0 sm:ml-2 sm:w-56">
              <p className="border-b-2 border-edge px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                Shapes · plain, in no notation
              </p>
              {BASICS.map((item) => {
                const Icon = item.icon;
                const on = tool === item.tool && connector === null;
                return (
                  <button
                    key={item.tool}
                    type="button"
                    onClick={() => {
                      setTool(item.tool);
                      setBasics(false);
                    }}
                    className={`flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors ${
                      on ? "bg-edge text-bone" : "text-ink hover:bg-bone"
                    }`}
                  >
                    <Icon size={15} aria-hidden="true" className="shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[11.5px] leading-tight">{item.label}</span>
                      <span className={`block font-mono text-[10px] leading-tight ${on ? "text-bone/70" : "text-ink-faint"}`}>
                        {item.hint}
                      </span>
                    </span>
                    <kbd className={`border px-1 font-mono text-[10px] leading-[14px] ${on ? "border-bone/50" : "border-edge/40 text-ink-faint"}`}>
                      {item.key.toUpperCase()}
                    </kbd>
                  </button>
                );
              })}
            </div>
          )}
          {entry.lines && lines && connector !== null && (
              <div className="slab-tight fixed bottom-16 left-2 right-2 z-50 max-h-[65dvh] overflow-y-auto bg-white sm:absolute sm:bottom-auto sm:left-full sm:right-auto sm:top-0 sm:ml-2 sm:w-60">
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
      <hr className="mx-1 h-7 border-l-2 border-edge sm:mx-0 sm:my-2 sm:h-0 sm:w-7 sm:border-l-0 sm:border-t-2" />
      {PANELS.filter((entry) => mode === "editor" || entry.drawer === "style").map((entry) => (
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
