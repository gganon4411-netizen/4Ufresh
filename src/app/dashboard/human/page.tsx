"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/lib/supabase";
import type { RequestRow } from "@/types";

export default function DashboardHumanPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [timeline, setTimeline] = useState("");
  const [category, setCategory] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || profile?.role !== "human") {
      if (!authLoading && !profileLoading && (!user || (profile && profile.role !== "human"))) {
        router.replace(profile?.role === "agent_owner" ? "/dashboard/agent" : "/");
      }
      return;
    }
    const fetchRequests = async () => {
      const { data } = await supabase
        .from("requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setRequests((data as RequestRow[]) ?? []);
      setLoading(false);
    };
    fetchRequests();
  }, [user, profile, authLoading, profileLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("requests")
        .insert({
          user_id: user.id,
          title,
          description,
          budget: budget || null,
          timeline: timeline || null,
          category: category || null,
          status: "open",
        })
        .select()
        .single();
      if (err) throw err;
      setRequests((prev) => [data as RequestRow, ...prev]);
      setTitle("");
      setDescription("");
      setBudget("");
      setTimeline("");
      setCategory("");
      setShowForm(false);
      const idUuid = (data as RequestRow).id_uuid;
      await fetch("/api/notify-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: idUuid }),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create request");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || profileLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-500">Loading…</p>
      </main>
    );
  }

  if (!user || profile?.role !== "human") return null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-zinc-400 hover:text-white">
            4U
          </Link>
          <span className="text-zinc-500">Human dashboard</span>
        </div>
        <button type="button" onClick={() => signOut()} className="text-sm text-zinc-400 hover:text-white">
          Sign out
        </button>
      </header>

      <h1 className="mb-6 text-2xl font-bold">My app requests</h1>
      <button
        type="button"
        onClick={() => setShowForm(!showForm)}
        className="mb-6 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500"
      >
        {showForm ? "Cancel" : "Post a new request"}
      </button>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-8 space-y-4 rounded-lg border border-zinc-700 p-6">
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-white placeholder-zinc-500"
            required
          />
          <textarea
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-white placeholder-zinc-500"
            required
          />
          <input
            type="text"
            placeholder="Budget (optional)"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-white placeholder-zinc-500"
          />
          <input
            type="text"
            placeholder="Timeline (optional)"
            value={timeline}
            onChange={(e) => setTimeline(e.target.value)}
            className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-white placeholder-zinc-500"
          />
          <input
            type="text"
            placeholder="Category (optional)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-white placeholder-zinc-500"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? "Posting…" : "Post request"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-zinc-500">Loading requests…</p>
      ) : requests.length === 0 ? (
        <p className="text-zinc-500">No requests yet. Post one above.</p>
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
                  <span className="capitalize">{r.status}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
