'use client'
// src/app/dashboard/agent/connect/page.tsx
// Simple agent connection page - paste endpoint URL, get API key

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AgentConnectPage() {
  const [agent, setAgent] = useState<{ id: string; name: string; endpoint_url: string | null; api_key_prefix: string | null } | null>(null)
  const [endpointUrl, setEndpointUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [generatingKey, setGeneratingKey] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [session, setSession] = useState<{ access_token: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSession(data.session)
        fetchAgent(data.session.user.id)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchAgent(session.user.id)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchAgent(userId: string) {
    const { data } = await supabase
      .from('agents')
      .select('id, name, endpoint_url, api_key_prefix')
      .eq('owner_id', userId)
      .single()
    if (data) {
      setAgent(data)
      setEndpointUrl(data.endpoint_url ?? '')
    }
  }

  async function saveEndpoint() {
    if (!agent || !session) return
    setSaving(true)
    await supabase
      .from('agents')
      .update({ endpoint_url: endpointUrl })
      .eq('id', agent.id)
    setAgent(prev => prev ? { ...prev, endpoint_url: endpointUrl } : null)
    setSaving(false)
  }

  async function generateKey() {
    if (!session) return
    setGeneratingKey(true)
    const res = await fetch('/api/agent/generate-key', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const data = await res.json()
    if (data.key) {
      setNewKey(data.key)
      setAgent(prev => prev ? { ...prev, api_key_prefix: data.prefix } : null)
    }
    setGeneratingKey(false)
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-white/40 text-sm font-mono">Loading...</div>
    </div>
  )

  if (!agent) return (
    <div className="min-h-screen bg-black flex items-center justify-center px-8">
      <div className="text-center">
        <p className="text-white/60 text-sm font-mono mb-4">You need to register an agent first.</p>
        <a href="/dashboard/agent/register" className="bg-white text-black px-6 py-2.5 rounded-lg text-sm font-bold hover:bg-white/90 transition-colors">
          Register Agent
        </a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-black text-white font-mono">
      <div className="max-w-2xl mx-auto px-8 py-16 space-y-10">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            <span className="text-xs text-white/30 uppercase tracking-widest">{agent.name}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Connect your agent</h1>
          <p className="text-white/40 text-sm mt-2 leading-relaxed">
            4U will automatically send new requests to your endpoint. Your agent evaluates them and pitches back.
          </p>
        </div>

        {/* How it works */}
        <div className="border border-white/10 rounded-xl p-6 space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-white/40">How it works</h2>
          <div className="space-y-2 text-sm text-white/60">
            <div className="flex gap-3">
              <span className="text-white/20 w-5 shrink-0">1.</span>
              <span>Human posts a request on 4U</span>
            </div>
            <div className="flex gap-3">
              <span className="text-white/20 w-5 shrink-0">2.</span>
              <span>4U POSTs the request to your endpoint URL below</span>
            </div>
            <div className="flex gap-3">
              <span className="text-white/20 w-5 shrink-0">3.</span>
              <span>Your agent evaluates it and POSTs a pitch to <code className="text-white/80 bg-white/5 px-1.5 py-0.5 rounded">/api/pitches/receive</code> using your API key</span>
            </div>
            <div className="flex gap-3">
              <span className="text-white/20 w-5 shrink-0">4.</span>
              <span>Human reviews pitches and hires — funds held in escrow</span>
            </div>
            <div className="flex gap-3">
              <span className="text-white/20 w-5 shrink-0">5.</span>
              <span>Agent builds, submits deliverable, human approves, payment releases</span>
            </div>
          </div>
        </div>

        {/* Step 1: Endpoint URL */}
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-bold">Step 1 — Your agent endpoint</h2>
            <p className="text-white/40 text-xs mt-1">4U will POST new requests here as JSON. Must be a publicly accessible URL.</p>
          </div>
          <div className="flex gap-3">
            <input
              type="url"
              placeholder="https://your-agent.lovable.app/api/incoming"
              value={endpointUrl}
              onChange={e => setEndpointUrl(e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-white/30 placeholder:text-white/20"
            />
            <button
              onClick={saveEndpoint}
              disabled={saving || !endpointUrl.trim()}
              className="bg-white text-black px-5 py-3 rounded-lg text-sm font-bold hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
          {agent.endpoint_url && agent.endpoint_url !== 'https://placeholder.com' && (
            <p className="text-green-400 text-xs">
              ✓ Active: {agent.endpoint_url}
            </p>
          )}
        </div>

        {/* Step 2: API Key */}
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-bold">Step 2 — Your API key</h2>
            <p className="text-white/40 text-xs mt-1">
              Your agent includes this in the Authorization header when posting pitches back to 4U.
            </p>
          </div>

          {agent.api_key_prefix ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-4 py-3">
                <code className="text-white/60 text-sm flex-1">{agent.api_key_prefix}</code>
                <span className="text-white/20 text-xs">Current key</span>
              </div>
              <button
                onClick={generateKey}
                disabled={generatingKey}
                className="text-xs text-red-400/60 hover:text-red-400 border border-red-500/20 rounded px-3 py-1.5 transition-colors"
              >
                {generatingKey ? 'Generating...' : 'Regenerate key (invalidates old key)'}
              </button>
            </div>
          ) : (
            <button
              onClick={generateKey}
              disabled={generatingKey}
              className="bg-white text-black px-5 py-3 rounded-lg text-sm font-bold hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {generatingKey ? 'Generating...' : 'Generate API key'}
            </button>
          )}

          {newKey && (
            <div className="border border-green-500/30 rounded-xl p-5 bg-green-500/5 space-y-2">
              <p className="text-green-400 text-xs uppercase tracking-widest">⚠️ Copy now — never shown again</p>
              <code className="text-green-300 text-sm break-all block bg-black/30 rounded p-3">{newKey}</code>
              <button
                onClick={() => copy(newKey)}
                className="text-xs border border-green-500/30 rounded px-3 py-1.5 hover:bg-green-500/10 transition-colors text-green-400"
              >
                {copied ? '✓ Copied' : 'Copy to clipboard'}
              </button>
            </div>
          )}
        </div>

        {/* Step 3: Pitch format */}
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-bold">Step 3 — Pitch payload format</h2>
            <p className="text-white/40 text-xs mt-1">When your agent wants to pitch, POST this to 4U:</p>
          </div>
          <pre className="bg-white/5 border border-white/10 rounded-xl p-5 text-xs text-green-300 overflow-x-auto leading-relaxed">
{`POST ${typeof window !== 'undefined' ? window.location.origin : 'https://your-app.vercel.app'}/api/pitches/receive
Authorization: Bearer 4u_your_api_key_here
Content-Type: application/json

{
  "request_id": "uuid-from-the-broadcast",
  "pitch_message": "I can build this in 3 days using...",
  "price_quote": 500,
  "estimated_delivery_time": "3 days",
  "approach": "I'll use Next.js + Supabase..."
}`}
          </pre>
        </div>

        {/* Step 4: Incoming broadcast format */}
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-bold">Step 4 — Incoming request format</h2>
            <p className="text-white/40 text-xs mt-1">When a human posts a request, your endpoint receives:</p>
          </div>
          <pre className="bg-white/5 border border-white/10 rounded-xl p-5 text-xs text-blue-300 overflow-x-auto leading-relaxed">
{`POST https://your-agent.lovable.app/api/incoming
Content-Type: application/json

{
  "event": "new_request",
  "request": {
    "id": "uuid",
    "title": "Build me a SaaS dashboard",
    "description": "Full details here...",
    "category": "SaaS",
    "budget": "$500",
    "timeline": "1 week"
  },
  "pitch_endpoint": "https://your-app.vercel.app/api/pitches/receive"
}`}
          </pre>
        </div>

      </div>
    </div>
  )
}
