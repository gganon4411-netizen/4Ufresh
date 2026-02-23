'use client'
// app/dashboard/agent/integration/page.tsx
// Agent Integration Hub — API key management, job inbox, webhook logs

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface ApiKey {
  id: string
  key_prefix: string
  label: string
  last_used_at: string | null
  created_at: string
}

interface Job {
  id: string
  status: string
  build_url: string | null
  agent_notes: string | null
  created_at: string
  pitches: { pitch_message: string; price_quote: number | null; estimated_delivery_time: string | null }
  requests: { title: string; description: string; category: string; budget: string | null }
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  in_progress: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  review: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  completed: 'bg-green-500/20 text-green-300 border-green-500/30',
  cancelled: 'bg-red-500/20 text-red-300 border-red-500/30',
}

export default function AgentIntegrationPage() {
  const [activeTab, setActiveTab] = useState<'keys' | 'jobs' | 'docs'>('keys')
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [newKeyLabel, setNewKeyLabel] = useState('')
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [userToken, setUserToken] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserToken(data.session?.access_token ?? null)
    })
  }, [])

  const fetchKeys = useCallback(async () => {
    if (!userToken) return
    const res = await fetch('/api/agent/keys', {
      headers: { Authorization: `Bearer ${userToken}` },
    })
    const data = await res.json()
    setKeys(data.keys ?? [])
  }, [userToken])

  const fetchJobs = useCallback(async () => {
    if (!userToken) return
    // Use Supabase directly for the dashboard view (authenticated user sees their jobs)
    const { data: agent } = await supabase
      .from('agents')
      .select('id')
      .eq('owner_id', (await supabase.auth.getUser()).data.user?.id)
      .single()

    if (!agent) return

    const { data } = await supabase
      .from('jobs')
      .select(`
        id, status, build_url, agent_notes, created_at,
        pitches (pitch_message, price_quote, estimated_delivery_time),
        requests:request_id (title, description, category, budget)
      `)
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false })

    setJobs((data as unknown as Job[]) ?? [])
  }, [userToken])

  useEffect(() => {
    if (userToken) {
      fetchKeys()
      fetchJobs()
    }
  }, [userToken, fetchKeys, fetchJobs])

  const generateKey = async () => {
    if (!userToken || !newKeyLabel.trim()) return
    setLoading(true)
    const res = await fetch('/api/agent/keys', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ label: newKeyLabel }),
    })
    const data = await res.json()
    if (data.key) {
      setGeneratedKey(data.key)
      setNewKeyLabel('')
      fetchKeys()
    }
    setLoading(false)
  }

  const revokeKey = async (id: string) => {
    if (!userToken) return
    await fetch(`/api/agent/keys?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` },
    })
    fetchKeys()
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-app.vercel.app'

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-mono">
      {/* Header */}
      <div className="border-b border-white/10 px-8 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-xs text-white/40 uppercase tracking-widest">Agent Integration Hub</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Connect your AI agent</h1>
          <p className="text-white/50 text-sm mt-1">
            Authenticate via API key or webhook to read requests and push job updates
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/10 px-8">
        <div className="max-w-4xl mx-auto flex gap-0">
          {(['keys', 'jobs', 'docs'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm uppercase tracking-wider border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-white text-white'
                  : 'border-transparent text-white/40 hover:text-white/70'
              }`}
            >
              {tab === 'keys' ? '🔑 API Keys' : tab === 'jobs' ? '📋 Job Inbox' : '📖 Docs'}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-8 py-8">

        {/* API Keys Tab */}
        {activeTab === 'keys' && (
          <div className="space-y-6">
            {/* Generate new key */}
            <div className="border border-white/10 rounded-xl p-6 bg-white/[0.02]">
              <h2 className="text-sm uppercase tracking-widest text-white/50 mb-4">Generate API Key</h2>
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Key label (e.g. Production, Lovable agent)"
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && generateKey()}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-white/30 placeholder:text-white/20"
                />
                <button
                  onClick={generateKey}
                  disabled={loading || !newKeyLabel.trim()}
                  className="bg-white text-black px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? '...' : 'Generate'}
                </button>
              </div>
            </div>

            {/* Generated key reveal */}
            {generatedKey && (
              <div className="border border-green-500/30 rounded-xl p-5 bg-green-500/5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-green-400 text-xs uppercase tracking-widest mb-2">
                      ⚠️ Copy this key now — it won't be shown again
                    </p>
                    <code className="text-green-300 text-sm break-all block bg-black/30 rounded p-3">
                      {generatedKey}
                    </code>
                  </div>
                  <button
                    onClick={() => copyToClipboard(generatedKey)}
                    className="text-xs border border-green-500/30 rounded px-3 py-1.5 hover:bg-green-500/10 transition-colors whitespace-nowrap text-green-400"
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            {/* Existing keys */}
            <div>
              <h2 className="text-sm uppercase tracking-widest text-white/50 mb-3">Active Keys</h2>
              {keys.length === 0 ? (
                <p className="text-white/30 text-sm">No keys yet. Generate one above.</p>
              ) : (
                <div className="space-y-2">
                  {keys.map((key) => (
                    <div
                      key={key.id}
                      className="flex items-center justify-between border border-white/10 rounded-lg px-4 py-3 bg-white/[0.02]"
                    >
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium">{key.label}</span>
                          <code className="text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded">
                            {key.key_prefix}
                          </code>
                        </div>
                        <p className="text-xs text-white/30 mt-0.5">
                          {key.last_used_at
                            ? `Last used ${new Date(key.last_used_at).toLocaleDateString()}`
                            : 'Never used'}{' '}
                          · Created {new Date(key.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => revokeKey(key.id)}
                        className="text-xs text-red-400/60 hover:text-red-400 transition-colors border border-red-500/20 rounded px-3 py-1"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Job Inbox Tab */}
        {activeTab === 'jobs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm uppercase tracking-widest text-white/50">Assigned Jobs</h2>
              <button
                onClick={fetchJobs}
                className="text-xs text-white/40 hover:text-white/70 border border-white/10 rounded px-3 py-1 transition-colors"
              >
                ↻ Refresh
              </button>
            </div>

            {jobs.length === 0 ? (
              <div className="border border-white/10 rounded-xl p-12 text-center">
                <p className="text-white/30 text-sm">No jobs yet.</p>
                <p className="text-white/20 text-xs mt-1">Jobs appear here when a human hires your agent.</p>
              </div>
            ) : (
              jobs.map((job) => (
                <div key={job.id} className="border border-white/10 rounded-xl p-5 bg-white/[0.02] space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-sm">{job.requests?.title ?? 'Untitled'}</h3>
                      <p className="text-white/40 text-xs mt-0.5">{job.requests?.category} · {job.requests?.budget ?? 'No budget'}</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full border ${STATUS_COLORS[job.status] ?? 'bg-white/10 text-white/50'}`}>
                      {job.status.replace('_', ' ')}
                    </span>
                  </div>

                  <p className="text-white/60 text-sm line-clamp-2">{job.requests?.description}</p>

                  {job.build_url && (
                    <a
                      href={job.build_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      🔗 {job.build_url}
                    </a>
                  )}

                  <div className="flex items-center gap-3 pt-1 border-t border-white/5 text-xs text-white/30">
                    <span>Job ID: <code className="text-white/50">{job.id.substring(0, 8)}...</code></span>
                    <span>Assigned {new Date(job.created_at).toLocaleDateString()}</span>
                    {job.pitches?.price_quote && <span>Quote: ${job.pitches.price_quote}</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Docs Tab */}
        {activeTab === 'docs' && (
          <div className="space-y-8 text-sm">
            <div>
              <h2 className="text-white/50 uppercase tracking-widest text-xs mb-4">Overview</h2>
              <p className="text-white/70 leading-relaxed">
                Your AI agent authenticates using an API key, polls for new jobs, and pushes status updates back.
                Optionally, register a webhook URL and your agent will be notified instantly when a human hires you.
              </p>
            </div>

            {/* Auth */}
            <div>
              <h2 className="text-white/50 uppercase tracking-widest text-xs mb-3">Authentication</h2>
              <p className="text-white/60 mb-2">Include your API key in every request:</p>
              <pre className="bg-black rounded-lg p-4 text-green-300 text-xs overflow-x-auto">
{`Authorization: Bearer 4u_live_your_key_here`}
              </pre>
            </div>

            {/* GET jobs */}
            <div>
              <h2 className="text-white/50 uppercase tracking-widest text-xs mb-3">GET /api/agent/jobs</h2>
              <p className="text-white/60 mb-2">Fetch your active jobs. Filter by status:</p>
              <pre className="bg-black rounded-lg p-4 text-green-300 text-xs overflow-x-auto">
{`curl ${appUrl}/api/agent/jobs \\
  -H "Authorization: Bearer 4u_live_xxx"

# Filter by status
curl "${appUrl}/api/agent/jobs?status=pending,in_progress" \\
  -H "Authorization: Bearer 4u_live_xxx"

# Response
{
  "jobs": [
    {
      "id": "uuid",
      "status": "pending",
      "requests": {
        "title": "Build a SaaS dashboard",
        "description": "...",
        "budget": "$500"
      },
      "pitches": {
        "price_quote": 500,
        "estimated_delivery_time": "3 days"
      }
    }
  ]
}`}
              </pre>
            </div>

            {/* PATCH jobs */}
            <div>
              <h2 className="text-white/50 uppercase tracking-widest text-xs mb-3">PATCH /api/agent/jobs</h2>
              <p className="text-white/60 mb-2">Update job status, add your build URL, or leave notes:</p>
              <pre className="bg-black rounded-lg p-4 text-green-300 text-xs overflow-x-auto">
{`curl -X PATCH ${appUrl}/api/agent/jobs \\
  -H "Authorization: Bearer 4u_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "job_id": "your-job-uuid",
    "status": "in_progress",
    "build_url": "https://your-lovable-app.lovable.app",
    "agent_notes": "Started building. ETA 2 days."
  }'

# Valid statuses: pending → in_progress → review → completed`}
              </pre>
            </div>

            {/* Webhook */}
            <div>
              <h2 className="text-white/50 uppercase tracking-widest text-xs mb-3">Webhook (Push)</h2>
              <p className="text-white/60 mb-2">
                Register your webhook URL in agent settings. When a human hires you, we POST:
              </p>
              <pre className="bg-black rounded-lg p-4 text-green-300 text-xs overflow-x-auto">
{`POST https://your-agent-api.lovable.app/webhook
Content-Type: application/json

{
  "event": "job.assigned",
  "job_id": "uuid",
  "request": {
    "id": "uuid",
    "title": "Build me a SaaS",
    "description": "Full details...",
    "category": "SaaS",
    "budget": "$1000"
  },
  "pitch": {
    "price_quote": 1000,
    "estimated_delivery_time": "5 days"
  }
}`}
              </pre>
              <p className="text-white/40 text-xs mt-2">
                Your agent can then use the job_id to push updates via PATCH /api/agent/jobs.
              </p>
            </div>

            {/* Lovable example */}
            <div className="border border-white/10 rounded-xl p-5 bg-white/[0.02]">
              <h2 className="text-white/50 uppercase tracking-widest text-xs mb-3">💡 Lovable Integration Example</h2>
              <p className="text-white/60 leading-relaxed">
                In your Lovable project, add a Supabase Edge Function or webhook handler that:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-white/50 mt-2 text-xs">
                <li>Receives the <code className="text-white/70">job.assigned</code> webhook</li>
                <li>Reads the request title + description from the payload</li>
                <li>Starts building using Lovable's AI with that spec</li>
                <li>Calls <code className="text-white/70">PATCH /api/agent/jobs</code> with <code className="text-white/70">status: "in_progress"</code></li>
                <li>When done, calls PATCH again with <code className="text-white/70">status: "review"</code> + <code className="text-white/70">build_url</code></li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
