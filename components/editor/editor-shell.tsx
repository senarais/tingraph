"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useTingraphStore } from "@/lib/store";
import { DiagramCategory } from "@/lib/types";

const EditorRoot = dynamic(() => import("@/components/editor/editor-root"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-bone font-mono text-[13px] text-ink-faint">
      Opening the sheet…
    </div>
  ),
});

export default function EditorShell({
  initialCategory,
}: {
  initialCategory: DiagramCategory;
}) {
  // seeded before the editor mounts, so the notation chosen on the way in is
  // the one on the first paint rather than a swap the reader watches happen
  useState(() => {
    const store = useTingraphStore.getState();
    if (store.category !== initialCategory || store.code === "") {
      store.setCategory(initialCategory);
    }
  });
  return <EditorRoot />;
}
