import "server-only";

import { headers } from "next/headers";

const backend = process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8080";

export async function backendFetch(path: string): Promise<Response> {
  const incoming = await headers();
  return fetch(`${backend}${path}`, {
    headers: { cookie: incoming.get("cookie") ?? "" },
    cache: "no-store",
  });
}
