"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, BookOpen, Code2, Sparkles, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GUIDE_INTRO } from "@/lib/guide";
import { TEMPLATE_LABELS } from "@/lib/templates";
import type { DiagramCategory } from "@/lib/types";
import { Tick } from "@/components/editor/ui";
import TutorialPrompt from "@/components/editor/tutorial-prompt";

/**
 * What a reader is offered the moment a notation opens from the catalogue.
 *
 * The starter diagram is already drawn behind it, so closing it is a fine
 * answer; the rest are the three ways the Syntax guide says a diagram gets
 * written — by hand, by Tingraph AI, or by a chat of the reader's own with the
 * tutorial pasted into it — put in front of someone who has not found the
 * guide yet. Each one lands in the panel it names, so the dialog teaches
 * where things are as well as starting them.
 */
export type StartChoice = "source" | "guide" | "ai";

const CHOICES: Array<{ id: StartChoice; icon: LucideIcon; title: string; hint: string }> = [
  {
    id: "source",
    icon: Code2,
    title: "Write the source",
    hint: "Change the starter source, then press Generate.",
  },
  {
    id: "guide",
    icon: BookOpen,
    title: "Read the syntax guide",
    hint: "Every keyword this notation knows, one line each.",
  },
  {
    id: "ai",
    icon: Sparkles,
    title: "Ask Tingraph AI",
    hint: "Describe the diagram; it writes source you can generate.",
  },
];

export default function StartDialog({
  open,
  category,
  onChoose,
  onClose,
}: {
  open: boolean;
  category: DiagramCategory;
  onChoose: (choice: StartChoice) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) {
      node.showModal();
      // a modal hands the focus to its first control, which is the close
      // button; the first way to start is the one a keyboard should land on
      node.querySelector<HTMLElement>("[data-first]")?.focus();
    }
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="start-dialog-title"
      className="m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100vw_-_2rem)] max-w-[44rem] bg-transparent p-0 backdrop:bg-edge/65"
    >
      <div className="slab bg-white font-mono text-ink">
        <div className="flex items-center gap-3 border-b-2 border-edge bg-bone px-4 py-3">
          <Tick>New {TEMPLATE_LABELS[category]}</Tick>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close and go to the canvas"
            title="Close and go to the canvas"
            className="ml-auto grid h-8 w-8 place-items-center border-2 border-transparent text-ink-faint transition-colors hover:border-edge hover:bg-white hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>

        <div className="grid sm:grid-cols-[minmax(0,1fr)_15.5rem]">
          <section className="p-5 sm:border-r-2 sm:border-edge">
            <h2
              id="start-dialog-title"
              className="text-xl font-semibold tracking-[-0.03em] sm:text-[22px]"
            >
              How do you want to start?
            </h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
              {GUIDE_INTRO[category]}
            </p>

            <ul className="mt-5 border-2 border-edge">
              {CHOICES.map((choice, index) => {
                const Icon = choice.icon;
                return (
                  <li key={choice.id} className={index > 0 ? "border-t-2 border-edge" : ""}>
                    <button
                      type="button"
                      data-first={index === 0 ? "" : undefined}
                      onClick={() => onChoose(choice.id)}
                      className="group flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-edge hover:text-bone focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-[5px] focus-visible:outline-edge"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center border-2 border-current">
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold">{choice.title}</span>
                        <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-soft group-hover:text-bone/75">
                          {choice.hint}
                        </span>
                      </span>
                      <ArrowRight
                        size={14}
                        className="shrink-0 transition-transform group-hover:translate-x-0.5"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="border-t-2 border-edge bg-bone p-5 sm:border-t-0">
            <Tick className="block">Use your own chat</Tick>
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-soft">
              Copy the whole tutorial as a prompt, describe your diagram at the
              bottom, and paste what comes back into the source.
            </p>
            <TutorialPrompt category={category} className="mt-4" />
          </section>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t-2 border-edge px-5 py-3">
          <p className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-ink-faint">
            The starter diagram is already on the sheet.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] font-semibold text-ink underline underline-offset-4 hover:text-navy"
          >
            Just show me the canvas
          </button>
        </div>
      </div>
    </dialog>
  );
}
