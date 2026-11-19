"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, FolderOpen, LayoutGrid, Minus, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import AccessDialog from "@/components/account/access-dialog";
import { DiagramArt } from "@/components/site/diagram-art";
import MyDiagrams from "@/components/site/my-diagrams";
import {
  ACCENTS,
  ALL_DIAGRAMS,
  FAMILIES,
  PLANNED_DIAGRAMS,
  type DiagramKind,
} from "@/lib/diagrams";
import { isChart, isGraph } from "@/lib/types";
import { getSession } from "@/lib/api/client";
import { PLAN_LIMITS } from "@/lib/plans";

/**
 * The full list of notations, filtered in the browser: the ready ones and the
 * ones still to come — a card says which it is, and only a ready card opens the
 * editor. This is the page the landing page sends a reader to once there are
 * more notations than it puts on cards, so every new one has to arrive here.
 */


/**
 * The filters, as the sections of one panel. Within a section the options
 * widen the list (any of them); across sections they narrow it (all of them);
 * a section with nothing ticked filters nothing. Each option says how many
 * diagrams it would show with everything else as it is, and one that would
 * show none cannot be ticked.
 */
interface Facet {
  id: string;
  title: string;
  options: Array<{ value: string; label: string; hint?: string }>;
  /** the values one diagram has in this section */
  of: (kind: DiagramKind) => string[];
}

/** The method or standard each drawing follows, by catalogue id. */
const STANDARD: Record<string, string> = {
  usecase: "UML",
  activity: "UML",
  sequence: "UML",
  class: "UML",
  state: "UML",
  bpmn: "BPMN 2.0",
  "system-context": "C4 model",
  container: "C4 model",
  component: "C4 model",
  architecture: "Software architecture",
  deployment: "Software architecture",
  erd: "Data modelling",
  dfd: "Data modelling",
  bar: "Statistics",
  histogram: "Statistics",
  line: "Statistics",
  pie: "Statistics",
  scatter: "Statistics",
  area: "Statistics",
  waterfall: "Statistics",
  funnel: "Statistics",
  radar: "Statistics",
  sankey: "Statistics",
  block: "Control engineering",
  heatmap: "Statistics",
  swot: "Business analysis",
  raci: "Business analysis",
  "decision-matrix": "Business analysis",
  quadrant: "Business analysis",
  gantt: "Project management",
  fishbone: "Quality management",
  prisma: "Research reporting",
  mind: "Ideas and knowledge",
  venn: "Ideas and knowledge",
};

function formOf(kind: DiagramKind): string[] {
  if (!kind.keyword) return [];
  if (isGraph(kind.keyword)) return ["graph"];
  return [isChart(kind.keyword) ? "chart" : "figure"];
}

const BY_COUNT = (kinds: readonly DiagramKind[], of: (kind: DiagramKind) => string[]) => {
  const counts = new Map<string, number>();
  for (const kind of kinds) for (const value of of(kind)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b));
};

const standardOf = (kind: DiagramKind) => [STANDARD[kind.id] ?? "General"];

const FACETS: Facet[] = [
  {
    id: "family",
    title: "What it shows",
    options: FAMILIES.map((family) => ({ value: family, label: family })),
    of: (kind) => [kind.family],
  },
  {
    id: "form",
    title: "Kind of drawing",
    options: [
      { value: "graph", label: "Graph", hint: "elements joined by connectors" },
      { value: "chart", label: "Chart", hint: "values plotted on axes or a circle" },
      { value: "figure", label: "Figure", hint: "one object drawn from its settings" },
    ],
    of: formOf,
  },
  {
    id: "standard",
    title: "Method or standard",
    options: BY_COUNT(ALL_DIAGRAMS, standardOf).map((value) => ({ value, label: value })),
    of: standardOf,
  },
  {
    id: "start",
    title: "Starting point",
    options: [
      { value: "notation", label: "Notation", hint: "its own language and editor" },
      { value: "starter", label: "Starter drawing", hint: "a notation, started a common way" },
    ],
    of: (kind) => [kind.starter ? "starter" : "notation"],
  },
  // only worth a section once something is announced and not drawable yet
  ...(PLANNED_DIAGRAMS.length > 0
    ? [
        {
          id: "status",
          title: "Availability",
          options: [
            { value: "ready", label: "Ready now" },
            { value: "planned", label: "Planned" },
          ],
          of: (kind: DiagramKind) => [kind.keyword ? "ready" : "planned"],
        },
      ]
    : []),
];

