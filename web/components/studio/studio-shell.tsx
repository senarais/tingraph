"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, getSession } from "@/lib/api/client";
import type { Diagram } from "@/lib/api/types";
import { readStudioDocument, STUDIO_CATEGORY } from "@/lib/studio-document";
import type { OpenedStudio } from "@/components/studio/studio-root";

const StudioRoot = dynamic(() => import("@/components/studio/studio-root"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-bone font-mono text-[13px] text-ink-faint">
      Opening Studio…
    </div>
  ),
});

type Loaded =
  | { status: "loading" }
  | { status: "error"; message: string; signIn?: boolean }
  | OpenedStudio;

/** A Studio sheet, fresh or saved; a saved one is read and checked before it is drawn. */
export default function StudioShell({ diagramId }: { diagramId?: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(diagramId ? { status: "loading" } : null);

  useEffect(() => {
    if (!diagramId) return;
    let alive = true;
    const load = async () => {
      const session = await getSession().catch(() => null);
      if (!alive) return;
      if (!session?.user) {
        setLoaded({ status: "error", message: "Sign in to open this Studio sheet.", signIn: true });
        return;
      }
      const response = await apiFetch(`/api/v1/diagrams/${encodeURIComponent(diagramId)}`).catch(() => null);
      if (!alive) return;
      if (!response?.ok) {
        setLoaded({
          status: "error",
          message: response?.status === 404 ? "Studio sheet not found." : "This Studio sheet could not be loaded.",
        });
        return;
      }
      const { diagram: data } = (await response.json()) as { diagram: Diagram };
      if (data.category !== STUDIO_CATEGORY) {
        // a diagram in one notation belongs to the editor
        window.location.replace(`/editor?type=${encodeURIComponent(data.category)}&diagram=${encodeURIComponent(data.id)}`);
        return;
      }
      const document = readStudioDocument(data.document);
      if (!document) {
        setLoaded({ status: "error", message: "This saved Studio sheet has invalid data and could not be opened." });
        return;
      }
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
          Opening saved Studio sheet…
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
                href={`/login?next=${encodeURIComponent(`/studio?diagram=${diagramId}`)}`}
                className="slab-tight press bg-edge px-3 py-2 text-[12px] font-semibold text-bone"
              >
                Sign in
              </Link>
            )}
            <Link href="/editor?view=mine" className="slab-tight press bg-white px-3 py-2 text-[12px] font-semibold text-ink">
              My diagrams
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <StudioRoot initial={loaded ?? undefined} />;
}
