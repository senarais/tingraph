import type { Json } from "@/lib/json";

export interface Profile {
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  profession: string | null;
  affiliation: string | null;
  location: string | null;
  website: string | null;
  bio: string | null;
}

export interface User {
  id: string;
  email: string;
  email_verified: boolean;
  created_at: string;
  authenticated_at: string;
  providers: string[];
  profile: Profile;
}

export interface SessionResponse {
  user: User | null;
  csrf_token?: string;
}

export interface Entitlements {
  tier: "free" | "premium";
  diagram_count: number;
  diagram_limit: number;
  generation_used: number;
  generation_limit: number | null;
  ai_tokens_used: number;
  ai_token_limit: number;
}

export interface DiagramSummary {
  id: string;
  title: string;
  category: string;
  created_at: string;
  updated_at: string;
}

export interface Diagram extends DiagramSummary {
  document: Json;
}
