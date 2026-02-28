"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/contexts/ProfileContext";
import { useRouter } from "next/navigation";

type Tab = "disputes" | "requests" | "audit";

interface DisputedBuild {
  id: string;
  request_id: string;
  request_title?: string;
  agent_name: string | null;
  escrow_amount: number | null;
  status: string;
  dispute_reason?: string | null;
  created_at: string;
}

interface AdminRequest {
  id: string;
  id_uuid: string;
  title: string;
  is_hidden?: boolean;
  created_at: string;
}

interface AuditEntry {
  id: string;
  action: string;
  target_type: string;
  target_id: string;
  reason: string | null;
  created_at: string;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, session, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();

  const [tab, setTab] = useState<Tab>("disputes");
  const [disputes, setDisputes] = useState<DisputedBuild[]>([]);
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [stats, setStats] = useState<Record<string, number> | null>(null);

  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authHeader = { Authorization: `Bearer ${session?.access_token ?? ""}` };

  // Redirect non-admins
  useEffect(() => {
    if (!authLoading && !profileLoading) {
      if (!user) { router.replace("/signin"); return; }
      // Admin check happens server-side; we just load and let backend reject
    }
  }, [user, authLoading, profileLoading, router]);

  // Load stats
  useEffect(() => {
    if (!session?.access_token) return;
    fetch("/api/admin/stats", { headers: authHeader })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setStats(d); })
      .catch(() => null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  // Load tab data
  useEffect(() => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        if (tab === "disputes") {
          // Query builds with disputed status via supabase through backend
          const res = await fetch("/api/admin/disputes", { headers: authHeader });
          if (res.status === 404) {
            // Endpoint doesn't exist yet — fall back to empty
            setDisputes([]);
          } else if (res.ok) {
            const d = await res.json();
            setDisputes(Array.isArray(d) ? d : []);
          } else {
            const d = await res.json();
            setError(d.error ?? "Failed to load disputes");
          }
        } else if (tab === "requests") {
          const res = await fetch("/api/admin/requests?limit=100", { headers: authHeader });
          if (res.ok) {
            const d = await res.json();
            setRequests(Array.isArray(d.requests) ? d.requests : []);
          }
        } else if (tab === "audit") {
          const res = await fetch("/api/admin/audit-log?limit=100", { headers: authHeader });
          if (res.ok) {
            const d = await res.json();
            setAuditLog(Array.isArray(d.entries) ? d.entries : []);
          }
        }
      } catch {
        setError("Failed to load data");
      } finally {
        setLoading(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, session?.access_token]);

  const resolveDispute = async (buildId: string, resolution: "accept" | "refund") => {
    setActionInProgress(buildId + resolution);
    setError(null);
    const res = await fetch(`/api/admin/resolve-dispute/${buildId}`, {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ resolution }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Action failed");
    } else {
      setDisputes((prev) => prev.filter((d) => d.id !== buildId));
    }
    setActionInProgress(null);
  };

  const hideRequest = async (id: string) => {
    setActionInProgress("req-" + id);
    const res = await fetch(`/api/admin/requests/${id}/hide`, {
      method: "PATCH",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Admin moderation" }),
    });
    if (res.ok) {
      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_hidden: true } : r))
      );
    }
    setActionInProgress(null);
  };

  if (authLoading || profileLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">⚙️ Admin Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">Platform moderation and dispute resolution</p>
      </header>

      {/* Stats */}
      {stats && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(stats).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4 text-center">
              <p className="text-2xl font-bold text-white">{v}</p>
              <p className="mt-1 text-xs text-zinc-500 capitalize">{k.replace(/_/g, " ")}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-zinc-800">
        {(["disputes", "requests", "audit"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "border-b-2 border-blue-500 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {t === "disputes" ? "⚠️ Disputes" : t === "requests" ? "📋 Requests" : "📜 Audit log"}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <>
          {/* ── Disputes tab ───────────────────────────────────────────────── */}
          {tab === "disputes" && (
            <section>
              {disputes.length === 0 ? (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-8 text-center text-sm text-zinc-500">
                  ✅ No open disputes
                </div>
              ) : (
                <div className="space-y-4">
                  {disputes.map((d) => (
                    <div
                      key={d.id}
                      className="rounded-xl border border-red-800 bg-red-900/10 p-5"
                    >
                      <div className="mb-3 flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold">{d.request_title ?? d.request_id}</p>
                          <p className="mt-0.5 text-sm text-zinc-400">Agent: {d.agent_name ?? "—"}</p>
                          {d.dispute_reason && (
                            <p className="mt-2 rounded bg-red-900/30 px-3 py-2 text-sm text-red-300">
                              <span className="font-medium">Reason: </span>{d.dispute_reason}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          {d.escrow_amount != null && (
                            <p className="text-lg font-bold text-amber-400">{d.escrow_amount} USDC</p>
                          )}
                          <p className="text-xs text-zinc-500">in escrow</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3 border-t border-red-900/40 pt-4">
                        <button
                          type="button"
                          onClick={() => resolveDispute(d.id, "accept")}
                          disabled={actionInProgress !== null}
                          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
                        >
                          {actionInProgress === d.id + "accept" ? "Processing…" : "✅ Release to Agent (98/2)"}
                        </button>
                        <button
                          type="button"
                          onClick={() => resolveDispute(d.id, "refund")}
                          disabled={actionInProgress !== null}
                          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                        >
                          {actionInProgress === d.id + "refund" ? "Processing…" : "↩️ Refund Buyer"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── Requests tab ───────────────────────────────────────────────── */}
          {tab === "requests" && (
            <section>
              {requests.length === 0 ? (
                <p className="text-sm text-zinc-500">No requests found.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-zinc-700">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-900 text-left text-xs text-zinc-400">
                      <tr>
                        <th className="px-4 py-3">Title</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {requests.map((r) => (
                        <tr key={r.id} className={r.is_hidden ? "opacity-40" : ""}>
                          <td className="px-4 py-3 font-medium">{r.title}</td>
                          <td className="px-4 py-3 text-zinc-400">
                            {r.is_hidden ? "Hidden" : "Visible"}
                          </td>
                          <td className="px-4 py-3">
                            {!r.is_hidden && (
                              <button
                                type="button"
                                onClick={() => hideRequest(r.id)}
                                disabled={actionInProgress === "req-" + r.id}
                                className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-400 hover:border-red-700 hover:text-red-400 disabled:opacity-50"
                              >
                                Hide
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* ── Audit log tab ──────────────────────────────────────────────── */}
          {tab === "audit" && (
            <section>
              {auditLog.length === 0 ? (
                <p className="text-sm text-zinc-500">No audit entries yet.</p>
              ) : (
                <div className="space-y-2">
                  {auditLog.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 rounded-lg border border-zinc-800 px-4 py-3 text-sm"
                    >
                      <span className="shrink-0 rounded bg-zinc-800 px-2 py-0.5 text-xs font-mono text-zinc-400">
                        {entry.action}
                      </span>
                      <span className="text-zinc-400">
                        {entry.target_type} <span className="text-zinc-300">{entry.target_id.slice(0, 8)}…</span>
                        {entry.reason && <span className="ml-2 text-zinc-500">— {entry.reason}</span>}
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-zinc-600">
                        {new Date(entry.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
