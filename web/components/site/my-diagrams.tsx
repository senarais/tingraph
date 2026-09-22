"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Clock3, Trash2 } from "lucide-react";
import { DiagramArt } from "@/components/site/diagram-art";
import { APIError, apiFetch, getSession } from "@/lib/api/client";
import type { DiagramSummary } from "@/lib/api/types";
import { isDiagramCategory } from "@/lib/saved-diagrams";
import { ACCENTS, ALL_DIAGRAMS } from "@/lib/diagrams";

type Diagram = DiagramSummary;

const DATE = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function MyDiagrams({ query }: { query: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [diagrams, setDiagrams] = useState<Diagram[] | null>(null);
  const [problem, setProblem] = useState("");
  const [armed, setArmed] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const session = await getSession().catch(() => null);
      if (!alive) return;
      if (!session?.user) {
        setDiagrams([]);
        return;
      }
      setUserId(session.user.id);
      const response = await apiFetch("/api/v1/diagrams").catch(() => null);
      if (!alive) return;
      if (!response?.ok) {
        setProblem("Your diagrams could not be loaded. Try again.");
        setDiagrams([]);
        return;
      }
      const data = (await response.json()) as { diagrams: Diagram[] };
      setProblem("");
      setDiagrams(data.diagrams);
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  const remove = async (id: string) => {
    if (armed !== id) {
      setArmed(id);
      return;
    }
    if (!userId) return;
    setDeleting(id);
    setProblem("");
    const response = await apiFetch(`/api/v1/diagrams/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch((cause) => cause as APIError);
    setDeleting(null);
    setArmed(null);
    if (!(response instanceof Response) || !response.ok) {
      setProblem("Diagram could not be deleted. Try again.");
      return;
    }
    setDiagrams((current) => current?.filter((diagram) => diagram.id !== id) ?? []);
  };

  if (diagrams === null) {
    return (
      <p className="slab mt-6 bg-white p-6 text-[13.5px] text-ink-soft" role="status">
        Loading your diagrams…
      </p>
    );
  }

  if (!userId) {
    return (
      <div className="slab mt-6 bg-white p-6">
        <h2 className="font-mono text-lg font-semibold text-ink">Sign in to keep diagrams</h2>
        <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-ink-soft">
          Saved diagrams are private to your account and reopen with every canvas edit intact.
        </p>
        {problem && <p className="mt-3 text-[12.5px] text-alert">{problem}</p>}
        <Link
          href={`/login?next=${encodeURIComponent("/build?view=mine")}`}
          className="slab-tight press mt-5 inline-block bg-edge px-4 py-2 font-mono text-[12.5px] font-semibold text-bone"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const needle = query.trim().toLowerCase();
  const shown = diagrams.filter((diagram) => {
    const kind = ALL_DIAGRAMS.find((entry) => entry.id === diagram.category);
    return (
      needle === "" ||
      `${diagram.title} ${diagram.category} ${kind?.name ?? ""}`.toLowerCase().includes(needle)
    );
  });

  return (
    <>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="font-mono text-[12px] text-ink-soft">
          {shown.length} of {diagrams.length} saved diagrams
        </p>
        {problem && (
          <p className="text-right text-[12px] text-alert" role="alert">
            {problem}
          </p>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="slab mt-6 bg-white p-6">
          <p className="text-[13.5px] text-ink-soft">
            {diagrams.length === 0
              ? "No saved diagrams yet. Open a notation, draw, then press Save in the editor."
              : "No saved diagram matches that search."}
          </p>
          {diagrams.length === 0 && (
            <Link
              href="/build?view=browse"
              className="mt-4 inline-block font-mono text-[12.5px] font-semibold text-ink underline underline-offset-4"
            >
              Browse notations
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((diagram) => {
            const kind = ALL_DIAGRAMS.find((entry) => entry.id === diagram.category);
            const category = isDiagramCategory(diagram.category) ? diagram.category : "flow";
            const tone = kind ? ACCENTS[kind.accent] : ACCENTS.navy;
            const confirming = armed === diagram.id;
            return (
              <article key={diagram.id} className="slab flex flex-col bg-white">
                <div
                  className="flex h-36 items-center justify-center overflow-hidden border-b-2 border-edge px-4 py-3"
                  style={{ backgroundColor: tone.wash }}
                >
                  <DiagramArt
                    id={category}
                    accent={kind?.accent}
                    className="h-full w-full"
                  />
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 break-words font-mono text-[15px] font-semibold text-ink">
                      {diagram.title}
                    </h2>
                    <code className="shrink-0 border border-edge bg-bone px-1.5 py-0.5 font-mono text-[10.5px] text-ink">
                      {category}
                    </code>
                  </div>
                  <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-ink-faint">
                    <Clock3 size={12} />
                    Updated {DATE.format(new Date(diagram.updated_at))}
                  </p>
                  <div className="mt-auto flex gap-2 pt-5">
                    <Link
                      href={`/editor?type=${category}&diagram=${diagram.id}`}
                      className="flex-1 border-2 border-edge bg-edge px-3 py-2 text-center font-mono text-[12px] font-semibold text-bone transition-colors hover:bg-navy"
                    >
                      Open
                    </Link>
                    <button
                      type="button"
                      onClick={() => void remove(diagram.id)}
                      onBlur={() => setArmed((current) => (current === diagram.id ? null : current))}
                      disabled={deleting === diagram.id}
                      className={`slab-tight press flex items-center gap-1.5 px-3 py-2 font-mono text-[12px] font-semibold disabled:cursor-wait disabled:opacity-50 ${
                        confirming ? "bg-alert text-white" : "bg-white text-alert"
                      }`}
                      aria-label={confirming ? `Confirm delete ${diagram.title}` : `Delete ${diagram.title}`}
                    >
                      <Trash2 size={13} />
                      {deleting === diagram.id ? "Deleting…" : confirming ? "Delete?" : "Delete"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
