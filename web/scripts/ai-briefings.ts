import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { briefingFor, KEYWORD, NOTATION_NAME } from "../lib/guide";
import type { DiagramCategory } from "../lib/types";

const categories = Object.keys(KEYWORD) as DiagramCategory[];
const output = Object.fromEntries(
  categories.map((category) => [
    category,
    {
      keyword: KEYWORD[category],
      name: NOTATION_NAME[category],
      briefing: briefingFor(category),
    },
  ]),
);

writeFileSync(
  resolve(import.meta.dirname, "../../backend/internal/ai/briefings.json"),
  `${JSON.stringify(output, null, 2)}\n`,
);
