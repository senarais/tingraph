"use client";

import { useRef, useState } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  inside,
  movableLeg,
  gripSide,
  routeBetween,
  sideAnchor,
  sidesFor,
  SIDES,
  type Box,
  type Point,
  type Rules,
} from "@/lib/canvas/connect";
import { linkTargets, newConnector, writeLink, type Ports } from "@/lib/canvas/scene";
import { portsOf } from "@/lib/canvas/erd";
import { unitOf, type LinkEnd, type LinkMark } from "@/lib/canvas/units";
import { connectorInk, connectorKind } from "@/lib/connectors";
import type { ConnectorStyle } from "@/lib/excalidraw-mapper/build-skeletons";
import type { CanvasView } from "@/components/editor/pool-controls";
import { useTingraphStore } from "@/lib/store";

/**
 * Drawing and adjusting connectors.
 *
 * Every gesture a connector answers to happens here, over the sheet rather
 * than inside it: the reader drags from one element to another, and the line
 * that follows the pointer is cut by the same routing the finished connector
 * gets, so what is drawn is what lands. Excalidraw never sees the gesture,
 * which is what keeps its arrow binding and its point editor — the handles
 * that scatter down the middle of a line and fight the hand — out of the way.
 */

interface ConnectLayerProps {
  api: ExcalidrawImperativeAPI | null;
  /** the connector the rail is holding, by name, or null for the pointer */
  holding: string | null;
  rules: Rules;
  /** the sheet's own line: its colour, weight and roughness */
  style: ConnectorStyle;
  view: CanvasView;
  /** the one connector picked on the sheet, when exactly one is */
  picked: ExcalidrawElement | null;
}

/** A table's rows, as points a connector may tie itself to. */
type PortList = Array<[string, number]>;

interface Hover {
  unit: string;
  box: Box;
  /** the rows this element publishes, empty for everything but a table */
  ports: PortList;
}

type Drag =
  | {
      mode: "draw";
      from: LinkEnd;
      box: Box;
      at: Point;
      /** the height the line leaves at, when it leaves a row */
      fromAt?: number;
    }
  | { mode: "leg"; id: string; at: Point }
  | { mode: "end"; id: string; which: "from" | "to"; at: Point };

const ACCENT = "#6b46ff";

/** How far from a row's middle the pointer still reads as being on that row. */
const PORT_REACH = 11;

/**
 * The element under the pointer: the one on top wins, as on the sheet. The
 * reach is a little wider than the outline, so the side dots that sit on it
 * can be taken hold of.
 */
function targetAt(
  targets: Map<string, Box>,
  point: Point,
  reach = 0,
): { unit: string; box: Box } | null {
  let found: { unit: string; box: Box } | null = null;
  for (const [unit, box] of targets) {
    if (inside(box, point, reach)) {
      found = { unit, box };
    }
  }
  return found;
}

/** Keeps the pointer on the element that took it, if the browser will. */
function capture(event: React.PointerEvent): void {
  try {
    (event.target as Element).setPointerCapture(event.pointerId);
  } catch {
    // a pointer that has already gone: the gesture still reads fine without it
  }
}

/** The corners of a connector in sheet coordinates. */
function cornersOf(element: ExcalidrawElement): Point[] {
  const points = (element as unknown as { points: ReadonlyArray<readonly [number, number]> })
    .points;
  return points.map((point) => ({ x: element.x + point[0], y: element.y + point[1] }));
}

