"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useTingraphStore } from "@/lib/store";
import { DiagramCategory } from "@/lib/types";

const TingraphEditor = dynamic(() => import("@/components/tingraph-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-white text-sm text-zinc-400">
      Loading Tingraph editor…
    </div>
  ),
});

export default function EditorShell({
  initialCategory,
}: {
  initialCategory?: DiagramCategory;
}) {
  // seeded before the editor mounts, so the notation asked for on the way in is
  // the one on the first paint rather than a swap the reader watches happen
  useState(() => {
    if (initialCategory) {
      useTingraphStore.getState().setCategory(initialCategory);
    }
  });
  return <TingraphEditor />;
}
