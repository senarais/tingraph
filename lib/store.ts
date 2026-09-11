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

/** The rail's panels. Only one is ever out, and it can always be shut. */
export type Drawer = "shapes" | "chart" | "source" | "style";

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
  setCode: (code) => set({ code }),
  setCategory: (category) => set({ category, code: TEMPLATES[category] }),
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
}));

if (typeof window !== "undefined") {
  (window as unknown as { __tingraphStore?: object }).__tingraphStore = {
    getState: () => useTingraphStore.getState(),
    setState: (partial: object) => useTingraphStore.setState(partial),
  };
}

export { INK_PRESETS, TEMPLATE_LABELS };
