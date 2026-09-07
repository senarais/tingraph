"use client";

import dynamic from "next/dynamic";

const TingraphEditor = dynamic(() => import("@/components/tingraph-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-white text-sm text-zinc-400">
      Loading Tingraph editor…
    </div>
  ),
});

export default function EditorShell() {
  return <TingraphEditor />;
}
