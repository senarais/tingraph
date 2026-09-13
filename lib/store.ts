import { create } from "zustand";
import {
  DEFAULT_INK_CHOICE,
  INK_PRESETS,
  customInk,
  type InkChoice,
} from "@/lib/ink";
import { DEFAULT_SHEET_STYLE, type SheetStyleId } from "@/lib/sheet";
import { TEMPLATE_LABELS, TEMPLATES } from "@/lib/templates";
import { DiagramCategory, LayoutDirection } from "@/lib/types";

/**
 * The rail's panels. Only one is ever out, and it can always be shut.
 *
 * `figure` is the one a figure is set from; `elements` is its counterpart for
 * the graphs whose elements carry a spec of their own — see `isSettable`.
 * `ai` is the chatbot, which writes source rather than drawing anything.
 */
export type Drawer = "shapes" | "figure" | "elements" | "source" | "style" | "ai";

/**
 * One line of the conversation with Tingraph AI.
 *
 * It is kept here rather than in the panel because the panel is unmounted
 * every time the reader shuts it, and an answer that took a few seconds to
 * come back must still be there when they open it again — including one that
 * arrives after they have shut it.
 */
export interface ChatTurn {
  role: "you" | "ai";
  text: string;
  /** the diagram that came back with it: parsed, laid out, ready to generate */
  source?: string;
}

/** The canvas tools the rail drives, named the way Excalidraw names them. */
export type CanvasTool =
  | "selection"
  | "hand"
  | "text"
  | "image"
  | "freedraw"
  | "eraser";

interface TingraphState {
  code: string;
  category: DiagramCategory;
  /** which way the next drawing grows; BPMN ignores it */
  direction: LayoutDirection;
  ink: InkChoice;
  style: SheetStyleId;
  /** ink the reader mixed, kept so the swatch survives a preset detour */
  mixed: string;
  drawer: Drawer | null;
  /** the source drawer shows either the code or the language guide */
  sourceTab: "code" | "guide";
  tool: CanvasTool;
  /**
   * The connector the rail is holding, by name, or null when it is holding
   * none. Connectors are Tingraph's own instrument rather than one of
   * Excalidraw's tools, so they are held apart from `tool`.
   */
  connector: string | null;
  /** space is down, so the sheet is being panned whatever else is held */
  panning: boolean;
  exportOpen: boolean;
  chat: ChatTurn[];
  /** a question is out with Tingraph AI and has not come back */
  thinking: boolean;
  setCode: (code: string) => void;
  setCategory: (category: DiagramCategory) => void;
  setDirection: (direction: LayoutDirection) => void;
  setInk: (ink: InkChoice) => void;
  mix: (color: string) => void;
  setStyle: (style: SheetStyleId) => void;
  openDrawer: (drawer: Drawer) => void;
  closeDrawer: () => void;
  setSourceTab: (tab: "code" | "guide") => void;
  setTool: (tool: CanvasTool) => void;
  setConnector: (connector: string | null) => void;
  setPanning: (panning: boolean) => void;
  setExportOpen: (open: boolean) => void;
  say: (turn: ChatTurn) => void;
  setThinking: (thinking: boolean) => void;
  clearChat: () => void;
}

export const useTingraphStore = create<TingraphState>((set) => ({
  code: TEMPLATES.bpmn,
  category: "bpmn",
  direction: "down",
  ink: DEFAULT_INK_CHOICE,
  style: DEFAULT_SHEET_STYLE,
  mixed: "#1e3a8a",
  drawer: null,
  sourceTab: "code",
  tool: "selection",
  connector: null,
  panning: false,
  exportOpen: false,
  chat: [],
  thinking: false,
  setCode: (code) => set({ code }),
  // another notation is another sheet, and the conversation was about the old
  // one: the chatbot writes in one notation at a time, like the editor
  setCategory: (category) =>
    set({ category, code: TEMPLATES[category], chat: [], thinking: false }),
  setDirection: (direction) => set({ direction }),
  setInk: (ink) => set({ ink }),
  mix: (color) => set({ ink: customInk(color), mixed: color }),
  setStyle: (style) => set({ style }),
  // the rail toggles: pressing the panel that is already out shuts it
  openDrawer: (drawer) =>
    set((state) => ({ drawer: state.drawer === drawer ? null : drawer })),
  closeDrawer: () => set({ drawer: null }),
  setSourceTab: (sourceTab) => set({ sourceTab }),
  // the two instruments are exclusive: picking one puts the other back
  setTool: (tool) => set({ tool, connector: null }),
  setConnector: (connector) => set({ connector, tool: "selection" }),
  setPanning: (panning) => set({ panning }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
  say: (turn) => set((state) => ({ chat: [...state.chat, turn] })),
  setThinking: (thinking) => set({ thinking }),
  clearChat: () => set({ chat: [] }),
}));

if (typeof window !== "undefined") {
  (window as unknown as { __tingraphStore?: object }).__tingraphStore = {
    getState: () => useTingraphStore.getState(),
    setState: (partial: object) => useTingraphStore.setState(partial),
  };
}

export { INK_PRESETS, TEMPLATE_LABELS };
