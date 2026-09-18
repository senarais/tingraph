import type { Database } from "@/lib/supabase/database.types";

export type PlanTier = "free" | "premium";
export type Entitlements = Omit<
  Database["public"]["Functions"]["get_my_entitlements"]["Returns"][number],
  "tier"
> & { tier: PlanTier };

export const PLAN_LIMITS = {
  free: { diagrams: 2, generations: 10, aiTokens: 3_000 },
  premium: { diagrams: 100, generations: null, aiTokens: 100_000 },
} as const;

export function isPlanTier(value: string): value is PlanTier {
  return value === "free" || value === "premium";
}

export function planName(tier: PlanTier): string {
  return tier === "premium" ? "Premium" : "Free";
}
