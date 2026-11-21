"use client";

import { useRef, useState } from "react";
import { ClipboardPaste, FileUp, Plus } from "lucide-react";
import { Field, SlabButton } from "@/components/editor/ui";
import { TABLE_LIMITS } from "@/lib/table/parse";

/**
 * Studio's table panel: three ways to put a table on the sheet. Every one of
 * them ends in the same `matrix` figure (`lib/table/table.ts`), which is then
 * edited like any other — cells and headings in place on the sheet, rows and
 * columns from its handles and from the Matrix panel.
 *
 * Pasting does not need this panel at all: Ctrl+V on the sheet with a table on
 * the clipboard draws it. The panel says so, and offers the paste button for
 * a reader who does not know the key, plus a file and a blank grid.
 */

interface TableDrawerProps {
  onBlank: (rows: number, columns: number) => void;
  /** asks the browser for the clipboard; resolves to what to say */
  onClipboard: () => void;
  onFile: (file: File) => void;
  onText: (text: string) => void;
  /** what happened last, success or refusal, said in words */
  message: { tone: "ok" | "alert"; text: string } | null;
}

function Count({
  label,
  value,
  most,
  onChange,
}: {
  label: string;
  value: number;
  most: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">{label}</span>
      <input
        type="number"
        min={1}
        max={most}
        value={value}
        onChange={(event) => {
          const next = Math.floor(Number(event.target.value));
          onChange(Number.isFinite(next) ? Math.min(most, Math.max(1, next)) : 1);
        }}
        className="w-full border-2 border-edge bg-white px-2 py-1 text-[12px] text-ink"
      />
    </label>
  );
}

export default function TableDrawer({ onBlank, onClipboard, onFile, onText, message }: TableDrawerProps) {
  const [rows, setRows] = useState(3);
  const [columns, setColumns] = useState(3);
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {message && (
        <p
          role={message.tone === "alert" ? "alert" : "status"}
          className={`border-b-2 border-edge px-3 py-2 text-[11.5px] leading-relaxed ${
            message.tone === "alert" ? "bg-white text-alert" : "bg-white text-ink"
          }`}
        >
          {message.text}
        </p>
      )}

      <Field label="Paste a table" className="border-b-2 border-edge p-3">
        <p className="text-[11.5px] leading-relaxed text-ink-soft">
          Copy cells from Excel, Google Sheets, Word, Google Docs or a web page, click the sheet and
          press <kbd className="border border-edge px-1 text-[10.5px]">Ctrl</kbd>+
          <kbd className="border border-edge px-1 text-[10.5px]">V</kbd>. Merged headings, cell
          fills and every row come along.
        </p>
        <SlabButton className="mt-2.5 w-full" onClick={onClipboard}>
          <ClipboardPaste size={13} aria-hidden="true" />
          Paste from clipboard
        </SlabButton>
      </Field>

      <Field label="New table" className="border-b-2 border-edge p-3">
        <div className="flex gap-2">
          <Count label="Rows" value={rows} most={50} onChange={setRows} />
          <Count label="Columns" value={columns} most={20} onChange={setColumns} />
        </div>
        <SlabButton tone="solid" className="mt-2.5 w-full" onClick={() => onBlank(rows, columns)}>
          <Plus size={13} aria-hidden="true" />
          Place a {rows} × {columns} table
        </SlabButton>
      </Field>

      <Field label="Import a file" className="border-b-2 border-edge p-3">
        <p className="text-[11.5px] leading-relaxed text-ink-soft">
          CSV, TSV, a text file or a saved web page with a table in it. From Excel, save as CSV first.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,.html,.htm,text/csv,text/tab-separated-values,text/plain,text/html"
          className="sr-only"
          aria-label="Choose a table file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onFile(file);
          }}
        />
        <SlabButton className="mt-2.5 w-full" onClick={() => fileRef.current?.click()}>
          <FileUp size={13} aria-hidden="true" />
          Choose a file
        </SlabButton>
      </Field>

      <Field label="Type or paste the cells" className="p-3">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={5}
          spellCheck={false}
          placeholder={"Item, Qty, Note\nPen, 3, blue\nInk, 5, black"}
          aria-label="Table cells, one row per line"
          className="w-full resize-y border-2 border-edge bg-white px-2 py-1.5 text-[12px] leading-relaxed text-ink placeholder:text-ink-faint"
        />
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
          One row per line, cells split by tabs, commas or semicolons. The first row and the first
          column become the headings. Up to {TABLE_LIMITS.rows} rows and {TABLE_LIMITS.columns} columns.
        </p>
        <SlabButton className="mt-2.5 w-full" disabled={text.trim() === ""} onClick={() => onText(text)}>
          Place this table
        </SlabButton>
      </Field>
    </div>
  );
}
