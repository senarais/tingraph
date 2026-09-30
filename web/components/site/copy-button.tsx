"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

export default function CopyButton({ text, label }: { text: string; label: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (status !== "copied") return;
    const timer = window.setTimeout(() => setStatus("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const copy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const field = document.createElement("textarea");
        const focused = document.activeElement;
        field.value = text;
        field.style.cssText = "position:fixed;opacity:0;pointer-events:none";
        document.body.append(field);
        try {
          field.select();
          if (!document.execCommand("copy")) throw new Error("Clipboard unavailable");
        } finally {
          field.remove();
          if (focused instanceof HTMLElement) focused.focus();
        }
      }
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-2">
      <button type="button" onClick={() => void copy()} className="slab-tight press inline-flex min-h-10 items-center gap-2 bg-white px-3 py-2 font-mono text-[12px] font-semibold text-ink">
        {status === "copied" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
        {status === "copied" ? "Copied" : label}
      </button>
      <span role="status" className={status === "failed" ? "max-w-[35ch] text-[12px] text-alert" : "sr-only"}>
        {status === "failed" ? "Copy unavailable. Select the example or open the prompt below and copy it manually." : status === "copied" ? `${label} copied to clipboard.` : ""}
      </span>
    </span>
  );
}
