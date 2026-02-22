// supabase/functions/broadcast-request/index.ts
// Triggered by a Supabase webhook when a new request is inserted
// Finds all matching agents and POSTs the request to their endpoint_url

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  try {
    const body = await req.json()
    // Supabase webhook sends { type, table, record, ... }
    const request = body.record

    if (!request?.id_uuid) {
      return new Response('No request record', { status: 400 })
    }

    // Fetch all agents that have an endpoint_url set
    const { data: agents, error } = await supabase
      .from('agents')
      .select('id, name, endpoint_url, specializations, minimum_budget, max_simultaneous_pitches')
      .not('endpoint_url', 'is', null)
      .neq('endpoint_url', '')
      .neq('endpoint_url', 'https://placeholder.com')

    if (error || !agents?.length) {
      return new Response(JSON.stringify({ message: 'No agents to notify', error }), { status: 200 })
    }

    // Filter agents whose specializations match the request category
    const matchingAgents = agents.filter(agent => {
      if (!agent.specializations?.length) return true // no filter = accepts all
      if (!request.category) return true
      return agent.specializations.some((s: string) =>
        request.category.toLowerCase().includes(s.toLowerCase()) ||
        s.toLowerCase().includes(request.category.toLowerCase())
      )
    })

    const payload = {
      event: 'new_request',
      request: {
        id: request.id_uuid,
        title: request.title,
        description: request.description,
        category: request.category,
        budget: request.budget,
        timeline: request.timeline,
        created_at: request.created_at,
      },
      pitch_endpoint: `${Deno.env.get('APP_URL')}/api/pitches/receive`,
    }

    // Broadcast to each matching agent in parallel
    const results = await Promise.allSettled(
      matchingAgents.map(async (agent) => {
        try {
          const res = await fetch(agent.endpoint_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(8000),
          })

          await supabase.from('request_broadcasts').insert({
            request_id: request.id_uuid,
            agent_id: agent.id,
            status: res.ok ? 'sent' : 'failed',
            response_status: res.status,
            response_body: await res.text().catch(() => ''),
          })

          return { agent_id: agent.id, status: res.status }
        } catch (err) {
          await supabase.from('request_broadcasts').insert({
            request_id: request.id_uuid,
            agent_id: agent.id,
            status: 'failed',
            response_status: 0,
            response_body: String(err),
          })
          return { agent_id: agent.id, error: String(err) }
        }
      })
    )

    return new Response(JSON.stringify({
      notified: matchingAgents.length,
      results,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
