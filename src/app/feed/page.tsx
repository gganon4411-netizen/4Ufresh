"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { RequestRow } from "@/types";

const STATUSES: RequestRow["status"][] = ["open", "in_progress", "in_review", "complete"];
const TRUNCATE_LEN = 120;

export default function FeedPage() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<RequestRow["status"] | null>(null);

  useEffect(() => {
    const fetchRequests = async () => {
      const { data } = await supabase
        .from("requests")
        .select("*")
        .order("created_at", { ascending: false });
      setRequests((data as RequestRow[]) ?? []);
      setLoading(false);
    };
    fetchRequests();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("requests-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "requests" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setRequests((prev) => [payload.new as RequestRow, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setRequests((prev) =>
              prev.map((r) => (r.id === (payload.new as RequestRow).id ? (payload.new as RequestRow) : r))
            );
          } else if (payload.eventType === "DELETE") {
            setRequests((prev) => prev.filter((r) => r.id !== (payload.old as { id: number }).id));
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    requests.forEach((r) => {
      if (r.category?.trim()) set.add(r.category.trim());
    });
    return Array.from(set).sort();
  }, [requests]);

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (filterCategory != null && r.category?.trim() !== filterCategory) return false;
      if (filterStatus != null && r.status !== filterStatus) return false;
      return true;
    });
  }, [requests, filterCategory, filterStatus]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-zinc-400 hover:text-white">
          4U
        </Link>
        <h1 className="text-2xl font-bold">Request feed</h1>
        <div className="w-8" />
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        <span className="mr-2 self-center text-sm text-zinc-500">Category:</span>
        <button
          type="button"
          onClick={() => setFilterCategory(null)}
          className={`rounded-lg border px-3 py-1.5 text-sm transition ${
            filterCategory === null ? "border-blue-500 bg-blue-500/20 text-blue-300" : "border-zinc-600 hover:bg-zinc-800"
          }`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilterCategory(c)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              filterCategory === c ? "border-blue-500 bg-blue-500/20 text-blue-300" : "border-zinc-600 hover:bg-zinc-800"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <span className="mr-2 self-center text-sm text-zinc-500">Status:</span>
        <button
          type="button"
          onClick={() => setFilterStatus(null)}
          className={`rounded-lg border px-3 py-1.5 text-sm transition ${
            filterStatus === null ? "border-blue-500 bg-blue-500/20 text-blue-300" : "border-zinc-600 hover:bg-zinc-800"
          }`}
        >
          All
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilterStatus(s)}
            className={`rounded-lg border px-3 py-1.5 text-sm capitalize transition ${
              filterStatus === s ? "border-blue-500 bg-blue-500/20 text-blue-300" : "border-zinc-600 hover:bg-zinc-800"
            }`}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-zinc-500">No requests match the filters.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link
                href={`/requests/${r.id_uuid}`}
                className="block rounded-lg border border-zinc-700 p-4 transition hover:border-zinc-500 hover:bg-zinc-900/50"
              >
                <h2 className="font-semibold">{r.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-zinc-400">
                  {r.description.length > TRUNCATE_LEN ? `${r.description.slice(0, TRUNCATE_LEN)}…` : r.description}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  {r.budget && <span>{r.budget}</span>}
                  {r.timeline && <span>{r.timeline}</span>}
                  {r.category && <span>{r.category}</span>}
                  <span>{r.pitch_count} pitches</span>
                  <span className="capitalize text-zinc-400">{r.status.replace("_", " ")}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
