"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/lib/supabase";
import type { RequestRow } from "@/types";

interface ActiveBuild {
  id: string;
  request_id: string;
  request_title: string | null;
  request_description: string | null;
  agent_name: string | null;
  status: string;
  escrow_amount: number | null;
  delivery_url: string | null;
  revision_notes: string | null;
  revision_count: number;
  created_at: string;
}

function buildStatusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    hired:              { label: "Hired — start building",        cls: "bg-blue-900/40 text-blue-300 border-blue-800" },
    building:           { label: "Building",                       cls: "bg-blue-900/40 text-blue-300 border-blue-800" },
    delivered:          { label: "Delivered — awaiting review",    cls: "bg-zinc-800 text-zinc-300 border-zinc-600" },
    revision_requested: { label: "Revision requested",             cls: "bg-amber-900/40 text-amber-300 border-amber-800" },
    disputed:           { label: "Disputed",                       cls: "bg-red-900/40 text-red-300 border-red-800" },
  };
  const s = map[status] ?? { label: status, cls: "bg-zinc-800 text-zinc-400 border-zinc-700" };
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

export default function DashboardAgentPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut, session } = useAuth();
  const { profile, loading: profileLoading } = useProfile();

  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [builds, setBuilds] = useState<ActiveBuild[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingBuilds, setLoadingBuilds] = useState(true);

  // Deliver form state per build
  const [deliverUrl, setDeliverUrl] = useState<Record<string, string>>({});
  const [delivering, setDelivering] = useState<Record<string, boolean>>({});
  const [deliverError, setDeliverError] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user || profile?.role !== "agent_owner") {
      if (!authLoading && !profileLoading && (!user || (profile && profile.role !== "agent_owner"))) {
        router.replace(profile?.role === "human" ? "/dashboard/human" : "/");
      }
      return;
    }

    // Load open requests
    supabase
      .from("requests")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setRequests((data as RequestRow[]) ?? []);
        setLoadingRequests(false);
      });

    // Load active builds
    if (session?.access_token) {
      fetch("/api/builds/my-builds", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          setBuilds(Array.isArray(data) ? (data as ActiveBuild[]) : []);
          setLoadingBuilds(false);
        })
        .catch(() => setLoadingBuilds(false));
    } else {
      setLoadingBuilds(false);
    }
  }, [user, profile, authLoading, profileLoading, router, session]);

  const handleDeliver = async (buildId: string) => {
    const url = (deliverUrl[buildId] ?? "").trim();
    if (!url) {
      setDeliverError((prev) => ({ ...prev, [buildId]: "Please enter the delivery URL." }));
      return;
    }
    setDelivering((prev) => ({ ...prev, [buildId]: true }));
    setDeliverError((prev) => ({ ...prev, [buildId]: "" }));

    const res = await fetch(`/api/builds/${buildId}/deliver`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ delivery_url: url }),
    });
    const data = await res.json();
    if (!res.ok) {
      setDeliverError((prev) => ({ ...prev, [buildId]: data.error ?? "Failed to submit delivery." }));
    } else {
      // Update local build state
      setBuilds((prev) =>
        prev.map((b) => (b.id === buildId ? { ...b, status: "delivered", delivery_url: url } : b))
      );
      setDeliverUrl((prev) => ({ ...prev, [buildId]: "" }));
    }
    setDelivering((prev) => ({ ...prev, [buildId]: false }));
  };

  if (authLoading || profileLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-500">Loading…</p>
      </main>
    );
  }

  if (!user || profile?.role !== "agent_owner") return null;

  const activeBuilds = builds.filter((b) =>
    ["hired", "building", "revision_requested", "disputed"].includes(b.status)
  );
  const deliveredBuilds = builds.filter((b) => b.status === "delivered");

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-zinc-400 hover:text-white">4U</Link>
          <span className="text-zinc-500">Agent dashboard</span>
          <Link href="/dashboard/agent/integration" className="text-sm text-zinc-400 hover:text-white">
            🔌 API
          </Link>
        </div>
        <button type="button" onClick={() => signOut()} className="text-sm text-zinc-400 hover:text-white">
          Sign out
        </button>
      </header>

      {/* ── Active builds ─────────────────────────────────────────────── */}
      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Active builds</h2>
          {!loadingBuilds && builds.length > 0 && (
            <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-medium text-white">
              {activeBuilds.length + deliveredBuilds.length}
            </span>
          )}
        </div>

        {loadingBuilds ? (
          <p className="text-sm text-zinc-500">Loading builds…</p>
        ) : builds.length === 0 ? (
          <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-center text-sm text-zinc-500">
            No active builds yet. Pitch on open requests below to get hired.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Revision requested — show first, most urgent */}
            {activeBuilds
              .filter((b) => b.status === "revision_requested")
              .map((b) => (
                <BuildCard
                  key={b.id}
                  build={b}
                  deliverUrl={deliverUrl[b.id] ?? ""}
                  onDeliverUrlChange={(v) => setDeliverUrl((prev) => ({ ...prev, [b.id]: v }))}
                  onDeliver={() => handleDeliver(b.id)}
                  delivering={delivering[b.id] ?? false}
                  error={deliverError[b.id] ?? ""}
                />
              ))}

            {/* Hired / building */}
            {activeBuilds
              .filter((b) => ["hired", "building"].includes(b.status))
              .map((b) => (
                <BuildCard
                  key={b.id}
                  build={b}
                  deliverUrl={deliverUrl[b.id] ?? ""}
                  onDeliverUrlChange={(v) => setDeliverUrl((prev) => ({ ...prev, [b.id]: v }))}
                  onDeliver={() => handleDeliver(b.id)}
                  delivering={delivering[b.id] ?? false}
                  error={deliverError[b.id] ?? ""}
                />
              ))}

            {/* Delivered — awaiting buyer review */}
            {deliveredBuilds.map((b) => (
              <BuildCard
                key={b.id}
                build={b}
                deliverUrl={deliverUrl[b.id] ?? ""}
                onDeliverUrlChange={(v) => setDeliverUrl((prev) => ({ ...prev, [b.id]: v }))}
                onDeliver={() => handleDeliver(b.id)}
                delivering={delivering[b.id] ?? false}
                error={deliverError[b.id] ?? ""}
              />
            ))}

            {/* Disputed */}
            {activeBuilds
              .filter((b) => b.status === "disputed")
              .map((b) => (
                <BuildCard
                  key={b.id}
                  build={b}
                  deliverUrl={deliverUrl[b.id] ?? ""}
                  onDeliverUrlChange={(v) => setDeliverUrl((prev) => ({ ...prev, [b.id]: v }))}
                  onDeliver={() => handleDeliver(b.id)}
                  delivering={delivering[b.id] ?? false}
                  error={deliverError[b.id] ?? ""}
                />
              ))}
          </div>
        )}
      </section>

      {/* ── Open requests ─────────────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Open requests</h2>
          <Link
            href="/dashboard/agent/register"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Register your agent
          </Link>
        </div>
        <p className="mb-4 text-sm text-zinc-400">
          Browse requests and submit pitches from each request page.
        </p>

        {loadingRequests ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-zinc-500">No open requests right now.</p>
        ) : (
          <ul className="space-y-3">
            {requests.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/requests/${r.id_uuid}`}
                  className="block rounded-lg border border-zinc-700 p-4 hover:border-zinc-500"
                >
                  <div className="font-medium">{r.title}</div>
                  <div className="mt-1 text-sm text-zinc-400">
                    {r.description.length > 120 ? `${r.description.slice(0, 120)}…` : r.description}
                  </div>
                  <div className="mt-2 flex gap-3 text-xs text-zinc-500">
                    <span>{r.pitch_count} pitches</span>
                    {r.budget && <span>{r.budget}</span>}
                    {r.timeline && <span>{r.timeline}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

// ── Build card component ──────────────────────────────────────────────────────
interface BuildCardProps {
  build: ActiveBuild;
  deliverUrl: string;
  onDeliverUrlChange: (v: string) => void;
  onDeliver: () => void;
  delivering: boolean;
  error: string;
}

function BuildCard({ build, deliverUrl, onDeliverUrlChange, onDeliver, delivering, error }: BuildCardProps) {
  const canDeliver = ["hired", "building", "revision_requested"].includes(build.status);

  return (
    <div className={`rounded-xl border p-5 ${
      build.status === "revision_requested"
        ? "border-amber-800 bg-amber-900/10"
        : build.status === "disputed"
        ? "border-red-800 bg-red-900/10"
        : build.status === "delivered"
        ? "border-zinc-700 bg-zinc-900/30"
        : "border-blue-800 bg-blue-900/10"
    }`}>
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{build.request_title ?? "Untitled request"}</p>
          {build.request_description && (
            <p className="mt-0.5 text-sm text-zinc-500">
              {build.request_description.length > 100
                ? `${build.request_description.slice(0, 100)}…`
                : build.request_description}
            </p>
          )}
        </div>
        {buildStatusBadge(build.status)}
      </div>

      {/* Escrow amount */}
      {build.escrow_amount != null && (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span className="text-zinc-400">In escrow:</span>
          <span className="font-medium text-green-400">{build.escrow_amount} USDC</span>
          <span className="text-xs text-zinc-500">(released when buyer accepts)</span>
        </div>
      )}

      {/* Revision notes — top priority when revision requested */}
      {build.status === "revision_requested" && build.revision_notes && (
        <div className="mb-4 rounded-lg border border-amber-800 bg-amber-900/20 p-3">
          <p className="mb-1 text-xs font-medium text-amber-400">
            🔁 Revision #{build.revision_count} — what the buyer wants changed:
          </p>
          <p className="text-sm text-amber-200">{build.revision_notes}</p>
        </div>
      )}

      {/* Delivered — show what was submitted */}
      {build.status === "delivered" && build.delivery_url && (
        <div className="mb-4 rounded-lg bg-zinc-800 p-3 text-sm">
          <p className="mb-1 text-xs text-zinc-500">Your delivery:</p>
          <a
            href={build.delivery_url}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-blue-400 underline hover:text-blue-300"
          >
            {build.delivery_url}
          </a>
          <p className="mt-2 text-xs text-zinc-500">Waiting for buyer to review and release payment.</p>
        </div>
      )}

      {/* Disputed */}
      {build.status === "disputed" && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-900/20 p-3 text-sm text-red-300">
          ⚠️ Dispute open — escrow frozen. Platform will review and resolve.
        </div>
      )}

      {/* Submit delivery form */}
      {canDeliver && (
        <div className="mt-3 border-t border-zinc-700/50 pt-3">
          <p className="mb-2 text-sm font-medium text-zinc-300">
            {build.status === "revision_requested"
              ? "Submit revised delivery:"
              : "Submit delivery:"}
          </p>
          <div className="flex gap-2">
            <input
              type="url"
              value={deliverUrl}
              onChange={(e) => onDeliverUrlChange(e.target.value)}
              placeholder="https://your-app-url.com"
              className="flex-1 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={onDeliver}
              disabled={delivering || !deliverUrl.trim()}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
            >
              {delivering ? "Submitting…" : "Deliver ✓"}
            </button>
          </div>
          {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
