"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { DiagramArt } from "@/components/site/diagram-art";
import {
  ACCENTS,
  ALL_DIAGRAMS,
  FAMILIES,
  type DiagramFamily,
  type DiagramKind,
} from "@/lib/diagrams";

/**
 * The full list of notations, filtered in the browser: the ready ones and the
 * ones still to come — a card says which it is, and only a ready card opens the
 * editor. This is the page the landing page sends a reader to once there are
 * more notations than it puts on cards, so every new one has to arrive here.
 */


type Status = "Ready now" | "Planned";
const STATUSES: Status[] = ["Ready now", "Planned"];

function statusOf(kind: DiagramKind): Status {
  return kind.keyword ? "Ready now" : "Planned";
}

function Check({
  label,
  count,
  checked,
  onChange,
}: {
  label: string;
  count: number;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 py-1.5 text-[13px] text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="flex h-4 w-4 shrink-0 items-center justify-center border-2 border-edge bg-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-edge"
      >
        {checked ? <span className="h-2 w-2 bg-edge" /> : null}
      </span>
      {label}
      <span className="ml-auto font-mono text-[11px] text-ink-faint">{count}</span>
    </label>
  );
}

function Card({ kind }: { kind: DiagramKind }) {
  const ready = Boolean(kind.keyword);
  const tone = ACCENTS[kind.accent];

  return (
    <article
      className={`slab redraw flex flex-col bg-white ${ready ? "press" : "opacity-70"}`}
    >
      <div
        className="flex h-44 items-center justify-center overflow-hidden border-b-2 border-edge px-4 py-3"
        style={{ backgroundColor: ready ? tone.wash : "#f1f1ef" }}
      >
        <DiagramArt id={kind.id} accent={kind.accent} className="h-full w-full" />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="font-mono text-[15px] font-semibold tracking-tight text-ink">
              {kind.name}
            </h3>
            {kind.keyword ? (
              <code className="border border-edge bg-bone px-1.5 py-0.5 font-mono text-[10.5px] text-ink">
                {kind.keyword}
              </code>
            ) : (
              <span className="border border-ink-faint px-1.5 py-0.5 font-mono text-[10.5px] text-ink-faint">
                planned
              </span>
            )}
          </div>
          <span className="shrink-0 whitespace-nowrap pt-0.5 text-[11px] text-ink-faint">
            {kind.family}
          </span>
        </div>

        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          {kind.summary}
        </p>

        <ul className="mt-3 flex flex-wrap gap-1.5">
          {kind.parts.map((part) => (
            <li
              key={part}
              className="border border-rule-strong bg-white px-1.5 py-0.5 text-[11px] text-ink-soft"
            >
              {part}
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-4">
          {ready ? (
            <Link
              href={`/editor?type=${kind.id}`}
              className="block border-2 border-edge bg-edge px-3 py-2 text-center font-mono text-[12.5px] font-semibold text-bone transition-colors hover:bg-navy"
            >
              Open in editor
            </Link>
          ) : (
            <span className="block border-2 border-dashed border-ink-faint px-3 py-2 text-center font-mono text-[12.5px] text-ink-faint">
              Not drawable yet
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Catalog() {
  const [query, setQuery] = useState("");
  const [families, setFamilies] = useState<DiagramFamily[]>([...FAMILIES]);
  const [statuses, setStatuses] = useState<Status[]>([...STATUSES]);

  const toggle = <T,>(list: T[], set: (next: T[]) => void, value: T) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ALL_DIAGRAMS.filter(
      (kind) =>
        families.includes(kind.family) &&
        statuses.includes(statusOf(kind)) &&
        (needle === "" ||
          `${kind.name} ${kind.summary} ${kind.keyword ?? ""} ${kind.parts.join(" ")}`
            .toLowerCase()
            .includes(needle)),
    );
  }, [query, families, statuses]);

  return (
    <div className="grid gap-6 lg:grid-cols-[236px_minmax(0,1fr)] lg:gap-8">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="slab bg-white">
          <h2 className="border-b-2 border-edge bg-bone px-4 py-2.5 font-mono text-[12.5px] font-semibold text-ink">
            Filters
          </h2>
          <div className="p-4">
            <h3 className="text-[12px] font-semibold text-ink-soft">What it shows</h3>
            <div className="mt-1">
              {FAMILIES.map((family) => (
                <Check
                  key={family}
                  label={family}
                  count={ALL_DIAGRAMS.filter((k) => k.family === family).length}
                  checked={families.includes(family)}
                  onChange={() => toggle(families, setFamilies, family)}
                />
              ))}
            </div>

            <h3 className="mt-5 text-[12px] font-semibold text-ink-soft">
              Availability
            </h3>
            <div className="mt-1">
              {STATUSES.map((status) => (
                <Check
                  key={status}
                  label={status}
                  count={ALL_DIAGRAMS.filter((k) => statusOf(k) === status).length}
                  checked={statuses.includes(status)}
                  onChange={() => toggle(statuses, setStatuses, status)}
                />
              ))}
            </div>
          </div>
        </div>

        <p className="mt-4 text-[12.5px] leading-relaxed text-ink-soft">
          More notations land here as they are built. Nothing is behind an
          account.
        </p>
      </aside>

      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="slab-tight flex flex-1 items-center gap-2 bg-white px-3 py-2">
            <Search size={15} className="shrink-0 text-ink-faint" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search notations, shapes, keywords"
              aria-label="Search notations"
              className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
            />
          </div>
          <p className="slab-tight bg-bone px-3 py-2 font-mono text-[12px] text-ink">
            {results.length} of {ALL_DIAGRAMS.length} notations
          </p>
        </div>

        {results.length === 0 ? (
          <p className="slab mt-6 bg-white p-6 text-[13.5px] text-ink-soft">
            Nothing matches that. Clear the search, or switch a filter back on.
          </p>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((kind) => (
              <Card key={kind.id} kind={kind} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
