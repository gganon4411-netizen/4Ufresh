// app/api/agent/jobs/route.ts
// Agents poll this endpoint to get their accepted jobs and update status
// Auth: Bearer 4u_live_xxx (API key)

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function hashKey(key: string) {
  return crypto.createHash('sha256').update(key).digest('hex')
}

async function authenticateApiKey(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer 4u_live_')) return null

  const rawKey = authHeader.replace('Bearer ', '')
  const keyHash = hashKey(rawKey)

  const { data: keyRecord } = await supabaseAdmin
    .from('agent_api_keys')
    .select('id, agent_id')
    .eq('key_hash', keyHash)
    .single()

  if (!keyRecord) return null

  // Update last_used_at
  await supabaseAdmin
    .from('agent_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRecord.id)

  return keyRecord.agent_id
}

// GET /api/agent/jobs — fetch jobs for this agent
// ?status=pending,in_progress (comma-separated, default: all active)
export async function GET(req: NextRequest) {
  const agentId = await authenticateApiKey(req)
  if (!agentId) return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })

  const statusParam = req.nextUrl.searchParams.get('status')
  const statuses = statusParam
    ? statusParam.split(',')
    : ['pending', 'in_progress', 'review']

  const { data: jobs, error } = await supabaseAdmin
    .from('jobs')
    .select(`
      id,
      status,
      agent_notes,
      build_url,
      created_at,
      started_at,
      pitches (
        pitch_message,
        price_quote,
        estimated_delivery_time
      ),
      requests:request_id (
        id_uuid,
        title,
        description,
        category,
        budget,
        timeline
      ),
      profiles:human_id (
        id
      )
    `)
    .eq('agent_id', agentId)
    .in('status', statuses)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ jobs })
}

// PATCH /api/agent/jobs — update a job's status or add build_url/notes
// Body: { job_id, status?, build_url?, agent_notes? }
export async function PATCH(req: NextRequest) {
  const agentId = await authenticateApiKey(req)
  if (!agentId) return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })

  const body = await req.json()
  const { job_id, status, build_url, agent_notes } = body

  if (!job_id) return NextResponse.json({ error: 'Missing job_id' }, { status: 400 })

  const validStatuses = ['pending', 'in_progress', 'review', 'completed', 'cancelled']
  if (status && !validStatuses.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 })
  }

  // Verify job belongs to this agent
  const { data: job } = await supabaseAdmin
    .from('jobs')
    .select('id, status, agent_id')
    .eq('id', job_id)
    .eq('agent_id', agentId)
    .single()

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (status) updates.status = status
  if (build_url !== undefined) updates.build_url = build_url
  if (agent_notes !== undefined) updates.agent_notes = agent_notes
  if (status === 'in_progress' && !job.started_at) updates.started_at = new Date().toISOString()
  if (status === 'completed') updates.completed_at = new Date().toISOString()

  const { data: updated, error } = await supabaseAdmin
    .from('jobs')
    .update(updates)
    .eq('id', job_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log webhook event
  await supabaseAdmin.from('webhook_events').insert({
    job_id,
    agent_id: agentId,
    event_type: `job.${status || 'updated'}`,
    payload: updates,
  })

  return NextResponse.json({ job: updated })
}
