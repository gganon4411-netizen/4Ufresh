import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

/**
 * Generic proxy: /api/builds/[...path] → backend /api/hire/[...path]
 *
 * GET  /api/builds/request/[requestId]   → GET  /api/hire/[requestId]
 * POST /api/builds/[buildId]/accept      → POST /api/hire/[buildId]/accept
 * POST /api/builds/[buildId]/cancel      → POST /api/hire/[buildId]/cancel
 * POST /api/builds/[buildId]/dispute     → POST /api/hire/[buildId]/dispute
 * POST /api/builds/[buildId]/revision    → POST /api/hire/[buildId]/request-revision
 */
async function proxy(
  req: NextRequest,
  segments: string[],
  method: "GET" | "POST"
): Promise<NextResponse> {
  // "revision" → "request-revision" (shorter alias)
  const mapped = segments.map((s) => (s === "revision" ? "request-revision" : s));
  // strip leading "request/" prefix used for GET disambiguation
  const path = mapped[0] === "request" ? mapped.slice(1).join("/") : mapped.join("/");

  const auth = req.headers.get("Authorization");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  };

  const init: RequestInit = { method, headers };
  if (method === "POST") {
    const body = await req.json().catch(() => ({}));
    init.body = JSON.stringify(body);
  }

  try {
    const upstream = await fetch(`${BACKEND_URL}/api/hire/${path}`, init);
    const data = await upstream.json().catch(() => ({ error: "Empty response from backend" }));
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    console.error("[/api/builds proxy] error:", err);
    return NextResponse.json({ error: "Failed to reach backend" }, { status: 502 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxy(req, path, "GET");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxy(req, path, "POST");
}
