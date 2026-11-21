"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, X } from "lucide-react";
import { APIError, apiFetch } from "@/lib/api/client";
import type { DiagramShare, ShareAccess } from "@/lib/api/types";
import { Segmented, SlabButton, Tick } from "@/components/editor/ui";

/**
 * Sharing a saved diagram, the way a document is shared: one link, and what
 * the link allows. Anyone with a view link sees the drawing without an
 * account; an edit link opens it on the editor for anyone signed in, and
 * their saves land on this diagram. Changing view to edit keeps the link
 * already handed out; "New link" replaces it, and every copy of the old one
 * stops working; "Stop sharing" turns it off.
 *
 * A sheet that has never been saved has nothing to share yet, so the dialog
 * offers to save it first.
 */

type Mode = "off" | ShareAccess;

export function shareUrl(token: string): string {
  return `${window.location.origin}/shared/${token}`;
}

export default function ShareDialog({
  open,
  diagramId,
  noun,
  onSave,
  onClose,
}: {
  open: boolean;
  /** the saved diagram, or null while the sheet has never been saved */
  diagramId: string | null;
  /** "diagram" or "Studio sheet" */
  noun: string;
  onSave: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [share, setShare] = useState<DiagramShare | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "busy" | "error">("loading");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  // what the link is now, read when the dialog opens; it is mounted afresh
  // each time, so nothing from the last opening is left in its state
  useEffect(() => {
    if (!open || !diagramId) return;
    let alive = true;
    apiFetch(`/api/v1/diagrams/${encodeURIComponent(diagramId)}/share`)
      .then(async (response) => {
        if (!alive) return;
        if (!response.ok) throw await APIError.from(response);
        const data = (await response.json()) as { share: DiagramShare | null };
        setShare(data.share);
        setState("ready");
      })
      .catch(() => {
        if (!alive) return;
        setState("error");
        setMessage("Sharing could not be loaded. Close this and try again.");
      });
    return () => {
      alive = false;
    };
  }, [open, diagramId]);

  const call = async (method: string, path: string, body?: object) => {
    if (!diagramId) return;
    setState("busy");
    setMessage("");
    setCopied(false);
    try {
      const response = await apiFetch(`/api/v1/diagrams/${encodeURIComponent(diagramId)}/share${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) throw await APIError.from(response);
      if (response.status === 204) {
        setShare(null);
        setMessage("Sharing is off. The link no longer opens anything.");
      } else {
        const data = (await response.json()) as { share: DiagramShare };
        setShare(data.share);
        if (path === "/reset") setMessage("A new link is ready. The old one no longer works.");
      }
      setState("ready");
    } catch {
      setState("error");
      setMessage("That did not go through. Try again.");
    }
  };

  const mode: Mode = share?.access ?? "off";
  const choose = (next: Mode) => {
    setArmed(false);
    if (next === mode) return;
    if (next === "off") void call("DELETE", "");
    else void call("PUT", "", { access: next });
  };

  const copy = async () => {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(shareUrl(share.token));
      setCopied(true);
    } catch {
      setMessage("The browser would not copy. Select the link and copy it by hand.");
    }
  };

  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="share-dialog-title"
      className="m-auto w-[calc(100vw_-_2rem)] max-w-md bg-transparent p-0 backdrop:bg-edge/65"
    >
      <div className="slab bg-white font-mono text-ink">
        <div className="flex items-center border-b-2 border-edge bg-bone px-4 py-3">
          <Tick>Share</Tick>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto grid h-8 w-8 place-items-center border-2 border-transparent text-ink-faint transition-colors hover:border-edge hover:bg-white hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>
        <div className="p-5">
          <h2 id="share-dialog-title" className="text-xl font-semibold tracking-[-0.03em]">
            Share this {noun}
          </h2>

          {!diagramId ? (
            <>
              <p className="mt-3 text-[12.5px] leading-relaxed text-ink-soft">
                Only a saved {noun} can be shared. Save it first; the link then opens what you saved.
              </p>
              <SlabButton tone="solid" className="mt-4 w-full" onClick={onSave}>
                Save now
              </SlabButton>
            </>
          ) : (
            <>
              <p className="mt-3 text-[12.5px] leading-relaxed text-ink-soft">
                The link opens the last saved version. Anyone with a view link can look without an
                account; an edit link asks people to sign in, and their saves change this {noun}.
              </p>
              <div
                className={`mt-4 transition-opacity ${state === "loading" ? "pointer-events-none opacity-40" : ""}`}
                aria-busy={state === "loading" || state === "busy"}
              >
                <Segmented
                  size="sm"
                  options={[
                    { value: "off" as const, label: "Off" },
                    { value: "view" as const, label: "Can view" },
                    { value: "edit" as const, label: "Can edit" },
                  ]}
                  value={mode}
                  onChange={(next) => {
                    if (state !== "loading" && state !== "busy") choose(next);
                  }}
                />
              </div>

              {share && (
                <div className="mt-4">
                  <div className="flex items-stretch border-2 border-edge">
                    <span className="grid w-9 shrink-0 place-items-center border-r-2 border-edge bg-bone">
                      <Link2 size={14} aria-hidden="true" />
                    </span>
                    <input
                      readOnly
                      value={shareUrl(share.token)}
                      aria-label="Share link"
                      onFocus={(event) => event.currentTarget.select()}
                      className="min-w-0 flex-1 bg-white px-2 py-2 text-[11.5px] text-ink"
                    />
                  </div>
                  <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                    <SlabButton tone="solid" onClick={() => void copy()} disabled={state === "busy"}>
                      {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                      {copied ? "Copied" : "Copy link"}
                    </SlabButton>
                    <SlabButton
                      onClick={() => {
                        // a new link breaks every copy of the old one: asked twice
                        if (!armed) {
                          setArmed(true);
                          return;
                        }
                        setArmed(false);
                        void call("POST", "/reset");
                      }}
                      onBlur={() => setArmed(false)}
                      disabled={state === "busy"}
                    >
                      {armed ? "Press again to replace" : "New link"}
                    </SlabButton>
                  </div>
                  <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
                    {share.access === "edit"
                      ? "People with this link who sign in can change and save it. If two people save over each other, the later save is refused and asked to reload."
                      : "People with this link can look, zoom and pan. Nothing they do changes it."}
                  </p>
                </div>
              )}
            </>
          )}

          <p role="status" aria-live="polite" className={`mt-3 text-[11.5px] leading-relaxed ${state === "error" ? "text-alert" : "text-ink-soft"}`}>
            {state === "loading" && diagramId ? "Reading the link…" : message}
          </p>
        </div>
      </div>
    </dialog>
  );
}
