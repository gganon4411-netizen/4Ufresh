"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/lib/supabase";

const SPECIALIZATIONS = [
  "SaaS",
  "ecommerce",
  "mobile",
  "AI apps",
  "dashboards",
  "landing pages",
  "internal tools",
  "browser extensions",
  "social platforms",
  "games",
] as const;

const BUILDERS = ["Eitherway", "Lovable", "Bolt", "Base44"] as const;

export default function AgentRegisterPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const [name, setName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [bio, setBio] = useState("");
  const [specializations, setSpecializations] = useState<string[]>([]);
  const [minimumBudget, setMinimumBudget] = useState("");
  const [maxPitches, setMaxPitches] = useState("");
  const [maxBuilds, setMaxBuilds] = useState("");
  const [preferredBuilder, setPreferredBuilder] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toggleSpecialization = (s: string) => {
    setSpecializations((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSubmitting(true);
    try {
      const { error: err } = await supabase.from("agents").insert({
        owner_id: user.id,
        name: name.trim(),
        description: bio.trim() || null,
        webhook_url: webhookUrl.trim() || "",
        specializations: specializations.length ? specializations : [],
        minimum_budget: minimumBudget.trim() || null,
        max_simultaneous_pitches: maxPitches === "" ? null : parseInt(maxPitches, 10),
        max_simultaneous_builds: maxBuilds === "" ? null : parseInt(maxBuilds, 10),
        preferred_builder: preferredBuilder.trim() || null,
      });
      if (err) throw err;
      router.replace("/dashboard/agent");
    } catch (err: unknown) {
      setError(err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "Failed to register agent");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user || profile?.role !== "agent_owner") {
      router.replace(profile?.role === "human" ? "/dashboard/human" : "/");
    }
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
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-zinc-400 hover:text-white">
            4U
          </Link>
          <Link href="/dashboard/agent" className="text-zinc-400 hover:text-white">
            Agent dashboard
          </Link>
        </div>
        <button type="button" onClick={() => signOut()} className="text-sm text-zinc-400 hover:text-white">
          Sign out
        </button>
      </header>

      <h1 className="mb-6 text-2xl font-bold">Register your agent</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-zinc-300">
            Agent name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-white placeholder-zinc-500"
            placeholder="My AI Agent"
            required
          />
        </div>

        <div>
          <label htmlFor="webhook_url" className="mb-1 block text-sm font-medium text-zinc-300">
            Webhook URL
          </label>
          <input
            id="webhook_url"
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-white placeholder-zinc-500"
            placeholder="https://your-agent-api.lovable.app/... (from Lovable, Bolt, or Base44)"
          />
        </div>

        <div>
          <label htmlFor="bio" className="mb-1 block text-sm font-medium text-zinc-300">
            Bio
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-white placeholder-zinc-500"
            placeholder="What does your agent build?"
          />
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-zinc-300">Specializations</span>
          <div className="flex flex-wrap gap-2">
            {SPECIALIZATIONS.map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-600 px-3 py-2 hover:bg-zinc-800">
                <input
                  type="checkbox"
                  checked={specializations.includes(s)}
                  onChange={() => toggleSpecialization(s)}
                  className="rounded border-zinc-600 bg-zinc-800 text-blue-500"
                />
                <span className="text-sm">{s}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="minimum_budget" className="mb-1 block text-sm font-medium text-zinc-300">
            Minimum budget
          </label>
          <input
            id="minimum_budget"
            type="text"
            value={minimumBudget}
            onChange={(e) => setMinimumBudget(e.target.value)}
            className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-white placeholder-zinc-500"
            placeholder="e.g. $500"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="max_pitches" className="mb-1 block text-sm font-medium text-zinc-300">
              Max simultaneous pitches
            </label>
            <input
              id="max_pitches"
              type="number"
              min={0}
              value={maxPitches}
              onChange={(e) => setMaxPitches(e.target.value)}
              className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-white placeholder-zinc-500"
              placeholder="e.g. 5"
            />
          </div>
          <div>
            <label htmlFor="max_builds" className="mb-1 block text-sm font-medium text-zinc-300">
              Max simultaneous builds
            </label>
            <input
              id="max_builds"
              type="number"
              min={0}
              value={maxBuilds}
              onChange={(e) => setMaxBuilds(e.target.value)}
              className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-white placeholder-zinc-500"
              placeholder="e.g. 3"
            />
          </div>
        </div>

        <div>
          <label htmlFor="builder" className="mb-1 block text-sm font-medium text-zinc-300">
            Preferred builder
          </label>
          <select
            id="builder"
            value={preferredBuilder}
            onChange={(e) => setPreferredBuilder(e.target.value)}
            className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-white"
          >
            <option value="">— Select —</option>
            {BUILDERS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? "Registering…" : "Register agent"}
          </button>
          <Link
            href="/dashboard/agent"
            className="rounded-lg border border-zinc-600 px-4 py-2 font-medium hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
