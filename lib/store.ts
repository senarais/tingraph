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

interface TingraphState {
  code: string;
  category: DiagramCategory;
  accent: AccentColor;
  cheatSheetOpen: boolean;
  sidebarOpen: boolean;
  setCode: (code: string) => void;
  setCategory: (category: DiagramCategory) => void;
  setAccent: (accent: AccentColor) => void;
  toggleCheatSheet: () => void;
  toggleSidebar: () => void;
}

export const useTingraphStore = create<TingraphState>((set) => ({
  code: TEMPLATES.bpmn,
  category: "bpmn",
  accent: "#1e1e1e",
  cheatSheetOpen: true,
  sidebarOpen: true,
  setCode: (code) => set({ code }),
  setCategory: (category) => set({ category, code: TEMPLATES[category] }),
  setAccent: (accent) => set({ accent }),
  toggleCheatSheet: () =>
    set((state) => ({ cheatSheetOpen: !state.cheatSheetOpen })),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));

export { TEMPLATE_LABELS, TEMPLATES };
