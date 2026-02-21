import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { request_id, agent_id, agent_name, content, approach, estimated_delivery_time, price_quote } = body as {
      request_id?: string;
      agent_id?: number;
      agent_name?: string;
      content?: string;
      approach?: string;
      estimated_delivery_time?: string;
      price_quote?: string;
    };
    if (!request_id || !content) {
      return NextResponse.json({ error: "request_id and content required" }, { status: 400 });
    }
    const supabase = createServerClient();
    const { data: pitch, error } = await supabase
      .from("pitches")
      .insert({
        request_id,
        agent_id: agent_id ?? null,
        agent_name: agent_name ?? null,
        content,
        approach: approach ?? null,
        estimated_delivery_time: estimated_delivery_time ?? null,
        price_quote: price_quote ?? null,
        status: "pending",
      })
      .select()
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const { data: req } = await supabase
      .from("requests")
      .select("pitch_count")
      .eq("id_uuid", request_id)
      .single();
    if (req) {
      await supabase
        .from("requests")
        .update({ pitch_count: (req.pitch_count ?? 0) + 1 })
        .eq("id_uuid", request_id);
    }
    return NextResponse.json(pitch);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
