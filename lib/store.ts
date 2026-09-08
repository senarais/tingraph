import { create } from "zustand";
import { TEMPLATE_LABELS, TEMPLATES } from "@/lib/templates";
import { DiagramCategory } from "@/lib/types";

export const ACCENT_PRESETS = [
  { name: "Monochrome", color: "#1e1e1e" },
  { name: "Formal Blue", color: "#1e3a8a" },
  { name: "Formal Red", color: "#991b1b" },
  { name: "Formal Green", color: "#065f46" },
] as const;

export type AccentColor = (typeof ACCENT_PRESETS)[number]["color"];

export type SidePanel = "source" | "shapes" | "guide";

interface TingraphState {
  code: string;
  category: DiagramCategory;
  accent: AccentColor;
  panel: SidePanel;
  sidebarOpen: boolean;
  /** Excalidraw's shape-properties panel, off until the reader asks for it */
  propertiesOpen: boolean;
  setCode: (code: string) => void;
  setCategory: (category: DiagramCategory) => void;
  setAccent: (accent: AccentColor) => void;
  setPanel: (panel: SidePanel) => void;
  toggleSidebar: () => void;
  toggleProperties: () => void;
}

export const useTingraphStore = create<TingraphState>((set) => ({
  code: TEMPLATES.bpmn,
  category: "bpmn",
  accent: "#1e1e1e",
  panel: "source",
  sidebarOpen: true,
  propertiesOpen: false,
  setCode: (code) => set({ code }),
  setCategory: (category) => set({ category, code: TEMPLATES[category] }),
  setAccent: (accent) => set({ accent }),
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

export { TEMPLATE_LABELS, TEMPLATES };
