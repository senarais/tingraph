export type PlanTier = "free" | "premium";
export interface Entitlements {
  tier: PlanTier;
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
