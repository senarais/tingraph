"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Eraser, Paperclip, SendHorizonal, Wand2, X } from "lucide-react";
import {
  ATTACHMENT_ACCEPT,
  attachmentProblem,
  attachmentsProblem,
} from "@/lib/ai/attachments";
import { useTingraphStore, type ChatTurn } from "@/lib/store";
import { TEMPLATE_LABELS } from "@/lib/templates";
import { DiagramCategory } from "@/lib/types";
import { SlabButton, Tick } from "@/components/editor/ui";

/**
 * Tingraph AI: describe the drawing, get it written.
 *
 * The chatbot answers twice over — a sentence for the reader and the whole
 * diagram as source — and only the sentence is a reply. The source arrives
 * already parsed and laid out by the server against the editor's own pipeline,
 * so the button under it draws rather than offering to try; a reply with
 * nothing under it is a reply that would not have drawn.
 *
 * Nothing here writes to the sheet on its own. The rule the whole editor is
 * built on is that the code touches the sheet at exactly one moment, when the
 * reader asks for it, and an assistant is no more entitled to that than the
 * source drawer is.
 */

/**
 * Openers to start the reader off. They say nothing about the notation on
 * purpose — one written per notation would need an article in front of its
 * name, and "a ER diagram" is worse than saying nothing at all.
 */
const OPENERS = [
  "A library loan, start to finish",
  "Add one more to what is there",
  "Give it a clearer title",
];

