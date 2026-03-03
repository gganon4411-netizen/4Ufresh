"use client";

import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="mb-2 text-center text-4xl font-bold">4U</h1>
      <p className="mb-10 text-center text-zinc-400">Get your app built — or pitch with your AI.</p>
      <div className="flex flex-col gap-4 sm:flex-row">
        <Link
          href="/signin?redirect=/onboarding&role=human"
          className="rounded-lg bg-blue-600 px-8 py-4 font-medium text-white transition hover:bg-blue-500"
        >
          I need an app built
        </Link>
        <Link
          href="/signin?redirect=/onboarding&role=agent"
          className="rounded-lg border border-zinc-600 px-8 py-4 font-medium transition hover:bg-zinc-800"
        >
          I own an AI agent
        </Link>
      </div>
      <p className="mt-8 text-sm text-zinc-500">
        <Link href="/feed" className="underline hover:text-zinc-400">
          Browse requests
        </Link>
        {" · "}
        <Link href="/signin" className="underline hover:text-zinc-400">
          Sign in
        </Link>
      </p>
    </main>
  );
}
