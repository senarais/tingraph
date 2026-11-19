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
  if (figure.kind === "prisma") {
    const exclusions = figure.steps.filter((step) => step.side).length;
    return `${figure.steps.length} rows · ${exclusions} exclusion boxes`;
  }
  if (figure.kind === "gantt") {
    const milestones = figure.tasks.filter((task) => task.length === 0).length;
    return `${figure.tasks.length - milestones} tasks · ${milestones} milestones`;
  }
  if (figure.kind === "quadrant") {
    const named = Object.values(figure.quarters).filter(Boolean).length;
    return `${named} quarters · ${figure.items.length} items`;
  }
  if (figure.kind === "timeline") {
    return `${figure.events.length} events`;
  }
  if (figure.kind === "sankey") {
    return `${figure.nodes.length} nodes · ${figure.flows.length} flows`;
  }
  const chart = figure;
  if (chart.kind === "scatter") {
    const points = chart.series.reduce(
      (sum, series) => sum + (series.points?.length ?? 0),
      0,
    );
    return `${points} points · ${chart.series.length} series`;
  }
  if (chart.kind === "histogram") {
    return `${chart.categories.length} bins`;
  }
  if (chart.kind === "waterfall" || chart.kind === "funnel") {
    return `${chart.categories.length} ${chart.kind === "funnel" ? "stages" : "steps"}`;
  }
  const marks = chart.kind === "pie" ? "slices" : chart.kind === "radar" ? "spokes" : "readings";
  return `${chart.categories.length} ${marks} · ${chart.series.length} series`;
}
