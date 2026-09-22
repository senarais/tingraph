"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, getSession } from "@/lib/api/client";
import type { Diagram } from "@/lib/api/types";
import { readSavedDiagram, type OpenedDiagram } from "@/lib/saved-diagrams";
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
  diagramId,
}: {
  initialCategory: DiagramCategory;
  diagramId?: string;
}) {
  // seeded before the editor mounts, so the notation chosen on the way in is
  // the one on the first paint rather than a swap the reader watches happen
  useState(() => {
    const store = useTingraphStore.getState();
    if (store.category !== initialCategory || store.code === "") {
      store.setCategory(initialCategory);
    }
  });
  const [loaded, setLoaded] = useState<
    | { status: "loading" }
    | { status: "error"; message: string; signIn?: boolean }
    | OpenedDiagram
    | null
  >(
    diagramId
      ? { status: "loading" }
      : null,
  );

  useEffect(() => {
    if (!diagramId) {
      return;
    }
    let alive = true;
    const load = async () => {
      const session = await getSession().catch(() => null);
      if (!alive) return;
      if (!session?.user) {
        setLoaded({
          status: "error",
          message: "Sign in to open this diagram.",
          signIn: true,
        });
        return;
      }
      const response = await apiFetch(`/api/v1/diagrams/${encodeURIComponent(diagramId)}`).catch(
        () => null,
      );
      if (!alive) return;
      if (!response?.ok) {
        setLoaded({
          status: "error",
          message: response?.status === 404 ? "Diagram not found." : "This diagram could not be loaded.",
        });
        return;
      }
      const { diagram: data } = (await response.json()) as { diagram: Diagram };
      const document = readSavedDiagram(data.document, data.category);
      if (!document) {
        setLoaded({
          status: "error",
          message: "This saved diagram has invalid data and could not be opened.",
        });
        return;
      }
      useTingraphStore.setState({
        category: document.category,
        code: document.source,
        direction: document.direction,
        ink: document.ink,
        mixed: document.ink.color,
        style: document.style,
        drawer: null,
        exportOpen: false,
        chat: [],
        thinking: false,
      });
      setLoaded({ id: data.id, title: data.title, document });
    };
    void load();
    return () => {
      alive = false;
    };
  }, [diagramId]);

  if (loaded && "status" in loaded) {
    if (loaded.status === "loading") {
      return (
        <div className="flex h-dvh items-center justify-center bg-bone font-mono text-[13px] text-ink-faint">
          Opening saved diagram…
        </div>
      );
    }
    return (
      <div className="flex h-dvh items-center justify-center bg-bone px-4 font-mono">
        <div className="slab max-w-md bg-white p-6 text-center">
          <p className="text-[14px] text-ink">{loaded.message}</p>
          <div className="mt-5 flex justify-center gap-3">
            {loaded.signIn && (
              <Link
                href={`/login?next=${encodeURIComponent(`/editor?diagram=${diagramId}`)}`}
                className="slab-tight press bg-edge px-3 py-2 text-[12px] font-semibold text-bone"
              >
                Sign in
              </Link>
            )}
            <Link
              href="/build?view=mine"
              className="slab-tight press bg-white px-3 py-2 text-[12px] font-semibold text-ink"
            >
              My diagrams
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <EditorRoot initialDiagram={loaded ?? undefined} />;
}