function Turn({
  turn,
  onGenerate,
}: {
  turn: ChatTurn;
  onGenerate: (source: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  if (turn.role === "you") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap break-words border-2 border-edge bg-edge px-2.5 py-1.5 text-[12px] leading-relaxed text-bone">
          {turn.text}
        </p>
      </div>
    );
  }

  return (
    <div>
      <Tick className="mb-1.5 block">Tingraph AI</Tick>
      <p className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-ink">
        {turn.text}
      </p>
      {turn.source && (
        <div className="mt-2.5 border-2 border-edge bg-white">
          <pre className="max-h-52 overflow-auto px-2.5 py-2 text-[11px] leading-[1.6] text-ink">
            {turn.source}
          </pre>
          <div className="flex items-center gap-2 border-t-2 border-edge p-2">
            <SlabButton
              tone="solid"
              onClick={() => onGenerate(turn.source as string)}
              title="Write this into the source and draw it on the sheet"
            >
              <Wand2 size={13} />
              Generate
            </SlabButton>
            <SlabButton
              onClick={async () => {
                await navigator.clipboard.writeText(turn.source as string);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy"}
            </SlabButton>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AiDrawer({
  category,
  onGenerate,
}: {
  category: DiagramCategory;
  /** writes the source into the editor and draws it, in that order */
  onGenerate: (source: string) => void;
}) {
  const chat = useTingraphStore((s) => s.chat);
  const thinking = useTingraphStore((s) => s.thinking);
  const say = useTingraphStore((s) => s.say);
  const setThinking = useTingraphStore((s) => s.setThinking);
  const clearChat = useTingraphStore((s) => s.clearChat);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [dragging, setDragging] = useState(false);
  const foot = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // the newest turn is the one worth reading, so the panel opens at the bottom
  // and stays there as the conversation grows
  useEffect(() => {
    foot.current?.scrollIntoView({ block: "end" });
  }, [chat.length, thinking]);

  const addFiles = (files: FileList | File[]) => {
    if (thinking) {
      return;
    }
    const next = [...attachments];
    let totalBytes = next.reduce((total, file) => total + file.size, 0);
    let problem = "";

    for (const file of Array.from(files)) {
      problem = attachmentProblem(file.type.toLowerCase(), file.size) ?? "";
      if (!problem) {
        problem = attachmentsProblem(next.length + 1, totalBytes + file.size) ?? "";
      }
      if (problem) {
        break;
      }
      next.push(file);
      totalBytes += file.size;
    }

    setAttachments(next);
    setAttachmentError(problem);
  };

  const send = async () => {
    const prompt = draft.trim();
    const files = attachments;
    if ((!prompt && files.length === 0) || thinking) {
      return;
    }
    const text = prompt || "Create a diagram from the attached files.";
    const message = files.length > 0 ? `${text}\n\nAttached: ${files.map((file) => file.name).join(", ")}` : text;
    const store = useTingraphStore.getState();
    const turns = [...store.chat, { role: "you" as const, text: message }];
    const form = new FormData();
    form.set(
      "ask",
      JSON.stringify({
        category,
        direction: store.direction,
        code: store.code,
        turns,
      }),
    );
    files.forEach((file) => form.append("attachments", file));
    setDraft("");
    setAttachments([]);
    setAttachmentError("");
    say({ role: "you", text: message });
    setThinking(true);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        body: form,
      });
      const reply = (await response.json()) as { message?: string; source?: string };
      say({
        role: "ai",
        text: reply.message || "Something came back empty. Try asking again.",
        source: reply.source || undefined,
      });
    } catch {
      say({
        role: "ai",
        text: "I could not reach the server. Check that it is running and try again.",
      });
    } finally {
      // in a `finally` on purpose: the reader may have shut the panel while
      // this was out, and the flag has to come back either way
      useTingraphStore.getState().setThinking(false);
    }
  };

  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {chat.length === 0 && (
          <div className="slab-tight bg-white p-3">
            <Tick className="block">Describe it, in any language</Tick>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-soft">
              Say what you want drawn and Tingraph AI writes it as{" "}
              {TEMPLATE_LABELS[category]} source. Every answer is parsed and laid
              out before you see it, so the button under it draws straight away.
            </p>
            <ul className="mt-3 space-y-1">
              {OPENERS.map((line) => (
                <li key={line}>
                  <button
                    type="button"
                    onClick={() => setDraft(line)}
                    className="w-full border-2 border-transparent px-1.5 py-1 text-left text-[11.5px] leading-snug text-ink-faint transition-colors hover:border-edge hover:bg-bone hover:text-ink"
                  >
                    {line}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {chat.map((turn, index) => (
          <Turn key={index} turn={turn} onGenerate={onGenerate} />
        ))}

        {thinking && (
          <p className="text-[11.5px] text-ink-faint">Writing the diagram…</p>
        )}
        <div ref={foot} />
      </div>

      <div
        className={`border-t-2 border-edge p-3 ${dragging ? "bg-bone" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(event.dataTransfer.files);
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          rows={3}
          placeholder="What should the diagram show? Drop a PDF or image for context."
          aria-label="Ask Tingraph AI"
          className="w-full resize-none border-2 border-edge bg-white px-2.5 py-2 font-mono text-[12px] leading-relaxed text-ink placeholder:text-ink-faint"
        />
        <input
          ref={fileInput}
          type="file"
          accept={ATTACHMENT_ACCEPT}
          multiple
          className="hidden"
          onChange={(event) => {
            addFiles(event.target.files ?? []);
            event.target.value = "";
          }}
        />
        {attachments.length > 0 && (
          <ul className="mt-2 space-y-1" aria-label="Attached files">
            {attachments.map((file, index) => (
              <li
                key={`${file.name}-${file.lastModified}-${index}`}
                className="flex items-center gap-2 border-2 border-edge bg-white px-2 py-1 text-[11px] text-ink"
              >
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((current) => current.filter((item) => item !== file))}
                  aria-label={`Remove ${file.name}`}
                  className="shrink-0 text-ink-faint hover:text-ink"
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {attachmentError && (
          <p role="alert" className="mt-2 text-[11px] text-alert">
            {attachmentError}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <SlabButton onClick={() => fileInput.current?.click()} disabled={thinking} title="Attach PDF or image">
            <Paperclip size={13} />
            Attach
          </SlabButton>
          <span className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">
            PDF or image, up to 4 files / 10 MB. Enter sends
          </span>
          {chat.length > 0 && (
            <SlabButton onClick={clearChat} title="Start the conversation again">
              <Eraser size={13} />
              Clear
            </SlabButton>
          )}
          <SlabButton
            tone="solid"
            onClick={() => void send()}
            disabled={thinking || (draft.trim() === "" && attachments.length === 0)}
          >
            <SendHorizonal size={13} />
            Send
          </SlabButton>
        </div>
      </div>
    </>
  );
}