type Picked = Record<string, string[]>;

function matches(kind: DiagramKind, picked: Picked, skip?: string): boolean {
  return FACETS.every((facet) => {
    const wanted = picked[facet.id] ?? [];
    return facet.id === skip || wanted.length === 0 || facet.of(kind).some((value) => wanted.includes(value));
  });
}

function searched(kind: DiagramKind, needle: string): boolean {
  return (
    needle === "" ||
    `${kind.name} ${kind.summary} ${kind.keyword ?? ""} ${kind.parts.join(" ")} ${STANDARD[kind.id] ?? ""}`
      .toLowerCase()
      .includes(needle)
  );
}

/** One option: a box, its name, what it means, and how many it would show. */
function Option({
  label,
  hint,
  count,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  count: number;
  checked: boolean;
  onChange: () => void;
}) {
  const dead = count === 0 && !checked;
  return (
    <label
      className={`group flex items-start gap-2.5 py-1.5 text-[12.5px] ${
        dead ? "cursor-not-allowed text-ink-faint" : "cursor-pointer text-ink"
      }`}
    >
      <input type="checkbox" checked={checked} disabled={dead} onChange={onChange} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center border-2 transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-edge ${
          checked
            ? "border-edge bg-edge text-bone"
            : dead
              ? "border-ink-faint/50 bg-transparent"
              : "border-edge bg-white group-hover:bg-bone"
        }`}
      >
        {checked ? <Check size={11} strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1 leading-snug">
        {label}
        {hint && <span className="block text-[11px] leading-snug text-ink-faint">{hint}</span>}
      </span>
      <span className="pt-px font-mono text-[11px] tabular-nums text-ink-faint">{count}</span>
    </label>
  );
}

function Card({ kind, onOpen }: { kind: DiagramKind; onOpen: () => void }) {
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
            <button
              type="button"
              onClick={onOpen}
              className="block w-full border-2 border-edge bg-edge px-3 py-2 text-center font-mono text-[12.5px] font-semibold text-bone transition-colors hover:bg-navy"
            >
              Open in editor
            </button>
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

/** The sections open on the first paint: the two most readers filter by. */
const OPEN_FIRST = new Set(["family", "form"]);

export default function Catalog() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "mine" ? "mine" : "browse";
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Picked>({});
  const [guestChoice, setGuestChoice] = useState<DiagramKind | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // a notation picked here opens on the start dialog: the ways to write it,
  // in front of a reader who has not found the Syntax guide yet
  const editorHref = (kind: DiagramKind) =>
    kind.starter
      ? `/editor?type=${kind.keyword}&starter=${kind.starter}&start=1`
      : `/editor?type=${kind.id}&start=1`;

  const openDiagram = async (kind: DiagramKind) => {
    const href = editorHref(kind);
    const session = await getSession().catch(() => null);
    if (session?.user) {
      router.push(href);
      return;
    }
    setGuestChoice(kind);
  };

  const needle = query.trim().toLowerCase();
  const toggle = (facet: string, value: string) =>
    setPicked((current) => {
      const list = current[facet] ?? [];
      const next = list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
      return { ...current, [facet]: next };
    });
  const clear = (facet?: string) => setPicked((current) => (facet ? { ...current, [facet]: [] } : {}));
  const active = FACETS.flatMap((facet) =>
    (picked[facet.id] ?? []).map((value) => ({
      facet: facet.id,
      value,
      label: facet.options.find((option) => option.value === value)?.label ?? value,
    })),
  );

  const results = useMemo(
    () => ALL_DIAGRAMS.filter((kind) => searched(kind, needle) && matches(kind, picked)),
    [needle, picked],
  );

  /** How many one option would show, with the search and every other section as they are. */
  const countFor = (facet: Facet, value: string) =>
    ALL_DIAGRAMS.filter(
      (kind) => searched(kind, needle) && matches(kind, picked, facet.id) && facet.of(kind).includes(value),
    ).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[236px_minmax(0,1fr)] lg:gap-8">
      {/* sticky beside the cards, and scrolled on its own once open sections outgrow the window */}
      <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:pb-2 lg:pr-2 lg:[scrollbar-width:thin]">
        <div className="slab bg-white">
          <h2 className="border-b-2 border-edge bg-bone px-4 py-2.5 font-mono text-[12.5px] font-semibold text-ink">
            Diagrams
          </h2>
          <nav aria-label="Diagram library" className="grid grid-cols-2 gap-1 p-2 lg:block">
            <Link
              href="/editor?view=mine"
              aria-current={view === "mine" ? "page" : undefined}
              className={`flex items-center gap-2.5 border-2 px-3 py-2.5 font-mono text-[12.5px] font-semibold transition-colors ${
                view === "mine"
                  ? "border-edge bg-edge text-bone"
                  : "border-transparent text-ink hover:border-edge hover:bg-bone"
              }`}
            >
              <FolderOpen size={15} />
              My diagrams
            </Link>
            <Link
              href="/editor?view=browse"
              aria-current={view === "browse" ? "page" : undefined}
              className={`flex items-center gap-2.5 border-2 px-2 py-2.5 font-mono text-[12.5px] font-semibold transition-colors lg:mt-1 lg:px-3 ${
                view === "browse"
                  ? "border-edge bg-edge text-bone"
                  : "border-transparent text-ink hover:border-edge hover:bg-bone"
              }`}
            >
              <LayoutGrid size={15} />
              Browse diagrams
            </Link>
          </nav>

          {view === "browse" ? (
            <div className="border-t-2 border-edge">
              <button
                type="button"
                aria-expanded={filtersOpen}
                aria-controls="catalog-filters"
                onClick={() => setFiltersOpen(!filtersOpen)}
                className="flex min-h-11 w-full items-center gap-2 bg-bone px-4 text-left font-mono text-[12.5px] font-semibold text-ink lg:hidden"
              >
                <SlidersHorizontal size={15} /> Filters
                {active.length > 0 && <span className="bg-edge px-1.5 font-mono text-[10.5px] text-bone">{active.length}</span>}
                <span className="ml-auto">{filtersOpen ? <Minus size={14} /> : <Plus size={14} />}</span>
              </button>
              <div id="catalog-filters" className={`${filtersOpen ? "block" : "hidden"} border-t-2 border-edge lg:block lg:border-t-0`}>
                <div className="flex items-center gap-2 border-b-2 border-edge bg-bone px-4 py-2.5">
                  <h2 className="font-mono text-[12.5px] font-semibold text-ink">Filters</h2>
                  <button
                    type="button"
                    onClick={() => clear()}
                    disabled={active.length === 0}
                    className="ml-auto font-mono text-[11.5px] text-ink underline-offset-4 hover:underline disabled:pointer-events-none disabled:text-ink-faint"
                  >
                    Clear
                  </button>
                </div>
                {FACETS.map((facet) => {
                  const shown = OPEN_FIRST.has(facet.id);
                  const chosen = picked[facet.id]?.length ?? 0;
                  return (
                    // a details element, opened and shut the way the FAQ's are
                    // left to the browser after the first paint: a re-render on every
                    // toggle would set `open` again and cut the opening animation short
                    <details
                      key={facet.id}
                      ref={(node) => {
                        if (node && !node.dataset.ready) {
                          node.dataset.ready = "1";
                          node.open = shown;
                        }
                      }}
                      className="group border-b border-edge/20 last:border-b-0"
                    >
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-[12.5px] text-ink marker:content-none hover:bg-bone group-open:bg-bone/60 group-open:font-semibold">
                        <span className="min-w-0 flex-1">{facet.title}</span>
                        {chosen > 0 && (
                          <span className="bg-edge px-1.5 font-mono text-[10.5px] leading-[17px] text-bone">{chosen}</span>
                        )}
                        <span
                          aria-hidden="true"
                          className="grid h-5 w-5 shrink-0 place-items-center border-2 border-edge font-mono text-[13px] leading-none group-open:bg-edge group-open:text-bone"
                        >
                          <span className="group-open:hidden">+</span>
                          <span className="hidden group-open:inline">−</span>
                        </span>
                      </summary>
                      <div className="bg-bone/60 px-4 pb-3 pt-0.5">
                        {facet.options.map((option) => (
                          <Option
                            key={option.value}
                            label={option.label}
                            hint={option.hint}
                            count={countFor(facet, option.value)}
                            checked={picked[facet.id]?.includes(option.value) ?? false}
                            onChange={() => toggle(facet.id, option.value)}
                          />
                        ))}
                        {chosen > 0 && (
                          <button
                            type="button"
                            onClick={() => clear(facet.id)}
                            className="mt-1 font-mono text-[11px] text-ink-soft underline-offset-4 hover:text-ink hover:underline"
                          >
                            Clear {facet.title.toLowerCase()}
                          </button>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="border-t-2 border-edge p-4 text-[12.5px] leading-relaxed text-ink-soft">
              Search by saved title or notation. Only diagrams owned by your account appear.
            </p>
          )}
        </div>

        <p className="mt-4 hidden text-[12.5px] leading-relaxed text-ink-soft lg:block">
          {view === "mine"
            ? "Open a saved diagram to continue with its source, settings and canvas edits."
            : "More notations land here as they are built. Browsing never needs an account."}
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
              placeholder={
                view === "mine"
                  ? "Search your diagrams"
                  : "Search notations, shapes, keywords"
              }
              aria-label={view === "mine" ? "Search your diagrams" : "Search notations"}
              className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
            />
          </div>
          {view === "browse" ? (
            <p className="slab-tight bg-bone px-3 py-2 font-mono text-[12px] text-ink">
              {results.length} of {ALL_DIAGRAMS.length} diagrams
            </p>
          ) : (
            <p className="slab-tight bg-bone px-3 py-2 font-mono text-[12px] text-ink">
              Private to your account
            </p>
          )}
        </div>

        {view === "browse" && active.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
            {active.map((chip) => (
              <button
                key={`${chip.facet}:${chip.value}`}
                type="button"
                onClick={() => toggle(chip.facet, chip.value)}
                aria-label={`Remove filter ${chip.label}`}
                className="flex items-center gap-1.5 border-2 border-edge bg-white px-2 py-1 font-mono text-[11.5px] text-ink transition-colors hover:bg-bone"
              >
                {chip.label}
                <X size={12} aria-hidden="true" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => clear()}
              className="px-1 font-mono text-[11.5px] text-ink-soft underline underline-offset-4 hover:text-ink"
            >
              Clear all
            </button>
          </div>
        )}

        {view === "mine" ? (
          <MyDiagrams query={query} />
        ) : results.length === 0 ? (
          <div className="slab mt-6 bg-white p-6">
            <p className="text-[13.5px] text-ink-soft">Nothing matches that search and these filters.</p>
            <button
              type="button"
              onClick={() => {
                clear();
                setQuery("");
              }}
              className="mt-3 font-mono text-[12.5px] font-semibold text-ink underline underline-offset-4"
            >
              Clear search and filters
            </button>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((kind) => (
              <Card key={kind.id} kind={kind} onOpen={() => void openDiagram(kind)} />
            ))}
          </div>
        )}
      </div>

      <AccessDialog
        open={guestChoice !== null}
        title="Sign up to use generation and AI"
        message={`A free account unlocks ${PLAN_LIMITS.free.generations} generations and ${PLAN_LIMITS.free.aiTokens.toLocaleString("en-US")} Tingraph AI tokens per 24 hours, plus space for ${PLAN_LIMITS.free.diagrams} saved diagrams. You can continue without an account to edit manually and export.`}
        next={guestChoice ? editorHref(guestChoice) : "/editor"}
        onClose={() => setGuestChoice(null)}
        onContinue={
          guestChoice
            ? () => {
                router.push(editorHref(guestChoice));
                setGuestChoice(null);
              }
            : undefined
        }
      />
    </div>
  );
}
