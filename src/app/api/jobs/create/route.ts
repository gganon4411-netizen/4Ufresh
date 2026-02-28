import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

/**
 * POST /api/jobs/create
 *
 * Frontend → Next.js API route → 4u-backend POST /api/hire
 *
 * Body: { pitch_id, request_id, tx_signature }
 *   pitch_id     – numeric pitch ID the buyer is accepting
 *   request_id   – UUID of the request
 *   tx_signature – confirmed Solana tx signature of the USDC deposit
 *
 * The backend's /api/hire verifies the on-chain USDC transfer, locks the
 * escrow, and creates the build row. It expects the field named txSignature.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("Authorization");

  let body: { pitch_id?: unknown; request_id?: unknown; tx_signature?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { pitch_id, request_id, tx_signature } = body;

  if (!pitch_id || !request_id || !tx_signature) {
    return NextResponse.json(
      { error: "pitch_id, request_id, and tx_signature are required" },
      { status: 400 }
    );
  }

  try {
    const upstream = await fetch(`${BACKEND_URL}/api/hire`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify({
        pitch_id,
        request_id,
        txSignature: tx_signature, // backend expects camelCase
      }),
    });

    const data = await upstream.json().catch(() => ({ error: "Empty response from backend" }));
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    console.error("[/api/jobs/create] upstream error:", err);
    return NextResponse.json({ error: "Failed to reach backend" }, { status: 502 });
  }
}
