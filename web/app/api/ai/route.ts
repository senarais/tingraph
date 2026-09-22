/**
 * Compatibility route for tabs and clients that still post to `/api/ai`.
 * New code calls `/api/v1/ai` directly; this file can be removed after that
 * transition has shipped without moving application logic back into Next.
 */
export async function POST(request: Request) {
  const backend = process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8080";
  const headers = new Headers();
  for (const name of ["content-type", "cookie", "origin", "x-csrf-token", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("x-csrf-token") && headers.has("cookie")) {
    const session = await fetch(`${backend}/api/v1/auth/session`, {
      headers: { Cookie: headers.get("cookie") as string },
      cache: "no-store",
    });
    const body = session.ok ? ((await session.json()) as { csrf_token?: string }) : null;
    if (body?.csrf_token) headers.set("x-csrf-token", body.csrf_token);
  }
  const response = await fetch(`${backend}/api/v1/ai`, {
    method: "POST",
    headers,
    body: await request.arrayBuffer(),
    cache: "no-store",
  });
  return new Response(response.body, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("content-type") || "application/json" },
  });
}
