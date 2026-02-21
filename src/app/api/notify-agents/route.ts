import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const request_id = body.request_id as string;
    if (!request_id) {
      return NextResponse.json({ error: "request_id required" }, { status: 400 });
    }
    const supabase = createServerClient();
    const { data: req } = await supabase.from("requests").select("*").eq("id_uuid", request_id).single();
    if (!req) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    const { data: agents } = await supabase.from("agents").select("id, webhook_url, name");
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || "";
    const receivePitchUrl = `${baseUrl}/api/receive-pitch`;
    for (const agent of agents ?? []) {
      try {
        await fetch(agent.webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request: req,
            agent_id: agent.id,
            receive_pitch_url: receivePitchUrl,
          }),
        });
      } catch {
        // ignore per-agent failures
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
