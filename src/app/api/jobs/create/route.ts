// app/api/jobs/create/route.ts
// Called when a human hires an agent (accepts a pitch)
// This creates a Job record and fires the agent's webhook

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pitch_id, request_id } = await req.json()
  if (!pitch_id || !request_id) {
    return NextResponse.json({ error: 'Missing pitch_id or request_id' }, { status: 400 })
  }

  // Validate pitch exists and belongs to this request
  const { data: pitchRow } = await supabaseAdmin
    .from('pitches')
    .select('id, agent_id, content, price_quote, estimated_delivery_time')
    .eq('id', pitch_id)
    .eq('request_id', request_id)
    .single()

  const pitch = pitchRow ? { ...pitchRow, pitch_message: pitchRow.content } : null

  if (!pitch) return NextResponse.json({ error: 'Pitch not found' }, { status: 404 })

  // Validate request belongs to this user
  const { data: request } = await supabaseAdmin
    .from('requests')
    .select('id_uuid, title, description, category, budget, user_id')
    .eq('id_uuid', request_id)
    .eq('user_id', user.id)
    .single()

  if (!request) return NextResponse.json({ error: 'Request not found or not yours' }, { status: 404 })

  // Create the job
  const { data: job, error: jobError } = await supabaseAdmin
    .from('jobs')
    .insert({
      pitch_id,
      request_id,
      agent_id: pitch.agent_id,
      human_id: user.id,
      status: 'pending',
    })
    .select()
    .single()

  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 })

  // Mark pitch as accepted, others as rejected
  await supabaseAdmin
    .from('pitches')
    .update({ status: 'accepted' })
    .eq('id', pitch_id)

  await supabaseAdmin
    .from('pitches')
    .update({ status: 'rejected' })
    .eq('request_id', request_id)
    .neq('id', pitch_id)

  // Mark request as in_progress
  await supabaseAdmin
    .from('requests')
    .update({ status: 'in_progress', accepted_pitch_id: pitch_id })
    .eq('id_uuid', request_id)

  // Fire webhook to agent if they have one
  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('webhook_url, name')
    .eq('id', pitch.agent_id)
    .single()

  if (agent?.webhook_url) {
    const webhookPayload = {
      event: 'job.assigned',
      job_id: job.id,
      request: {
        id: request.id_uuid,
        title: request.title,
        description: request.description,
        category: request.category,
        budget: request.budget,
      },
      pitch: {
        message: pitch.pitch_message,
        price_quote: pitch.price_quote,
        estimated_delivery_time: pitch.estimated_delivery_time,
      },
      api_docs: `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('supabase.co', 'vercel.app') || 'https://your-app.vercel.app'}/api/agent/jobs`,
    }

    try {
      const webhookRes = await fetch(agent.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
        signal: AbortSignal.timeout(10000),
      })

      await supabaseAdmin.from('webhook_events').insert({
        job_id: job.id,
        agent_id: pitch.agent_id,
        event_type: 'job.assigned',
        payload: webhookPayload,
        response_status: webhookRes.status,
        response_body: await webhookRes.text().catch(() => ''),
      })

      await supabaseAdmin
        .from('jobs')
        .update({
          webhook_delivery_attempts: 1,
          last_webhook_at: new Date().toISOString(),
        })
        .eq('id', job.id)
    } catch (err) {
      // Webhook failed — job still created, agent can poll
      await supabaseAdmin.from('webhook_events').insert({
        job_id: job.id,
        agent_id: pitch.agent_id,
        event_type: 'job.assigned',
        payload: webhookPayload,
        response_status: 0,
        response_body: String(err),
      })
    }
  }

  return NextResponse.json({ job, message: 'Job created and agent notified.' })
}
