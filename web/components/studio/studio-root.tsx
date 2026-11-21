"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CaptureUpdateAction,
  restore,
  serializeAsJSON,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElement, FileId } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { X } from "lucide-react";
import AccessDialog from "@/components/account/access-dialog";
import Canvas, { NO_PARTS, type SheetParts } from "@/components/editor/canvas";
import ElementDrawer, { elementPanel } from "@/components/editor/element-drawer";
import ExportDialog from "@/components/editor/export-dialog";
import ShareDialog from "@/components/editor/share-dialog";
import FigureDrawer from "@/components/editor/figure-drawer";
import Inspector from "@/components/editor/inspector";
import Rail, { overDialog, typing } from "@/components/editor/rail";
import StyleDrawer from "@/components/editor/style-drawer";
import { Cell, HomeMark, SharedCell, SheetActions } from "@/components/editor/top-bar";
import { Tick } from "@/components/editor/ui";
import { useSheetSave } from "@/components/editor/use-sheet-save";
import LibraryDrawer from "@/components/studio/library-drawer";
import TableDrawer from "@/components/studio/table-drawer";
import { getSession } from "@/lib/api/client";
import type { Rules } from "@/lib/canvas/connect";
import { elementOn, redrawElement } from "@/lib/canvas/elements";
import { addBoundary, addColumn, removeColumn, removeFrame, renameFrame } from "@/lib/canvas/frames";
import { paletteShape } from "@/lib/canvas/place";
import { applyStyle, reink, restyle, type StylePatch } from "@/lib/canvas/restyle";
import {
  addLane,
  addPoolBelow,
  labelLink,
  newConnector,
  newFigure,
  redrawFigure,
  removeLane,
  removePool,
  removeUnits,
  renamePoolPart,
  writeLink,
  type FigureOnSheet,
} from "@/lib/canvas/scene";
import { fontReady, styleOfFont } from "@/lib/canvas/text-metrics";
import { unitOf, type LinkMark } from "@/lib/canvas/units";
import { connectorStyle } from "@/lib/excalidraw-mapper/build-skeletons";
import { figureDef } from "@/lib/figures/registry";
import type { FigureSpec } from "@/lib/figures/spec";
import type { Json } from "@/lib/json";
import type { PaletteItem } from "@/lib/palette";
import { diagramTitle, withSceneFiles } from "@/lib/saved-diagrams";
import { styleFor } from "@/lib/sheet";
import { useTingraphStore, type Drawer } from "@/lib/store";
import {
  adoptPieces,
  boundsOf,
  drawPieces,
  notationOfMark,
  notationOfPicked,
  rulesForLink,
  spotFor,
  STUDIO_CATEGORY,
  STUDIO_START,
  UNTITLED_STUDIO,
  type StudioDocument,
} from "@/lib/studio";
import { TEMPLATE_LABELS } from "@/lib/templates";
import type { MatrixSpec } from "@/lib/matrix/spec";
import { parseHtmlTable, parseTableText, tableFromClipboard, type Grid } from "@/lib/table/parse";
import { blankTable, tableFromGrid } from "@/lib/table/table";
import type { DiagramCategory, DSLNode } from "@/lib/types";

/**
 * Studio: a free sheet for drawing by hand in every notation at once.
 *
 * It is the editor with the source taken away. The same canvas, the same
 * rail, the same panels and the same save; what changes is that the sheet
 * holds many notations, so the notation the tools work in is the one in hand
 * — picked from the library, or taken from whatever the reader picks on the
 * sheet — and every connector already drawn is routed by its own.
 */

export interface OpenedStudio {
  id: string;
  title: string;
  document: StudioDocument;
  /** the revision it was opened at; a save over a newer one is refused */
  revision?: number;
  /** opened through an editable shared link: saves go to the link, not to a sheet of the reader's */
  shared?: string;
}

const DRAWER_TITLES: Record<Drawer, string> = {
  shapes: "Library",
  figure: "Figure",
  elements: "Elements",
  source: "Library",
  style: "Style",
  ai: "Library",
  table: "Table",
};

/** A table file is read as text; anything bigger than this is not a table to draw. */
const TABLE_FILE_LIMIT = 2_000_000;

/** A Studio sheet always grows down the page; only a source has a direction. */
const DOWN = "down" as const;

