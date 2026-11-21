"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, getSession } from "@/lib/api/client";
import type { SharedDiagram } from "@/lib/api/types";
import type { Json } from "@/lib/json";
import { readSavedDiagram, type OpenedDiagram } from "@/lib/saved-diagrams";
import { useTingraphStore } from "@/lib/store";
import { readStudioDocument, STUDIO_CATEGORY } from "@/lib/studio-document";
import type { OpenedStudio } from "@/components/studio/studio-root";

/**
 * A shared link, opened. What it shows depends on the link and the reader:
 *
 * - the owner, signed in, is sent to their own diagram, where Share lives;
 * - an edit link and a signed-in reader get the whole editor (or Studio),
 *   saving through the link into the owner's diagram;
 * - everyone else — a view link, or an edit link before signing in — gets
 *   the drawing read-only, with a way to sign in when the link allows edits.
 */

const EditorRoot = dynamic(() => import("@/components/editor/editor-root"), { ssr: false, loading: Opening });
const StudioRoot = dynamic(() => import("@/components/studio/studio-root"), { ssr: false, loading: Opening });
const SharedView = dynamic(() => import("@/components/shared/shared-view"), { ssr: false, loading: Opening });

function Opening() {
  return (
    <div className="flex h-dvh items-center justify-center bg-bone font-mono text-[13px] text-ink-faint">
      Opening the shared diagram…
    </div>
  );
}

type Loaded =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "view"; title: string; scene: Json; editable: boolean }
  | { status: "editor"; diagram: OpenedDiagram }
  // built once, here: Studio re-reads its settings whenever `initial` changes
  | { status: "studio"; initial: OpenedStudio };

export default function SharedShell({ token }: { token: string }) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const response = await apiFetch(`/api/v1/shared/${encodeURIComponent(token)}`).catch(() => null);
      if (!alive) return;
      if (!response?.ok) {
        setLoaded({
          status: "error",
          message:
            response?.status === 404
              ? "This link does not open anything. It may have been turned off or replaced by its owner."
              : response?.status === 429
                ? "Too many requests. Wait a minute and open the link again."
                : "The shared diagram could not be loaded.",
        });
        return;
      }
      const data = (await response.json()) as SharedDiagram;
      const studio = data.diagram.category === STUDIO_CATEGORY;
      if (data.owned) {
        window.location.replace(
          studio
            ? `/studio?diagram=${encodeURIComponent(data.owned)}`
            : `/editor?type=${encodeURIComponent(data.diagram.category)}&diagram=${encodeURIComponent(data.owned)}`,
        );
        return;
      }
      const studioDocument = studio ? readStudioDocument(data.diagram.document) : null;
      const document = studio ? null : readSavedDiagram(data.diagram.document, data.diagram.category);
      const read = studioDocument ?? document;
      if (!read) {
        setLoaded({ status: "error", message: "This shared diagram has invalid data and could not be opened." });
        return;
      }
      const session = data.access === "edit" ? await getSession().catch(() => null) : null;
      if (!alive) return;
      if (!session?.user) {
        setLoaded({ status: "view", title: data.diagram.title, scene: read.scene, editable: data.access === "edit" });
        return;
      }
      // the editor reads its settings from the store before its first paint
      useTingraphStore.setState({
        ...(document ? { category: document.category, code: document.source, direction: document.direction } : {}),
        ink: read.ink,
        mixed: read.ink.color,
        style: read.style,
        drawer: null,
        exportOpen: false,
        chat: [],
        thinking: false,
        saved: null,
      });
      if (studioDocument) {
        setLoaded({
          status: "studio",
          initial: {
            id: "",
            title: data.diagram.title,
            document: studioDocument,
            revision: data.diagram.revision,
            shared: token,
          },
        });
      } else if (document) {
        setLoaded({
          status: "editor",
          diagram: { id: "", title: data.diagram.title, document, revision: data.diagram.revision, shared: token },
        });
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [token]);

  switch (loaded.status) {
    case "loading":
      return <Opening />;
    case "error":
      return (
        <div className="flex h-dvh items-center justify-center bg-bone px-4 font-mono">
          <div className="slab max-w-md bg-white p-6 text-center">
            <p className="text-[14px] leading-relaxed text-ink">{loaded.message}</p>
            <Link
              href="/"
              className="slab-tight press mt-5 inline-block bg-white px-3 py-2 text-[12px] font-semibold text-ink"
            >
              Tingraph home
            </Link>
          </div>
        </div>
      );
    case "view":
      return <SharedView token={token} title={loaded.title} scene={loaded.scene} editable={loaded.editable} />;
    case "editor":
      return <EditorRoot initialDiagram={loaded.diagram} />;
    case "studio":
      return <StudioRoot initial={loaded.initial} />;
  }
}
