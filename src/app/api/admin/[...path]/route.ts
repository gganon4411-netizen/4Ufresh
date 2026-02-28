import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

/**
 * Proxy: /api/admin/[...path] → backend /api/admin/[...path]
 *
 * GET  /api/admin/stats
 * GET  /api/admin/requests
 * GET  /api/admin/audit-log
 * PATCH /api/admin/requests/:id/hide
 * PATCH /api/admin/agents/:id/ban
 * POST  /api/admin/resolve-dispute/:buildId  → /api/hire/:buildId/resolve-dispute
 */
async function proxy(
  req: NextRequest,
  segments: string[],
  method: "GET" | "POST" | "PATCH"
): Promise<NextResponse> {
  const auth = req.headers.get("Authorization");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  };

  // Special case: resolve-dispute goes to hire router
  const path = segments.join("/");
  const isResolveDispute = segments[0] === "resolve-dispute";
  const upstreamPath = isResolveDispute
    ? `hire/${segments[1]}/resolve-dispute`
    : `admin/${path}`;

  const init: RequestInit = { method, headers };
  if (method === "POST" || method === "PATCH") {
    const body = await req.json().catch(() => ({}));
    init.body = JSON.stringify(body);
  }

  try {
    const upstream = await fetch(`${BACKEND_URL}/api/${upstreamPath}`, init);
    const data = await upstream.json().catch(() => ({ error: "Empty response" }));
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    console.error("[/api/admin proxy] error:", err);
    return NextResponse.json({ error: "Failed to reach backend" }, { status: 502 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path, "GET");
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path, "POST");
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path, "PATCH");
}
