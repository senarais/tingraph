import { create } from "zustand";
import { DEFAULT_INK, INK_PRESETS, type InkId } from "@/lib/ink";
import { TEMPLATE_LABELS, TEMPLATES } from "@/lib/templates";
import { DiagramCategory, LayoutDirection } from "@/lib/types";

export type SidePanel = "source" | "shapes" | "guide";

interface TingraphState {
  code: string;
  category: DiagramCategory;
  /** which way the next drawing grows; BPMN ignores it */
  direction: LayoutDirection;
  ink: InkId;
  panel: SidePanel;
  sidebarOpen: boolean;
  /** Excalidraw's shape-properties panel, off until the reader asks for it */
  propertiesOpen: boolean;
  setCode: (code: string) => void;
  setCategory: (category: DiagramCategory) => void;
  setDirection: (direction: LayoutDirection) => void;
  setInk: (ink: InkId) => void;
  setPanel: (panel: SidePanel) => void;
  toggleSidebar: () => void;
  toggleProperties: () => void;
}

export const useTingraphStore = create<TingraphState>((set) => ({
  code: TEMPLATES.bpmn,
  category: "bpmn",
  direction: "down",
  ink: DEFAULT_INK,
  panel: "source",
  sidebarOpen: true,
  propertiesOpen: false,
  setCode: (code) => set({ code }),
  setCategory: (category) => set({ category, code: TEMPLATES[category] }),
  setDirection: (direction) => set({ direction }),
  setInk: (ink) => set({ ink }),
  setPanel: (panel) => set({ panel }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  toggleProperties: () =>
    set((state) => ({ propertiesOpen: !state.propertiesOpen })),
}));

if (typeof window !== "undefined") {
  (window as unknown as { __tingraphStore?: object }).__tingraphStore = {
    getState: () => useTingraphStore.getState(),
    setState: (partial: object) => useTingraphStore.setState(partial),
  };
}

export { INK_PRESETS, TEMPLATE_LABELS, TEMPLATES };
export type { InkId };