function openScene(studio: OpenedStudio | undefined): {
  elements: ExcalidrawElement[];
  files: BinaryFiles;
  error?: string;
} {
  if (!studio) {
    return { elements: [], files: {} };
  }
  try {
    const scene = restore(studio.document.scene as unknown as Parameters<typeof restore>[0], null, null);
    return { elements: scene.elements, files: scene.files };
  } catch {
    return { elements: [], files: {}, error: "This saved Studio sheet is damaged and could not be opened." };
  }
}

/** How much is on the sheet, said the way a reader counts it. */
function tally(elements: readonly ExcalidrawElement[]): string {
  const units = new Set<string>();
  const notations = new Set<DiagramCategory>();
  for (const element of elements) {
    const mark = element.isDeleted ? null : unitOf(element);
    // a pool and a boundary are elements too; a lane is part of its pool
    if (!mark || mark.kind === "edge" || mark.kind === "lane") continue;
    units.add(mark.unit);
    const notation = notationOfMark(mark, elements);
    if (notation) notations.add(notation);
  }
  if (units.size === 0) return "Empty sheet";
  return `${units.size} element${units.size === 1 ? "" : "s"} · ${notations.size} notation${notations.size === 1 ? "" : "s"}`;
}

export default function StudioRoot({ initial }: { initial?: OpenedStudio }) {
  const ink = useTingraphStore((s) => s.ink);
  const styleId = useTingraphStore((s) => s.style);
  const style = styleFor(styleId);
  const drawer = useTingraphStore((s) => s.drawer);
  const closeDrawer = useTingraphStore((s) => s.closeDrawer);
  const exportOpen = useTingraphStore((s) => s.exportOpen);
  const setExportOpen = useTingraphStore((s) => s.setExportOpen);

  const [notation, setNotation] = useState<DiagramCategory>(STUDIO_START);
  const [name, setName] = useState(initial?.title ?? UNTITLED_STUDIO);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [picked, setPicked] = useState<ExcalidrawElement[]>([]);
  const [dragging, setDragging] = useState<PaletteItem | null>(null);
  const [empty, setEmpty] = useState(true);
  const [summary, setSummary] = useState("Empty sheet");
  const [figure, setFigure] = useState<FigureOnSheet | null>(null);
  const [part, setPart] = useState<string | null>(null);
  const [parts, setParts] = useState<SheetParts>(NO_PARTS);
  const [imageMessage, setImageMessage] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [tableMessage, setTableMessage] = useState<{ tone: "ok" | "alert"; text: string } | null>(null);
  const [accountGate, setAccountGate] = useState<{ title: string; message: string; next: string } | null>(null);
  const counterRef = useRef(1);
  const [seed] = useState(() => openScene(initial));

  // Studio has no source, so the panels that write one are never out here,
  // and a sheet opened fresh opens on its library
  useEffect(() => {
    useTingraphStore.setState({
      drawer: initial ? null : "shapes",
      connector: null,
      tool: "selection",
      exportOpen: false,
      ...(initial
        ? { ink: initial.document.ink, mixed: initial.document.ink.color, style: initial.document.style }
        : {}),
    });
  }, [initial]);

  const rules: Rules = useMemo(() => ({ category: notation, direction: DOWN }), [notation]);
  const rulesFor = useCallback((link: LinkMark) => rulesForLink(link, rules), [rules]);

  /** Every change to the sheet goes through here, so undo always has a step. */
  const edit = (rewrite: (elements: readonly ExcalidrawElement[]) => ExcalidrawElement[]) => {
    if (!api) return;
    api.updateScene({
      elements: rewrite(api.getSceneElementsIncludingDeleted()),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  /** The middle of the room the sheet is drawn in, in sheet coordinates. */
  const centre = () => {
    if (!api) return { x: 0, y: 0 };
    const state = api.getAppState();
    return viewportCoordsToSceneCoords(
      { clientX: state.offsetLeft + state.width / 2, clientY: state.offsetTop + state.height / 2 },
      state,
    );
  };

  /**
   * New pieces on the sheet, in one step of the history. A single shape is
   * picked, ready to be moved or renamed; a whole drawing is brought into
   * view instead, since forty pieces held at once are only in the way.
   */
  const add = (added: ExcalidrawElement[], frame = false) => {
    if (!api || added.length === 0) return;
    const units = new Set(added.map((element) => unitOf(element)?.unit).filter(Boolean) as string[]);
    api.updateScene({
      elements: [...api.getSceneElementsIncludingDeleted(), ...added],
      appState: frame
        ? { selectedElementIds: {}, selectedGroupIds: {}, editingGroupId: null }
        : {
            selectedElementIds: Object.fromEntries(added.map((element) => [element.id, true as const])),
            selectedGroupIds: units.size === 1 ? { [[...units][0]]: true } : {},
            editingGroupId: null,
          },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    // a whole drawing is framed; a single structure is only brought into view
    api.scrollToContent(
      added,
      frame ? { fitToViewport: true, viewportZoomFactor: 0.85, animate: true } : { animate: true },
    );
  };

  /** One shape of the notation in hand, untied to anything, where it was dropped. */
  const placeShape = (type: string, at: { x: number; y: number }) => {
    const added = paletteShape(notation, type, at, counterRef.current++, ink, style);
    if (!added || !api) return;
    api.updateScene({
      elements: [...api.getSceneElementsIncludingDeleted(), ...added],
      appState: {
        selectedElementIds: Object.fromEntries(added.map((element) => [element.id, true as const])),
        selectedGroupIds: Object.fromEntries(
          [...new Set(added.map((element) => unitOf(element)?.unit).filter(Boolean) as string[])].map(
            (unit) => [unit, true as const],
          ),
        ),
        editingGroupId: null,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  /** A whole drawing from a small source, beside whatever the sheet already holds. */
  const placeDrawing = (source: string, frame: boolean) => {
    if (!api) return;
    const pieces = drawPieces(source, ink, style);
    const size = boundsOf(pieces as unknown as Parameters<typeof boundsOf>[0]);
    if (!size) return;
    const at = spotFor(api.getSceneElements(), size, centre());
    add(adoptPieces(pieces, notation, at), frame);
  };

  /** An empty figure of the notation in hand, where it overlaps nothing. */
  const addFigure = () => {
    const def = figureDef(notation);
    if (!def || !api) return;
    const spec = def.blank();
    const size = { width: spec.options.width, height: spec.options.height };
    const at = spotFor(api.getSceneElements(), size, centre());
    edit((elements) =>
      newFigure(elements, spec, { x: at.x + size.width / 2, y: at.y + size.height / 2 }, ink, style),
    );
  };

  /**
   * A table on the sheet: a matrix figure, placed where it overlaps nothing,
   * picked so its notation is in hand and its panel and handles answer.
   */
  const placeTable = (spec: MatrixSpec) => {
    if (!api) return;
    const size = { width: spec.options.width, height: spec.options.height };
    const at = spotFor(api.getSceneElements(), size, centre());
    add(newFigure([], spec, { x: at.x + size.width / 2, y: at.y + size.height / 2 }, ink, style));
    setTableMessage({
      tone: "ok",
      text: `Table placed: ${spec.rows.length} row${spec.rows.length === 1 ? "" : "s"} under ${spec.columns.length} column heading${spec.columns.length === 1 ? "" : "s"}. Double-click a cell to change it; the Matrix panel (F) holds the rest.`,
    });
  };

  /** A table read from somewhere, or the reason it could not be: said in the panel. */
  const placeGrid = (grid: Grid | null, from: string) => {
    if (!grid) {
      setTableMessage({ tone: "alert", text: `No table was found in ${from}.` });
      return;
    }
    const made = tableFromGrid(grid);
    if ("error" in made) {
      setTableMessage({ tone: "alert", text: made.error });
      // the refusal is in the table panel, so the panel is brought out to say it
      if (useTingraphStore.getState().drawer !== "table") useTingraphStore.getState().openDrawer("table");
      return;
    }
    placeTable(made.spec);
  };

  /** The clipboard, asked for from the panel's button rather than by Ctrl+V. */
  const pasteTable = async () => {
    try {
      let html = "";
      let text = "";
      if (navigator.clipboard?.read) {
        for (const item of await navigator.clipboard.read()) {
          if (!html && item.types.includes("text/html")) html = await (await item.getType("text/html")).text();
          if (!text && item.types.includes("text/plain")) text = await (await item.getType("text/plain")).text();
        }
      } else {
        text = await navigator.clipboard.readText();
      }
      // the button is pressed on purpose, so comma- and semicolon-separated text
      // counts too; a lone value or a sentence is still not a table
      const fromText = text.trim() ? parseTableText(text) : null;
      placeGrid(
        tableFromClipboard(html, text) ??
          (fromText && fromText.rows.length >= 2 && fromText.rows[0].length >= 2 ? fromText : null),
        "the clipboard",
      );
    } catch {
      setTableMessage({
        tone: "alert",
        text: "The browser would not share the clipboard. Click the sheet and press Ctrl+V instead.",
      });
    }
  };

  const importTable = async (file: File) => {
    if (/\.(xlsx?|ods|numbers)$/i.test(file.name)) {
      setTableMessage({
        tone: "alert",
        text: "Spreadsheet files are not read directly. Save it as CSV, or copy the cells and paste them on the sheet.",
      });
      return;
    }
    if (file.size > TABLE_FILE_LIMIT) {
      setTableMessage({ tone: "alert", text: "That file is over 2 MB, which is far more than one table on a sheet." });
      return;
    }
    const text = await file.text().catch(() => null);
    if (text === null) {
      setTableMessage({ tone: "alert", text: "That file could not be read." });
      return;
    }
    const html = /\.html?$/i.test(file.name) || /<table[\s>]/i.test(text);
    placeGrid(html ? parseHtmlTable(text) : parseTableText(text), file.name);
  };

  // Ctrl+V with a table on the clipboard draws the table. Anything else is
  // left to Excalidraw, which pastes text, pictures and copied shapes itself;
  // nothing is taken while the reader is writing in a field or a caption
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      // a dialog over the sheet (share, export, sign-in) is not the sheet
      if (typing(event.target) || overDialog() || !event.clipboardData || !api) return;
      const grid = tableFromClipboard(
        event.clipboardData.getData("text/html"),
        event.clipboardData.getData("text/plain"),
      );
      if (!grid) return;
      event.preventDefault();
      event.stopPropagation();
      placeGrid(grid, "the clipboard");
    };
    document.addEventListener("paste", paste, true);
    return () => document.removeEventListener("paste", paste, true);
  });

  const selectUnit = (unit: string, elements?: readonly ExcalidrawElement[]) => {
    if (!api) return;
    const scene = elements ?? api.getSceneElements();
    const mine = scene.filter((element) => unitOf(element)?.unit === unit);
    if (mine.length === 0) return;
    api.updateScene({
      ...(elements ? { elements: elements as ExcalidrawElement[] } : {}),
      appState: {
        selectedElementIds: Object.fromEntries(mine.map((element) => [element.id, true as const])),
        selectedGroupIds: { [unit]: true },
        editingGroupId: null,
      },
      captureUpdate: elements ? CaptureUpdateAction.IMMEDIATELY : CaptureUpdateAction.NEVER,
    });
  };

  const changeFigure = (spec: FigureSpec, settled = true) => {
    if (!figure || !api) return;
    const box = { x: figure.box.x, y: figure.box.y, width: spec.options.width, height: spec.options.height };
    const wasHeld = picked.some((element) => unitOf(element)?.unit === figure.unit);
    const next = redrawFigure(api.getSceneElementsIncludingDeleted(), figure.unit, spec, box, ink, style);
    api.updateScene({
      elements: next,
      ...(wasHeld
        ? {
            appState: {
              selectedElementIds: Object.fromEntries(
                next
                  .filter((element) => unitOf(element)?.unit === figure.unit)
                  .map((element) => [element.id, true as const]),
              ),
              selectedGroupIds: { [figure.unit]: true },
            },
          }
        : {}),
      captureUpdate: settled ? CaptureUpdateAction.IMMEDIATELY : CaptureUpdateAction.EVENTUALLY,
    });
  };

  const changeElement = (unit: string, spec: DSLNode) => {
    if (!api) return;
    const scene = api.getSceneElementsIncludingDeleted();
    const entry = elementOn(scene, unit);
    if (!entry) return;
    const next = redrawElement(
      scene,
      unit,
      spec,
      { x: entry.box.x, y: entry.box.y, width: entry.box.width },
      notation,
      ink,
      style,
    );
    selectUnit(unit, next);
  };

  const changeElementImage = async (unit: string, file: File) => {
    if (!api) return;
    setImageMessage("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 4_000_000) {
      setImageMessage("Choose a PNG, JPEG or WebP image under 4 MB.");
      return;
    }
    try {
      const dataURL = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new window.Image();
        image.onload = () =>
          image.naturalWidth && image.naturalHeight
            ? resolve({ width: image.naturalWidth, height: image.naturalHeight })
            : reject(new Error("Invalid image"));
        image.onerror = () => reject(new Error("Invalid image"));
        image.src = dataURL;
      });
      const entry = elementOn(api.getSceneElements(), unit);
      if (!entry || entry.spec.type === "zone") return;
      const id = `arch-${crypto.randomUUID()}`;
      api.addFiles([
        {
          id: id as FileId,
          dataURL: dataURL as BinaryFileData["dataURL"],
          mimeType: file.type as BinaryFileData["mimeType"],
          created: Date.now(),
        },
      ]);
      changeElement(unit, { ...entry.spec, image: { fileId: id, ...dimensions } });
    } catch {
      setImageMessage("Image could not be opened. Choose another file.");
    }
  };

  const connectElements = (from: string, to: string) => {
    if (from === to) return;
    edit(
      (elements) =>
        newConnector(
          elements,
          { line: "data-flow", from: { unit: from }, to: { unit: to }, notation },
          rules,
          connectorStyle(ink, notation, style),
        ) ?? elements.slice(),
    );
  };

  const restyleSelection = async (patch: StylePatch, was?: { strokeColor?: string }) => {
    const ids = new Set(picked.map((element) => element.id));
    if (
      patch.fontFamily !== undefined ||
      patch.fontSize !== undefined ||
      patch.bold !== undefined ||
      patch.italic !== undefined
    ) {
      await fontReady(
        styleOfFont(patch.fontFamily ?? style.fontFamily),
        picked.map((element) => (element.type === "text" ? element.text : "")).join(""),
      );
    }
    edit((elements) => applyStyle(elements, ids, patch, was));
  };

  // whatever the reader picks on the sheet puts its notation in hand, so the
  // connector, the panels and the handles all work in the notation of the
  // drawing they are working on
  const handleSelection = (next: ExcalidrawElement[]) => {
    setPicked(next);
    if (!api) return;
    const held = notationOfPicked(next, api.getSceneElements());
    if (held) {
      setNotation((current) => (current === held ? current : held));
    }
  };

  // the count in the bar follows the sheet
  useEffect(() => {
    if (!api) return;
    let last = "";
    const read = () => {
      const next = tally(api.getSceneElements());
      if (next !== last) {
        last = next;
        setSummary(next);
      }
    };
    read();
    return api.onChange(read);
  }, [api]);

  // ink and drawing style reach the whole sheet, as in the editor
  const inkRef = useRef(ink);
  useEffect(() => {
    const was = inkRef.current;
    inkRef.current = ink;
    if (was.color === ink.color && was.tint === ink.tint) return;
    edit((elements) => reink(elements, was, ink));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, ink]);

  const styleRef = useRef(styleId);
  useEffect(() => {
    if (styleRef.current === styleId || !api) return;
    styleRef.current = styleId;
    const next = styleFor(styleId);
    const sample = api
      .getSceneElements()
      .map((element) => (element.type === "text" ? element.text : ""))
      .join("");
    let alive = true;
    fontReady(next, sample).then(() => {
      if (alive) edit((elements) => restyle(elements, next));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, styleId]);

  const requireAccount = async (title: string, message: string) => {
    const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const session = await getSession().catch(() => null);
    if (!session?.user) {
      setAccountGate({ title, message, next });
      return null;
    }
    return session.user;
  };

  const { savedId, saveState, saveMessage, autoSave, save, toggleAutoSave } = useSheetSave({
    api,
    initialId: initial?.shared ? null : (initial?.id ?? null),
    initialRevision: initial?.revision ?? null,
    shared: initial?.shared ?? null,
    extra: () => {
      const state = useTingraphStore.getState();
      return [name, state.style, state.ink.color, state.ink.tint].join("|");
    },
    build: () => {
      const scene = withSceneFiles(
        JSON.parse(serializeAsJSON(api!.getSceneElements(), {}, api!.getFiles(), "database")) as Json,
        api!.getFiles() as unknown as Json,
      );
      const document = {
        version: 1,
        category: STUDIO_CATEGORY,
        source: "",
        direction: DOWN,
        ink,
        style: styleId,
        scene,
      } satisfies StudioDocument;
      return {
        title: diagramTitle(name, UNTITLED_STUDIO),
        category: STUDIO_CATEGORY,
        document: document as unknown as Json,
      };
    },
    locate: (url, id) => url.searchParams.set("diagram", id),
    requireAccount,
    noun: "Studio sheet",
  });

  if (seed.error) {
    return (
      <div className="flex h-dvh items-center justify-center bg-bone px-4 font-mono">
        <div className="slab max-w-md bg-white p-6 text-center">
          <p className="text-[14px] text-alert">{seed.error}</p>
          <Link
            href="/editor?view=mine"
            className="slab-tight press mt-5 inline-block bg-edge px-3 py-2 text-[12px] font-semibold text-bone"
          >
            Back to My diagrams
          </Link>
        </div>
      </div>
    );
  }

  const panel = elementPanel(notation);
  const figureHere = figure && figure.spec.kind === notation ? figure : null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bone font-mono">
      <header className="flex h-14 shrink-0 items-stretch border-b-2 border-edge bg-bone">
        <HomeMark />
        {/* on a phone the bar has room for its actions only, as the editor's does */}
        <div className="hidden min-w-0 shrink flex-col justify-center gap-1.5 border-r-2 border-edge px-4 sm:flex">
          <Tick>Studio</Tick>
          <input
            value={name}
            onChange={(event) => setName(event.target.value.slice(0, 120))}
            onBlur={() => setName((current) => current.trim() || UNTITLED_STUDIO)}
            aria-label="Name of this Studio sheet"
            spellCheck={false}
            className="w-[11rem] min-w-0 bg-transparent text-[12.5px] leading-none text-ink outline-none focus:underline lg:w-[14rem]"
          />
        </div>
        <Cell label="In hand">{TEMPLATE_LABELS[notation]}</Cell>
        <Cell label="On the sheet">{summary}</Cell>
        {initial?.shared && <SharedCell />}
        <SheetActions
          empty={empty}
          saveState={saveState}
          saveMessage={saveMessage}
          onSave={() => void save()}
          autoSave={autoSave}
          onAutoSave={() => void toggleAutoSave()}
          // only the owner shares; someone editing through a link has no Share
          onShare={initial?.shared ? undefined : () => setShareOpen(true)}
        />
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col sm:flex-row">
        <Rail category={notation} mode="studio" />

        {drawer && drawer !== "source" && drawer !== "ai" && (
          <aside className="absolute inset-x-0 bottom-14 top-0 z-30 flex min-h-0 flex-col bg-bone sm:static sm:w-[352px] sm:shrink-0 sm:border-r-2 sm:border-edge">
            <header className="flex items-center gap-2 border-b-2 border-edge px-3 py-2.5">
              <Tick>
                {drawer === "figure"
                  ? (figureDef(notation)?.label ?? DRAWER_TITLES.figure)
                  : drawer === "elements"
                    ? (panel?.label ?? DRAWER_TITLES.elements)
                    : DRAWER_TITLES[drawer]}
              </Tick>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Close the panel"
                title="Close the panel"
                className="ml-auto grid h-10 w-10 place-items-center border-2 border-transparent text-ink-faint transition-colors hover:border-edge hover:bg-white hover:text-ink"
              >
                <X size={14} />
              </button>
            </header>

            {drawer === "shapes" && (
              <LibraryDrawer
                notation={notation}
                onNotation={setNotation}
                onPlace={(item) => placeShape(item.type, centre())}
                onDrag={setDragging}
                onStructure={(source) => placeDrawing(source, false)}
                onFigure={addFigure}
                onExample={(source) => placeDrawing(source, true)}
              />
            )}
            {drawer === "figure" && (
              <FigureDrawer
                category={notation}
                figure={figureHere}
                onChange={changeFigure}
                onAdd={addFigure}
                picked={part}
                onPick={setPart}
              />
            )}
            {drawer === "elements" && (
              <ElementDrawer
                category={notation}
                elements={parts.elements}
                links={parts.links}
                frames={parts.frames}
                pools={parts.pools}
                onSelect={selectUnit}
                held={parts.held}
                onChange={changeElement}
                onImage={(unit, file) => void changeElementImage(unit, file)}
                imageMessage={imageMessage}
                // a starting layout is a drawing like any other example here
                onTemplate={(source) => placeDrawing(source, true)}
                generating={false}
                onConnect={connectElements}
                onAdd={(type) => placeShape(type, centre())}
                onRemove={(unit) => edit((elements) => removeUnits(elements, [unit]))}
                onLink={(id, patch) => edit((elements) => writeLink(elements, id, patch, notation))}
                onLabelLink={(id, label) =>
                  edit((elements) => labelLink(elements, id, label, ink, style, notation))
                }
                onRemoveLink={(id) => {
                  const mark = api?.getSceneElements().find((element) => element.id === id);
                  const unit = mark ? unitOf(mark)?.unit : null;
                  if (unit) edit((elements) => removeUnits(elements, [unit]));
                }}
                onFrame={(unit, patch) => edit((elements) => renameFrame(elements, unit, patch.label ?? ""))}
                onAddFrame={() => edit((elements) => addBoundary(elements, centre(), ink, style))}
                onRemoveFrame={(unit) => {
                  const frame = parts.frames.find((entry) => entry.unit === unit);
                  if (frame) edit((elements) => removeFrame(elements, frame));
                }}
                onAddLane={(frame) => edit((elements) => addColumn(elements, frame, ink, style))}
                onRemoveLane={(frame) => edit((elements) => removeColumn(elements, frame))}
                onRenameLane={(unit, label) => edit((elements) => renameFrame(elements, unit, label))}
                onRenamePoolPart={(unit, label) => edit((elements) => renamePoolPart(elements, unit, label))}
                onAddPool={(pool) => edit((elements) => addPoolBelow(elements, pool, ink, style))}
                onRemovePool={(pool) => edit((elements) => removePool(elements, pool))}
                onAddPoolLane={(pool) => edit((elements) => addLane(elements, pool, ink, style))}
                onRemovePoolLane={(pool) => edit((elements) => removeLane(elements, pool))}
              />
            )}
            {drawer === "style" && <StyleDrawer category={notation} />}
            {drawer === "table" && (
              <TableDrawer
                message={tableMessage}
                onBlank={(rows, columns) => placeTable(blankTable(rows, columns))}
                onClipboard={() => void pasteTable()}
                onFile={(file) => void importTable(file)}
                onText={(text) => placeGrid(parseTableText(text), "that text")}
              />
            )}
          </aside>
        )}

        <main className="relative min-h-0 min-w-0 flex-1 bg-paper">
          <Canvas
            initialElements={seed.elements}
            initialFiles={seed.files}
            category={notation}
            onElementImage={(unit, file) => void changeElementImage(unit, file)}
            imageMessage={imageMessage}
            dragging={dragging}
            connectorStyle={connectorStyle(ink, notation, style)}
            rules={rules}
            rulesFor={rulesFor}
            onApi={setApi}
            onSelection={handleSelection}
            onDropShape={(type, clientX, clientY) => {
              if (api) {
                placeShape(type, viewportCoordsToSceneCoords({ clientX, clientY }, api.getAppState()));
              }
            }}
            onEdit={edit}
            onParts={setParts}
            onElementChange={changeElement}
            onEmptyChange={setEmpty}
            onFigure={setFigure}
            figure={figure}
            onFigureChange={changeFigure}
            part={part}
            onPart={setPart}
          />
          <div className="crop-marks pointer-events-none absolute inset-2.5 z-10" />
          {empty && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
              <div className="slab-tight max-w-sm bg-white/95 p-5 text-center">
                <Tick className="block">Studio</Tick>
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
                  A free sheet for every notation. Open the Library in the rail, pick a notation,
                  and drag its shapes here or insert a whole example. Draw as many diagrams side
                  by side as you like.
                </p>
              </div>
            </div>
          )}
          <Inspector picked={picked} category={notation} onPatch={restyleSelection} />
        </main>
      </div>

      {shareOpen && (
      <ShareDialog
        open
        diagramId={savedId}
        noun="Studio sheet"
        onSave={() => void save()}
        onClose={() => setShareOpen(false)}
      />
      )}
      {exportOpen && <ExportDialog api={api} title={name} onClose={() => setExportOpen(false)} />}
      <AccessDialog
        open={accountGate !== null}
        title={accountGate?.title ?? "Account required"}
        message={accountGate?.message ?? "Sign in to continue."}
        next={accountGate?.next ?? "/studio"}
        onClose={() => setAccountGate(null)}
      />
    </div>
  );
}
