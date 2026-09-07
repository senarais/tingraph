import { RawPath, RAW_PATHS } from "@/lib/bpmn-icons/raw-paths";

// Port of bpmn-js PathMap.getScaledPath (lib/draw/PathMap.js).
export interface ScaleParams {
  /** scale factors for the raw path's intrinsic size */
  xScaleFactor?: number;
  yScaleFactor?: number;
  containerWidth?: number;
  containerHeight?: number;
  /** relative position of the path origin inside the container (0..1) */
  position?: { mx: number; my: number };
  /** absolute origin inside the container */
  abspos?: { x: number; y: number };
}

function format(str: string, values: Record<string, unknown>): string {
  return str.replace(/\{([^{}]+)\}/g, (_, key: string) => {
    const parts = key.split(".");
    let res: unknown = values;
    for (const p of parts) {
      const val = (res as Record<string, unknown>)[p];
      if (val === undefined) {
        return "";
      }
      res = val;
    }
    return String(Math.round(Number(res) * 10000) / 10000);
  });
}

export function getScaledPath(pathId: string, param: ScaleParams): string {
  const rawPath: RawPath = RAW_PATHS[pathId];
  if (!rawPath) {
    throw new Error(`Unknown BPMN raw path "${pathId}"`);
  }

  let mx: number;
  let my: number;
  if (param.abspos) {
    mx = param.abspos.x;
    my = param.abspos.y;
  } else {
    const containerWidth = param.containerWidth ?? 0;
    const containerHeight = param.containerHeight ?? 0;
    mx = containerWidth * (param.position?.mx ?? 0);
    my = containerHeight * (param.position?.my ?? 0);
  }

  const coordinates: Record<string, number> = {};
  if (param.position && rawPath.height && rawPath.width) {
    const containerWidth = param.containerWidth ?? 0;
    const containerHeight = param.containerHeight ?? 0;
    const heightRatio =
      (containerHeight / rawPath.height) * (param.yScaleFactor ?? 1);
    const widthRatio =
      (containerWidth / rawPath.width) * (param.xScaleFactor ?? 1);
    rawPath.heightElements?.forEach((el, i) => {
      coordinates[`y${i}`] = el * heightRatio;
    });
    rawPath.widthElements?.forEach((el, i) => {
      coordinates[`x${i}`] = el * widthRatio;
    });
  }

  return format(rawPath.d, { mx, my, ...flatten(coordinates) });
}

function flatten(coordinates: Record<string, number>): { e: Record<string, number> } {
  return { e: coordinates };
}

/** Flattens an SVG path string into polyline points (origin-relative). */
export interface PathOptions {
  /** number of samples per cubic curve segment */
  curveSamples?: number;
}

interface Cursor {
  x: number;
  y: number;
}

function tokenize(d: string): Array<[string, number[]]> {
  const commands: Array<[string, number[]]> = [];
  const re = /([mlLhHvVcCsSqQtTaAzZ])([^mlLhHvVcCsSqQtTaAzZ]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    const nums = (m[2].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(
      Number,
    );
    commands.push([m[1], nums]);
  }
  return commands;
}

function sampleCubic(
  from: Cursor,
  c1: Cursor,
  c2: Cursor,
  to: Cursor,
  samples: number,
): Cursor[] {
  const pts: Cursor[] = [];
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const u = 1 - t;
    pts.push({
      x:
        u * u * u * from.x +
        3 * u * u * t * c1.x +
        3 * u * t * t * c2.x +
        t * t * t * to.x,
      y:
        u * u * u * from.y +
        3 * u * u * t * c1.y +
        3 * u * t * t * c2.y +
        t * t * t * to.y,
    });
  }
  return pts;
}

/**
 * Converts a scaled SVG path `d` into polyline point lists.
 * Multiple subpaths (after `m`/`M` following drawing, or `z`) become separate
 * point lists — mirroring how bpmn-js renders one <path> with subpaths.
 */
