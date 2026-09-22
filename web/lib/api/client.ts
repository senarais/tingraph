import type { SessionResponse } from "@/lib/api/types";

let cached: SessionResponse | null = null;
let pending: Promise<SessionResponse> | null = null;
let generation = 0;
const SYNC_KEY = "tingraph:session";

function invalidate(announce: boolean, broadcast: boolean): void {
  generation += 1;
  cached = null;
  pending = null;
  if (typeof window === "undefined") return;
  if (announce) window.dispatchEvent(new Event(SYNC_KEY));
  if (broadcast) {
    try {
      localStorage.setItem(SYNC_KEY, String(Date.now()));
    } catch {
      // Session invalidation still works in this tab when storage is disabled.
    }
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === SYNC_KEY) invalidate(true, false);
  });
  window.addEventListener("focus", () => invalidate(true, false));
}

export async function getSession(force = false): Promise<SessionResponse> {
  if (force) invalidate(false, false);
  if (!force && cached) {
    return cached;
  }
  if (!force && pending) {
    return pending;
  }
  const requestGeneration = generation;
  const request = fetch("/api/v1/auth/session", {
    credentials: "same-origin",
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error("Your session could not be checked.");
      }
      const session = (await response.json()) as SessionResponse;
      if (requestGeneration === generation) cached = session;
      return session;
    })
    .finally(() => {
      if (pending === request) pending = null;
    });
  pending = request;
  return request;
}

export function clearSessionCache(): void {
  invalidate(true, true);
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== "GET" && method !== "HEAD") {
    const session = await getSession();
    if (!session.user || !session.csrf_token) {
      throw new APIError(401, "Sign in required.");
    }
    headers.set("X-CSRF-Token", session.csrf_token);
  }
  const response = await fetch(path, {
    ...init,
    method,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) {
    clearSessionCache();
  }
  return response;
}

export async function publicJSON<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    throw await APIError.from(response);
  }
  clearSessionCache();
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export class APIError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }

  static async from(response: Response): Promise<APIError> {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    return new APIError(response.status, body?.error || `Request failed (${response.status}).`);
  }
}
