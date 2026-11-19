export type PlanTier = "free" | "premium";
export interface Entitlements {
  tier: PlanTier;
  premium_until?: string | null;
  diagram_count: number;
  diagram_limit: number;
  generation_used: number;
  generation_limit: number | null;
  ai_tokens_used: number;
  ai_token_limit: number;
}

export const PLAN_LIMITS = {
  free: { diagrams: 2, generations: 10, aiTokens: 2_000 },
  premium: { diagrams: 100, generations: null, aiTokens: 100_000 },
} as const;

export function isPlanTier(value: string): value is PlanTier {
  return value === "free" || value === "premium";
}

export function planName(tier: PlanTier): string {
  return tier === "premium" ? "Premium" : "Free";
}

export type ExportFormat = "png" | "jpg" | "svg" | "pdf";

/**
 * What each plan may export. Free gets the everyday rasters a slide or a
 * report takes; what a paper or LaTeX asks for — vector SVG, PDF, print
 * resolution and a transparent background — is Premium. A guest exports as
 * Free. Exporting happens in the browser, so this is the editor's rule, not a
 * server's; the marketing pages describe exactly this table.
 */
export const EXPORT_RULES: Record<
  PlanTier,
  { formats: readonly ExportFormat[]; maxScale: number; transparent: boolean }
> = {
  free: { formats: ["png", "jpg"], maxScale: 2, transparent: false },
  premium: { formats: ["png", "jpg", "svg", "pdf"], maxScale: 12, transparent: true },
};

/** Why this export is not open to the plan, in a sentence; null when it is. */
export function exportLock(
  tier: PlanTier,
  choice: { format?: ExportFormat; scale?: number; transparent?: boolean },
): string | null {
  const rules = EXPORT_RULES[tier];
  if (choice.format !== undefined && !rules.formats.includes(choice.format)) {
    return `${choice.format.toUpperCase()} export is part of Premium. Free exports PNG and JPG.`;
  }
  if (choice.scale !== undefined && choice.scale > rules.maxScale + 1e-9) {
    return `Exports above ${rules.maxScale}x are part of Premium.`;
  }
  if (choice.transparent && !rules.transparent) {
    return "A transparent background is part of Premium. Free exports on white.";
  }
  return null;
}
