// Regenerates lib/bpmn-icons/raw-paths.ts from upstream bpmn-js PathMap.js.
// Usage: curl bpmn-js PathMap.js to /tmp, then: node scripts/gen-bpmn-paths.mjs <path-to-PathMap.js>
import fs from "node:fs";

const srcPath = process.argv[2];
if (!srcPath) {
  console.error("usage: node scripts/gen-bpmn-paths.mjs <PathMap.js>");
  process.exit(1);
}
const src = fs.readFileSync(srcPath, "utf8");
const PathMap = new Function(
  src.replace("export default function PathMap()", "function PathMap()") + " return PathMap;",
)();
const pm = new PathMap().pathMap;

const wanted = [
  "EVENT_MESSAGE", "EVENT_TIMER_WH", "EVENT_TIMER_LINE",
  "GATEWAY_EXCLUSIVE", "GATEWAY_PARALLEL",
  "TASK_TYPE_SEND", "TASK_TYPE_SCRIPT",
  "TASK_TYPE_USER_1", "TASK_TYPE_USER_2", "TASK_TYPE_USER_3",
  "DATA_OBJECT_PATH",
];

const entries = wanted
  .map((k) => {
    const e = pm[k];
    if (!e || !e.d) throw new Error("missing " + k);
    const num = (n) => (e[n] === undefined ? "" : `\n    ${n}: ${JSON.stringify(e[n])},`);
    return `  ${k}: {\n    d:\n      ${JSON.stringify(e.d)},${num("height")}${num("width")}${num("heightElements")}${num("widthElements")}\n  },`;
  })
  .join("\n");

const header = `export interface RawPath {
  d: string;
  height?: number;
  width?: number;
  heightElements?: number[];
  widthElements?: number[];
}

// Ported 1:1 from bpmn-js upstream lib/draw/PathMap.js (MIT licensed).
// Generated programmatically from the upstream module — never hand-edit;
// regenerate with scripts/gen-bpmn-paths.mjs if bpmn-js changes.
export const RAW_PATHS: Record<string, RawPath> = {
`;
fs.writeFileSync("lib/bpmn-icons/raw-paths.ts", header + entries + "\n};\n");
console.log("lib/bpmn-icons/raw-paths.ts regenerated");
