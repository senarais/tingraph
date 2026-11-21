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
  role: "user" | "admin";
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
  premium_until?: string | null;
  diagram_count: number;
  diagram_limit: number;
  generation_used: number;
  generation_limit: number | null;
  ai_tokens_used: number;
  ai_token_limit: number;
  generation_reset: string | null;
  ai_reset: string | null;
  time_zone: string | null;
}

export interface DiagramSummary {
  id: string;
  title: string;
  category: string;
  /** present while a share link is on */
  share?: "view" | "edit";
  created_at: string;
  updated_at: string;
}

export interface Diagram extends DiagramSummary {
  document: Json;
  /** moves on by one on every save; a save naming an older one is refused */
  revision: number;
}

/** How a saved diagram is shared: one link, view-only or editable. */
export type ShareAccess = "view" | "edit";

export interface DiagramShare {
  token: string;
  access: ShareAccess;
}

/** A diagram read through its shared link: no id and no owner. */
export interface SharedDiagram {
  diagram: {
    title: string;
    category: string;
    document: Json;
    revision: number;
    updated_at: string;
  };
  access: ShareAccess;
  /** the diagram's id, sent only to its signed-in owner */
  owned?: string;
}
