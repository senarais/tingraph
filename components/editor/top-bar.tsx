"use client";

import Link from "next/link";
import { Download, Repeat2 } from "lucide-react";
import { TEMPLATE_LABELS, useTingraphStore } from "@/lib/store";
import { DiagramCategory } from "@/lib/types";
import { Tick } from "@/components/editor/ui";

/**
 * The bar over the sheet. It reports rather than commands: what is being
 * drawn, in what notation, how much of it there is, and whether the source
 * still parses. The one thing it does is let the drawing out of the editor.
 */

function Cell({
  label,
  children,
  tone = "ink",
}: {
  label: string;
  children: React.ReactNode;
  tone?: "ink" | "alert";
}) {
  return (
    <div className="hidden min-w-0 max-w-[16rem] shrink flex-col justify-center gap-1.5 border-r-2 border-edge px-4 md:flex">
      <Tick>{label}</Tick>
      <span
        className={`truncate text-[12.5px] leading-none ${
          tone === "alert" ? "text-alert" : "text-ink"
        }`}
      >
        {children}
      </span>
    </div>
  );
}

interface TopBarProps {
  title: string;
  category: DiagramCategory;
  nodeCount: number;
  edgeCount: number;
  errorMessage: string | null;
  empty: boolean;
}

export default function TopBar({
  title,
  category,
  nodeCount,
  edgeCount,
  errorMessage,
  empty,
}: TopBarProps) {
  const setExportOpen = useTingraphStore((s) => s.setExportOpen);

  return (
    <header className="flex h-14 shrink-0 items-stretch border-b-2 border-edge bg-bone">
      <Link
        href="/"
        title="Back to the Tingraph home page"
        className="flex items-center gap-2.5 border-r-2 border-edge px-4 transition-colors hover:bg-white"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4 text-ink" aria-hidden="true">
          <path d="M1 15V1h14" fill="none" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M4 12l3.5-6L11 9l3-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          />
        </svg>
        <span className="text-[14px] font-semibold tracking-tight text-ink">
          tingraph
        </span>
      </Link>

      <Cell label="Drawing">{title || "Untitled"}</Cell>
      <Cell label="Notation">
        <span className="flex items-center gap-2">
          {TEMPLATE_LABELS[category]}
          <Link
            href="/editor"
            title="Start again in another notation"
            aria-label="Start again in another notation"
            className="text-ink-faint transition-colors hover:text-ink"
          >
            <Repeat2 size={13} />
          </Link>
        </span>
      </Cell>
      <Cell label="Elements">
        {nodeCount} nodes · {edgeCount} flows
      </Cell>
      <Cell label="Status" tone={errorMessage ? "alert" : "ink"}>
        {errorMessage ? "Syntax error" : "Parsed"}
      </Cell>

      <div className="ml-auto flex items-center px-4">
        <button
          type="button"
          onClick={() => setExportOpen(true)}
          disabled={empty}
          className="slab-tight press flex items-center gap-2 bg-edge px-4 py-2 text-[12.5px] font-semibold text-bone disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <Download size={14} />
          Export
        </button>
      </div>
    </header>
  );
}
