"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export default function AccessDialog({
  open,
  title,
  message,
  next,
  onClose,
  onContinue,
}: {
  open: boolean;
  title: string;
  message: string;
  next: string;
  onClose: () => void;
  onContinue?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="access-dialog-title"
      className="m-auto w-[calc(100vw_-_2rem)] max-w-md bg-transparent p-0 backdrop:bg-edge/65"
    >
      <div className="slab bg-white font-mono text-ink">
        <div className="flex items-center border-b-2 border-edge bg-bone px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Account required
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto border-2 border-transparent p-0.5 text-ink-faint hover:border-edge hover:bg-white hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>
        <div className="p-5">
          <h2 id="access-dialog-title" className="text-xl font-semibold tracking-[-0.03em]">
            {title}
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">{message}</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Link
              href={`/login?mode=signup&next=${encodeURIComponent(next)}`}
              onClick={onClose}
              className="slab-tight press bg-edge px-3 py-2 text-center text-[12.5px] font-semibold text-bone"
            >
              Create free account
            </Link>
            <Link
              href={`/login?next=${encodeURIComponent(next)}`}
              onClick={onClose}
              className="slab-tight press bg-white px-3 py-2 text-center text-[12.5px] font-semibold text-ink"
            >
              Sign in
            </Link>
          </div>
          {onContinue && (
            <button
              type="button"
              onClick={onContinue}
              className="mt-4 w-full text-center text-[11.5px] text-ink-soft underline underline-offset-4 hover:text-ink"
            >
              Continue without an account
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
