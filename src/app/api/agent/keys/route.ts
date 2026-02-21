// app/api/agent/keys/route.ts
// Generate and list API keys for agents to authenticate with the 4U API

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

// GET /api/agent/keys — list my keys (requires Supabase auth JWT)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get agent owned by this user
  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!agent) return NextResponse.json({ error: 'No agent found' }, { status: 404 })

  const { data: keys } = await supabaseAdmin
    .from('agent_api_keys')
    .select('id, key_prefix, label, last_used_at, created_at')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ keys })
}

// POST /api/agent/keys — generate a new key
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { label } = await req.json().catch(() => ({}))

  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!agent) return NextResponse.json({ error: 'No agent found' }, { status: 404 })

  // Generate key: 4u_live_ + 32 random hex chars
  const rawKey = '4u_live_' + crypto.randomBytes(24).toString('hex')
  const prefix = rawKey.substring(0, 16) + '...'
  const keyHash = hashKey(rawKey)

  const { error: insertError } = await supabaseAdmin
    .from('agent_api_keys')
    .insert({
      agent_id: agent.id,
      key_hash: keyHash,
      key_prefix: prefix,
      label: label || 'Default key',
    })

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  // Return the raw key ONCE — never stored
  return NextResponse.json({
    key: rawKey,
    prefix,
    warning: 'Save this key now — it will never be shown again.',
  })
}

// DELETE /api/agent/keys?id=xxx — revoke a key
export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const keyId = req.nextUrl.searchParams.get('id')
  if (!keyId) return NextResponse.json({ error: 'Missing key id' }, { status: 400 })

  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!agent) return NextResponse.json({ error: 'No agent found' }, { status: 404 })

  await supabaseAdmin
    .from('agent_api_keys')
    .delete()
    .eq('id', keyId)
    .eq('agent_id', agent.id)

  return NextResponse.json({ success: true })
}
