import type { AST } from "@/lib/types";
import { walkMind } from "@/lib/mind/spec";
import { messagesOf } from "@/lib/sequence/spec";

/**
 * What a drawing is made of, said the way its own notation says it.
 *
 * A flowchart counts nodes and flows; a bar chart counts readings and series;
 * a pie counts slices. One function, because the top bar, the source drawer
 * and the demo on the landing page all report the same thing and must never
 * disagree about it.
 */
export function summarise(ast: AST): string {
  const figure = ast.figure;
  if (!figure) {
    return `${ast.nodes.length} nodes · ${ast.edges.length} flows`;
  }
  if (figure.kind === "mind") {
    const count = walkMind(figure.root).length - 1;
    return `${count} ${count === 1 ? "branch" : "branches"}`;
  }
  if (figure.kind === "matrix") {
    return `${figure.rows.length} rows · ${figure.columns.length} columns`;
  }
  if (figure.kind === "venn") {
    const named = Object.values(figure.regions).filter(Boolean).length;
    return `${figure.sets.length} sets · ${named} regions`;
  }
  if (figure.kind === "sequence") {
    const sent = messagesOf(figure.steps).length;
    return `${figure.participants.length} participants · ${sent} messages`;
  }
  if (figure.kind === "fishbone") {
    const causes = figure.bones.reduce((sum, bone) => sum + bone.causes.length, 0);
    return `${figure.bones.length} bones · ${causes} causes`;
  }
  const chart = figure;
  if (chart.kind === "scatter") {
    const points = chart.series.reduce(
      (sum, series) => sum + (series.points?.length ?? 0),
      0,
    );
    return `${points} points · ${chart.series.length} series`;
  }
  const marks = chart.kind === "pie" ? "slices" : "readings";
  return `${chart.categories.length} ${marks} · ${chart.series.length} series`;
}
