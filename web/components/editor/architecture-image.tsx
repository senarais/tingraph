"use client";

import { useRef } from "react";
import { Image as ImageIcon } from "lucide-react";

export default function ArchitectureImage({ onFile }: { onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return <>
    <input
      ref={input}
      type="file"
      accept="image/png,image/jpeg,image/webp"
      className="hidden"
      aria-label="Choose component image"
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) onFile(file);
        event.target.value = "";
      }}
    />
    <button type="button" onClick={() => input.current?.click()} className="inline-flex items-center gap-1.5 border border-edge bg-white px-2 py-1 text-[11px] text-ink hover:bg-bone">
      <ImageIcon size={13} /> Change image
    </button>
  </>;
}
