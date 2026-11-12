"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Tick } from "@/components/editor/ui";

/**
 * A question the editor has to ask before it goes on — in the editor's own
 * hand rather than the browser's grey box, which blocks the page, cannot say
 * why it is asking, and reads like an error. Escape, the close button and the
 * backdrop's own cancel all answer no.
 */
export default function ConfirmDialog({
  open,
  kicker,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  kicker: string;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) {
      node.showModal();
      // the safe answer takes the focus, so a stray Enter does not go on
      node.querySelector<HTMLElement>("[data-cancel]")?.focus();
    }
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      aria-labelledby="confirm-dialog-title"
      className="m-auto w-[calc(100vw_-_2rem)] max-w-md bg-transparent p-0 backdrop:bg-edge/65"
    >
      <div className="slab bg-white font-mono text-ink">
        <div className="flex items-center border-b-2 border-edge bg-bone px-4 py-3">
          <Tick>{kicker}</Tick>
          <button
            type="button"
            onClick={onCancel}
            aria-label={cancelLabel}
            className="ml-auto grid h-8 w-8 place-items-center border-2 border-transparent text-ink-faint transition-colors hover:border-edge hover:bg-white hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>
        <div className="p-5">
          <h2 id="confirm-dialog-title" className="text-xl font-semibold tracking-[-0.03em]">
            {title}
          </h2>
          <div className="mt-3 text-[12.5px] leading-relaxed text-ink-soft">{children}</div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              data-cancel=""
              onClick={onCancel}
              className="slab-tight press bg-white px-3 py-2 text-center text-[12.5px] font-semibold text-ink"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="slab-tight press bg-edge px-3 py-2 text-center text-[12.5px] font-semibold text-bone"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