export function pathToPolylines(d: string, opts: PathOptions = {}): Cursor[][] {
  const curveSamples = opts.curveSamples ?? 8;
  const subpaths: Cursor[][] = [];
  let current: Cursor[] = [];
  let cursor: Cursor = { x: 0, y: 0 };
  let subpathStart: Cursor = { x: 0, y: 0 };
  let lastControl: Cursor | null = null;

  const pushPoint = (p: Cursor): void => {
    current.push(p);
    cursor = p;
  };

  for (const [cmd, nums] of tokenize(d)) {
    const abs = cmd === cmd.toUpperCase();
    switch (cmd.toLowerCase()) {
      case "m": {
        for (let i = 0; i + 1 < nums.length; i += 2) {
          const p = abs
            ? { x: nums[i], y: nums[i + 1] }
            : { x: cursor.x + nums[i], y: cursor.y + nums[i + 1] };
          if (i > 0 || current.length === 0) {
            // implicit lineto after first coordinate pair
            if (i === 0 && current.length > 0) {
              subpaths.push(current);
              current = [];
            }
          }
          if (i === 0) {
            subpathStart = p;
          }
          pushPoint(p);
        }
        break;
      }
      case "l": {
        for (let i = 0; i + 1 < nums.length; i += 2) {
          pushPoint(
            abs
              ? { x: nums[i], y: nums[i + 1] }
              : { x: cursor.x + nums[i], y: cursor.y + nums[i + 1] },
          );
        }
        break;
      }
      case "h": {
        for (const n of nums) {
          pushPoint(
            abs ? { x: n, y: cursor.y } : { x: cursor.x + n, y: cursor.y },
          );
        }
        break;
      }
      case "v": {
        for (const n of nums) {
          pushPoint(
            abs ? { x: cursor.x, y: n } : { x: cursor.x, y: cursor.y + n },
          );
        }
        break;
      }
      case "c": {
        for (let i = 0; i + 5 < nums.length; i += 6) {
          const c1 = abs
            ? { x: nums[i], y: nums[i + 1] }
            : { x: cursor.x + nums[i], y: cursor.y + nums[i + 1] };
          const c2 = abs
            ? { x: nums[i + 2], y: nums[i + 3] }
            : { x: cursor.x + nums[i + 2], y: cursor.y + nums[i + 3] };
          const to = abs
            ? { x: nums[i + 4], y: nums[i + 5] }
            : { x: cursor.x + nums[i + 4], y: cursor.y + nums[i + 5] };
          for (const p of sampleCubic(cursor, c1, c2, to, curveSamples)) {
            pushPoint(p);
          }
          lastControl = c2;
        }
        break;
      }
      case "s": {
        for (let i = 0; i + 3 < nums.length; i += 4) {
          const c1 = lastControl
            ? { x: 2 * cursor.x - lastControl.x, y: 2 * cursor.y - lastControl.y }
            : { ...cursor };
          const c2 = abs
            ? { x: nums[i], y: nums[i + 1] }
            : { x: cursor.x + nums[i], y: cursor.y + nums[i + 1] };
          const to = abs
            ? { x: nums[i + 2], y: nums[i + 3] }
            : { x: cursor.x + nums[i + 2], y: cursor.y + nums[i + 3] };
          for (const p of sampleCubic(cursor, c1, c2, to, curveSamples)) {
            pushPoint(p);
          }
          lastControl = c2;
        }
        break;
      }
      case "q": {
        for (let i = 0; i + 3 < nums.length; i += 4) {
          const q = abs
            ? { x: nums[i], y: nums[i + 1] }
            : { x: cursor.x + nums[i], y: cursor.y + nums[i + 1] };
          const to = abs
            ? { x: nums[i + 2], y: nums[i + 3] }
            : { x: cursor.x + nums[i + 2], y: cursor.y + nums[i + 3] };
          // approximate quadratic via points on the curve
          for (let s = 1; s <= curveSamples; s++) {
            const t = s / curveSamples;
            const u = 1 - t;
            pushPoint({
              x: u * u * cursor.x + 2 * u * t * q.x + t * t * to.x,
              y: u * u * cursor.y + 2 * u * t * q.y + t * t * to.y,
            });
          }
        }
        break;
      }
      case "z": {
        if (current.length > 1) {
          const first = current[0];
          const last = current[current.length - 1];
          if (first.x !== last.x || first.y !== last.y) {
            pushPoint({ ...first });
          }
          subpaths.push(current);
          current = [];
        }
        cursor = subpathStart;
        break;
      }
      default:
        break;
    }
    if (cmd.toLowerCase() !== "c" && cmd.toLowerCase() !== "s") {
      lastControl = null;
    }
  }
  if (current.length > 1) {
    subpaths.push(current);
  }
  return subpaths;
}

/** Convenience: scale a raw path and return its polyline subpaths. */
export function rawPathToPolylines(
  pathId: string,
  param: ScaleParams,
  opts: PathOptions = {},
): Cursor[][] {
  return pathToPolylines(getScaledPath(pathId, param), opts);
}
