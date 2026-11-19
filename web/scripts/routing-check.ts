import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync } from "node:fs";
import { Children, isValidElement, type ReactNode } from "react";
import { READY_DIAGRAMS, STARTER_DIAGRAMS } from "../lib/diagrams";
import nextConfig from "../next.config";

function contains(node: ReactNode, component: unknown): boolean {
  return Children.toArray(node).some((child) => isValidElement<{ children?: ReactNode }>(child)
    && (child.type === component || contains(child.props.children, component)));
}

async function checkRouting() {
  // Next installs this global before loading its server runtime.
  Object.assign(globalThis, { AsyncLocalStorage });
  const [{ getRedirectUrl, unstable_getResponseFromNextConfig }, { default: EditorPage }, { default: EditorShell }, { default: Catalog }] = await Promise.all([
    import("next/experimental/testing/server"), import("../app/editor/page"),
    import("../components/editor/editor-shell"), import("../components/site/catalog"),
  ]);
  const page = (query: Record<string, string | string[] | undefined>) => EditorPage({ params: Promise.resolve({}), searchParams: Promise.resolve(query) });
  for (const query of [{}, { view: "browse" }, { view: "mine" }, { type: "unknown" }, { type: ["flow", "bar"] }]) {
    const entry = await page(query);
    assert(contains(entry, Catalog), "library and saved-diagram tabs must open the catalogue");
    assert(!contains(entry, EditorShell), "browsing must not mount a canvas");
  }
  for (const diagram of READY_DIAGRAMS) {
    const entry = await page({ type: diagram.id });
    assert.equal(entry.type, EditorShell, `${diagram.id} must still open its canvas`);
    assert.equal(entry.props.initialCategory, diagram.keyword);
  }
  // a starter card opens its notation on the starter's source, and a starter
  // named for another notation opens the plain template
  for (const diagram of STARTER_DIAGRAMS) {
    const entry = await page({ type: diagram.keyword, starter: diagram.starter });
    assert.equal(entry.type, EditorShell, `${diagram.id} must open its notation's canvas`);
    assert.equal(entry.props.initialCategory, diagram.keyword);
    assert.equal(entry.props.starter, diagram.sample, `${diagram.id} must open on its own source`);
  }
  assert.equal((await page({ type: "flow", starter: "swot" })).props.starter, undefined);
  const id = "12345678-1234-1234-1234-123456789abc";
  for (const query of [{ diagram: id }, { type: "erd", diagram: id }]) {
    const entry = await page(query);
    assert.equal(entry.type, EditorShell, "saved diagrams must still open their canvas");
    assert.equal(entry.props.diagramId, id);
  }
  for (const query of ["", "?view=mine", "?type=erd&diagram="+id]) {
    const response = await unstable_getResponseFromNextConfig({ url: "https://tingraph.test/build"+query, nextConfig });
    assert.equal(response.status, 308);
    assert.equal(getRedirectUrl(response), "https://tingraph.test/editor"+query, "old links must preserve tab and diagram queries");
  }
  // Studio opens a fresh sheet, or the saved one it is asked for
  const [{ default: StudioPage }, { default: StudioShell }] = await Promise.all([
    import("../app/studio/page"), import("../components/studio/studio-shell"),
  ]);
  const studio = (query: Record<string, string | string[] | undefined>) => StudioPage({ params: Promise.resolve({}), searchParams: Promise.resolve(query) });
  const fresh = await studio({});
  assert.equal(fresh.type, StudioShell, "Studio must open its sheet");
  assert.equal(fresh.props.diagramId, undefined, "a fresh Studio sheet opens empty");
  assert.equal((await studio({ diagram: id })).props.diagramId, id, "a saved Studio sheet opens by id");
  assert.equal((await studio({ diagram: [id, id] })).props.diagramId, undefined, "a malformed id opens a fresh sheet");
  assert(!existsSync(new URL("../app/build/page.tsx", import.meta.url)), "only one library page may exist");
  console.log("routing self-check: catalogue tabs, all canvases, Studio, saved diagrams and legacy redirects passed");
}

checkRouting().catch((error) => { console.error(error); process.exitCode = 1; });
