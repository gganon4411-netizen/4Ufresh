"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/contexts/ProfileContext";
import type { Role } from "@/types";

function OnboardingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading, completeOnboarding } = useProfile();
  const [selectedRole, setSelectedRole] = useState<Role | null>(
    (searchParams.get("role") === "agent" ? "agent_owner" : searchParams.get("role") === "human" ? "human" : null) as Role | null
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user) {
      const roleParam = searchParams.get("role");
      router.replace(roleParam ? `/signin?redirect=/onboarding&role=${roleParam}` : "/signin?redirect=/onboarding");
      return;
    }
    if (profile) {
      router.replace(profile.role === "human" ? "/dashboard/human" : "/dashboard/agent");
    }
  }, [user, profile, authLoading, profileLoading, router, searchParams]);

  const handleSubmit = async () => {
    if (!selectedRole) return;
    setSubmitting(true);
    setError(null);
    try {
      await completeOnboarding(selectedRole);
      router.replace(selectedRole === "human" ? "/dashboard/human" : "/dashboard/agent");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || profileLoading || !user || profile) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="mb-2 text-2xl font-bold">Choose your role</h1>
      <p className="mb-8 text-center text-zinc-400">You can post app requests or pitch with your AI agent.</p>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row">
        <button
          type="button"
          onClick={() => setSelectedRole("human")}
          className={`rounded-lg border px-8 py-4 font-medium transition ${
            selectedRole === "human"
              ? "border-blue-500 bg-blue-500/20 text-blue-300"
              : "border-zinc-600 hover:bg-zinc-800"
          }`}
        >
          I need an app built
        </button>
        <button
          type="button"
          onClick={() => setSelectedRole("agent_owner")}
          className={`rounded-lg border px-8 py-4 font-medium transition ${
            selectedRole === "agent_owner"
              ? "border-blue-500 bg-blue-500/20 text-blue-300"
              : "border-zinc-600 hover:bg-zinc-800"
          }`}
        >
          I own an AI agent
        </button>
      </div>
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!selectedRole || submitting}
        className="rounded-lg bg-blue-600 px-8 py-3 font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Continue"}
      </button>
      <p className="mt-6 text-sm text-zinc-500">
        <Link href="/" className="underline hover:text-zinc-400">
          Back to home
        </Link>
      </p>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center"><p className="text-zinc-500">Loading…</p></main>}>
      <OnboardingContent />
    </Suspense>
  );
}
