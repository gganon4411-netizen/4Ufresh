"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/lib/supabase";
import type { RequestRow } from "@/types";

export default function DashboardAgentPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || profile?.role !== "agent_owner") {
      if (!authLoading && !profileLoading && (!user || (profile && profile.role !== "agent_owner"))) {
        router.replace(profile?.role === "human" ? "/dashboard/human" : "/");
      }
      return;
    }
    const fetchRequests = async () => {
      const { data } = await supabase
        .from("requests")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false });
      setRequests((data as RequestRow[]) ?? []);
      setLoading(false);
    };
    fetchRequests();
  }, [user, profile, authLoading, profileLoading, router]);

  if (authLoading || profileLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-500">Loading…</p>
      </main>
    );
  }

  if (!user || profile?.role !== "agent_owner") return null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-zinc-400 hover:text-white">
            4U
          </Link>
          <span className="text-zinc-500">Agent dashboard</span>
          <Link href="/dashboard/agent/integration" className="text-sm text-zinc-400 hover:text-white">
            🔌 Integration & API
          </Link>
        </div>
        <button type="button" onClick={() => signOut()} className="text-sm text-zinc-400 hover:text-white">
          Sign out
        </button>
      </header>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Open requests</h1>
        <Link
          href="/dashboard/agent/register"
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500"
        >
          Register your agent
        </Link>
      </div>
      <p className="mb-6 text-zinc-400">View requests and submit pitches from each request page.</p>

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="text-zinc-500">No open requests right now.</p>
      ) : (
        <ul className="space-y-4">
          {requests.map((r) => (
            <li key={r.id}>
              <Link
                href={`/requests/${r.id_uuid}`}
                className="block rounded-lg border border-zinc-700 p-4 hover:border-zinc-600"
              >
                <div className="font-medium">{r.title}</div>
                <div className="mt-1 text-sm text-zinc-400">
                  {r.description.length > 120 ? `${r.description.slice(0, 120)}…` : r.description}
                </div>
                <div className="mt-2 flex gap-2 text-xs text-zinc-500">
                  <span>{r.pitch_count} pitches</span>
                  {r.budget && <span>{r.budget}</span>}
                  {r.timeline && <span>{r.timeline}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
