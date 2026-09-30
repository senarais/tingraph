import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DOC_GUIDES, DIAGRAM_DOCS, docHref } from "../lib/docs";
import { READY_DIAGRAMS } from "../lib/diagrams";
import { EXAMPLE, GUIDE_SECTIONS, RULES, promptFor } from "../lib/guide";
import { POLICIES, POLICY_VERSION } from "../lib/legal";
import { parseDSL } from "../lib/parser/parse-dsl";
import { computeLayout } from "../lib/layout/compute-layout";

const slugs = [...DOC_GUIDES.map((guide) => guide.slug), ...READY_DIAGRAMS.map((diagram) => diagram.id)];
assert.equal(new Set(slugs).size, slugs.length, "guide and diagram paths must be unique");
assert.equal(docHref("overview"), "/docs");
assert.equal(Object.keys(DIAGRAM_DOCS).length, READY_DIAGRAMS.length, "every ready diagram needs editorial guidance");

for (const diagram of READY_DIAGRAMS) {
  const category = diagram.keyword;
  assert(category, `${diagram.name} needs a notation keyword`);
  assert(DIAGRAM_DOCS[category]?.editing.length, `${diagram.name} needs canvas guidance`);
  assert(GUIDE_SECTIONS[category].length && RULES[category].length, `${diagram.name} needs a complete reference`);
  const source = EXAMPLE[category];
  const layout = computeLayout(parseDSL(source), "down");
  assert(layout, `${diagram.name} documentation example must lay out`);
  const prompt = promptFor(category);
  assert(prompt.includes(source.trimEnd()), `${diagram.name} prompt must contain the displayed example`);
  for (const section of GUIDE_SECTIONS[category]) {
    for (const row of section.rows) assert(prompt.includes(row.syntax), `${diagram.name} prompt missing ${row.syntax}`);
  }
}

for (const page of [...DOC_GUIDES, ...POLICIES]) {
  assert.equal(new Set(page.sections.map((section) => section.id)).size, page.sections.length, `${page.slug} anchors must be unique`);
}
assert.equal(new Set(POLICIES.map((policy) => policy.slug)).size, POLICIES.length);
for (const slug of ["privacy", "terms", "billing-policy", "cookies", "acceptable-use", "security"]) {
  assert(POLICIES.some((policy) => policy.slug === slug), `missing required policy: ${slug}`);
}
const backend = readFileSync(new URL("../../backend/internal/auth/consent.go", import.meta.url), "utf8");
const smoke = readFileSync(new URL("../../ops/smoke-test.sh", import.meta.url), "utf8");
assert(backend.includes(`const PolicyVersion = "${POLICY_VERSION}"`), "frontend and backend policy versions must agree");
assert(smoke.includes(`POLICY_VERSION='${POLICY_VERSION}'`), "smoke test must submit the current agreement");
console.log(`site self-check: ${READY_DIAGRAMS.length} diagram docs, prompts, examples and policy contracts passed`);