export default function ConnectLayer({
  api,
  holding,
  rules,
  style,
  view,
  picked,
}: ConnectLayerProps) {
  const panning = useTingraphStore((s) => s.panning);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const targetsRef = useRef<Map<string, Box>>(new Map());
  const portsRef = useRef<Ports>(new Map());
  const svgRef = useRef<SVGSVGElement>(null);

  const link = picked ? unitOf(picked)?.link ?? null : null;
  const drawing = holding !== null && !panning;
  // a half-drawn connector is dropped the moment the rail puts the tool back
  const held = drag?.mode === "draw" && holding === null ? null : drag;

  if (!api) {
    return null;
  }

  const sceneAt = (event: { clientX: number; clientY: number }): Point => {
    const box = svgRef.current?.getBoundingClientRect();
    const state = api.getAppState();
    return {
      x: (event.clientX - (box?.left ?? 0)) / state.zoom.value - state.scrollX,
      y: (event.clientY - (box?.top ?? 0)) / state.zoom.value - state.scrollY,
    };
  };

  const readTargets = () => {
    const scene = api.getSceneElements();
    targetsRef.current = linkTargets(scene);
    // an ERD table publishes a point per column, so a relation drawn by hand
    // lands on the key it was dragged from rather than on the whole box
    portsRef.current = rules.category === "erd" ? portsOf(scene) : new Map();
    return targetsRef.current;
  };

  /** The row of a table the pointer is over, when the table has rows at all. */
  const gripPort = (unit: string, point: Point): string | undefined => {
    for (const [name, y] of portsRef.current.get(unit) ?? []) {
      if (Math.abs(point.y - y) <= PORT_REACH) {
        return name;
      }
    }
    return undefined;
  };

  /** One end as it should be tied: to a row when there is one under the hand. */
  const endAt = (found: { unit: string; box: Box }, point: Point): LinkEnd => {
    const port = gripPort(found.unit, point);
    if (port) {
      return { unit: found.unit, port };
    }
    const side = grip(found.box, point);
    return { unit: found.unit, ...(side ? { side } : {}) };
  };

  /** What is under the pointer, with the rows it offers, for the overlay. */
  const hoverAt = (point: Point, targets: Map<string, Box>): Hover | null => {
    const found = targetAt(targets, point, reach());
    return found
      ? { ...found, ports: [...(portsRef.current.get(found.unit) ?? [])] }
      : null;
  };

  /** Writes one connector back, re-cutting its route from the new setting. */
  const write = (id: string, patch: Partial<LinkMark>, settled: boolean) => {
    api.updateScene({
      elements: writeLink(api.getSceneElements(), id, patch, rules.category),
      // a leg still under the hand waits for the hand to come off before it
      // reaches the history, so one drag is one step back
      captureUpdate: settled
        ? CaptureUpdateAction.IMMEDIATELY
        : CaptureUpdateAction.EVENTUALLY,
    });
  };

  // ------------------------------------------------------------ drawing

  /** How far past an outline the pointer still counts as being on it. */
  const reach = () => 9 / view.zoom;

  const grip = (box: Box, point: Point) => gripSide(box, point, reach());

  const startDraw = (event: React.PointerEvent) => {
    const point = sceneAt(event);
    const found = targetAt(readTargets(), point, reach());
    if (!found) {
      return;
    }
    capture(event);
    const from = endAt(found, point);
    const fromAt = from.port
      ? portsRef.current.get(from.unit)?.get(from.port)
      : undefined;
    setDrag({
      mode: "draw",
      from,
      box: found.box,
      at: point,
      ...(fromAt === undefined ? {} : { fromAt }),
    });
  };

  const moveDraw = (event: React.PointerEvent) => {
    const point = sceneAt(event);
    setHover(hoverAt(point, held ? targetsRef.current : readTargets()));
    if (held?.mode === "draw") {
      setDrag({ ...held, at: point });
    }
  };

  const endDraw = (event: React.PointerEvent) => {
    const point = sceneAt(event);
    const found = targetAt(targetsRef.current, point, reach());
    setDrag(null);
    if (!held || held.mode !== "draw" || !found || found.unit === held.from.unit || !holding) {
      return;
    }
    const kind = connectorKind(holding, rules.category);
    const mark: LinkMark = {
      line: kind.id,
      from: held.from,
      to: endAt(found, point),
    };
    const next = newConnector(
      api.getSceneElements(),
      mark,
      rules,
      { ...style, ...connectorInk(kind) },
      portsRef.current,
    );
    if (!next) {
      return;
    }
    const added = next[next.length - 1];
    api.updateScene({
      elements: next,
      appState: { selectedElementIds: { [added.id]: true } },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  // ------------------------------------------------------------- handles

  const dragHandle = (event: React.PointerEvent, mode: Drag) => {
    event.stopPropagation();
    capture(event);
    readTargets();
    setDrag(mode);
  };

  const moveHandle = (event: React.PointerEvent) => {
    if (!held || !picked || !link) {
      return;
    }
    const point = sceneAt(event);
    if (held.mode === "leg") {
      const leg = movableLeg(cornersOf(picked));
      if (leg) {
        write(held.id, { bend: Math.round(leg.upright ? point.x : point.y) }, false);
      }
      return;
    }
    if (held.mode === "end") {
      setHover(hoverAt(point, targetsRef.current));
    }
  };

  const endHandle = (event: React.PointerEvent) => {
    const point = sceneAt(event);
    setDrag(null);
    setHover(null);
    if (!held || !picked || !link) {
      return;
    }
    if (held.mode === "leg") {
      write(held.id, {}, true);
      return;
    }
    if (held.mode !== "end") {
      return;
    }
    const found = targetAt(targetsRef.current, point, reach());
    if (!found) {
      return;
    }
    const other = held.which === "from" ? link.to.unit : link.from.unit;
    if (found.unit === other) {
      return;
    }
    const end = endAt(found, point);
    write(
      held.id,
      held.which === "from" ? { from: end, bend: null } : { to: end, bend: null },
      true,
    );
  };

  // ------------------------------------------------------------ drawing it

  const scale = view.zoom;
  const size = (value: number) => value / scale;
  const preview = (() => {
    if (held?.mode !== "draw") {
      return null;
    }
    const from = held.box;
    const fromAt = held.fromAt;
    if (hover && hover.unit !== held.from.unit) {
      const toAt = hover.ports.find(
        ([, y]) => Math.abs(held.at.y - y) <= PORT_REACH,
      )?.[1];
      return routeBetween(from, hover.box, {
        ...rules,
        fromSide: held.from.side,
        ...(fromAt === undefined ? {} : { fromAt }),
        ...(toAt === undefined ? {} : { toAt }),
      });
    }
    // nothing under the pointer yet: the line leaves the side it would leave
    // by, and follows the hand from there
    const side =
      held.from.side ??
      sidesFor(from, { x: held.at.x, y: held.at.y, width: 1, height: 1 }, rules)[0];
    return [sideAnchor(from, side), held.at];
  })();

  const corners = picked && link && holding === null ? cornersOf(picked) : null;
  const leg = corners ? movableLeg(corners) : null;

  const line = (points: Point[]) => points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 z-20 h-full w-full"
      style={{
        pointerEvents: drawing ? "auto" : "none",
        cursor: drawing ? "crosshair" : undefined,
        touchAction: "none",
      }}
      onPointerDown={drawing ? (event) => startDraw(event) : undefined}
      onPointerMove={drawing ? moveDraw : held ? moveHandle : undefined}
      onPointerUp={drawing ? endDraw : held ? endHandle : undefined}
      onPointerLeave={drawing && !held ? () => setHover(null) : undefined}
      // the sheet keeps its own zoom and pan while a connector is out: a wheel
      // over this layer is handed to the canvas under it, along with where the
      // pointer was, because that is the point the canvas zooms about
      onWheel={(event) => {
        const canvas = svgRef.current?.parentElement?.querySelector(
          ".excalidraw__canvas.interactive",
        );
        const where = {
          clientX: event.clientX,
          clientY: event.clientY,
          bubbles: true,
          cancelable: true,
        };
        canvas?.dispatchEvent(new PointerEvent("pointermove", { ...where, pointerId: 1 }));
        canvas?.dispatchEvent(
          new WheelEvent("wheel", {
            ...where,
            deltaX: event.deltaX,
            deltaY: event.deltaY,
            deltaMode: event.deltaMode,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            shiftKey: event.shiftKey,
          }),
        );
      }}
    >
      <g transform={`translate(${view.scrollX * scale} ${view.scrollY * scale}) scale(${scale})`}>
        {(drawing || held?.mode === "end") && hover && (
          <>
            <rect
              x={hover.box.x}
              y={hover.box.y}
              width={hover.box.width}
              height={hover.box.height}
              fill="none"
              stroke={ACCENT}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
            {hover.ports.map(([name, y]) => (
              <g key={`port-${name}`}>
                <line
                  x1={hover.box.x}
                  y1={y}
                  x2={hover.box.x + hover.box.width}
                  y2={y}
                  stroke={ACCENT}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.45}
                  vectorEffect="non-scaling-stroke"
                />
                {[hover.box.x, hover.box.x + hover.box.width].map((x) => (
                  <circle
                    key={x}
                    cx={x}
                    cy={y}
                    r={size(3)}
                    fill={ACCENT}
                    stroke="#ffffff"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            ))}
            {hover.ports.length === 0 &&
              SIDES.map((side) => {
                const dot = sideAnchor(hover.box, side);
                return (
                  <circle
                    key={side}
                    cx={dot.x}
                    cy={dot.y}
                    r={size(3.5)}
                    fill={ACCENT}
                    stroke="#ffffff"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
          </>
        )}
        {preview && (
          <polyline
            points={line(preview)}
            fill="none"
            stroke={ACCENT}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {corners && (
          <>
            {[corners[0], corners[corners.length - 1]].map((point, index) => (
              <circle
                key={index}
                cx={point.x}
                cy={point.y}
                r={size(5)}
                fill="#ffffff"
                stroke={ACCENT}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: "auto", cursor: "pointer" }}
                onPointerDown={(event) =>
                  dragHandle(event, {
                    mode: "end",
                    id: picked!.id,
                    which: index === 0 ? "from" : "to",
                    at: { x: point.x, y: point.y },
                  })
                }
                onPointerMove={moveHandle}
                onPointerUp={endHandle}
              />
            ))}
            {leg && (
              <rect
                x={leg.at.x - size(5)}
                y={leg.at.y - size(5)}
                width={size(10)}
                height={size(10)}
                rx={size(2)}
                fill="#ffffff"
                stroke={ACCENT}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                style={{
                  pointerEvents: "auto",
                  cursor: leg.upright ? "ew-resize" : "ns-resize",
                }}
                onPointerDown={(event) =>
                  dragHandle(event, { mode: "leg", id: picked!.id, at: leg.at })
                }
                onPointerMove={moveHandle}
                onPointerUp={endHandle}
                onDoubleClick={() => write(picked!.id, { bend: null }, true)}
              />
            )}
          </>
        )}
      </g>
    </svg>
  );
}
