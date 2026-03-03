"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { connected, publicKey, signMessage } = useWallet();
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<"idle" | "signing" | "verifying" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const redirect = searchParams.get("redirect") ?? null;

  // If already signed in, redirect via onboarding (handles role-based routing)
  useEffect(() => {
    if (!authLoading && user) {
      router.replace(redirect ?? "/onboarding");
    }
  }, [user, authLoading, router, redirect]);

  const handleSignIn = async () => {
    if (!connected || !publicKey || !signMessage) {
      setError("Please connect your wallet first.");
      return;
    }
    setError(null);
    setStatus("signing");

    try {
      const message = `Sign in to 4U\nNonce: ${Date.now()}`;
      const msgBytes = new TextEncoder().encode(message);

      let sigBytes: Uint8Array;
      try {
        sigBytes = await signMessage(msgBytes);
      } catch {
        setError("Signature cancelled. Please approve the sign request in your wallet.");
        setStatus("idle");
        return;
      }

      setStatus("verifying");

      const res = await fetch("/api/auth/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: publicKey.toBase58(),
          signature: Array.from(sigBytes),
          message,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.session) {
        setError(data.error ?? "Sign-in failed. Please try again.");
        setStatus("idle");
        return;
      }

      // Set the Supabase session — AuthContext picks it up via onAuthStateChange
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      setStatus("done");

      // Always route via /onboarding — it auto-redirects to the right dashboard if role already set
      router.replace(redirect ?? "/onboarding");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStatus("idle");
    }
  };

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="mb-2 text-2xl font-bold">Sign in to 4U</h1>
      <p className="mb-8 text-center text-sm text-zinc-400">
        Connect your Solana wallet and sign a message to authenticate.
        <br />No email or password needed.
      </p>

      <div className="flex w-full max-w-sm flex-col items-center gap-4">
        {/* Wallet connect button */}
        <WalletMultiButton className="!w-full !rounded-lg !bg-zinc-700 !px-4 !py-3 !text-sm !font-medium hover:!bg-zinc-600" />

        {connected && publicKey && (
          <button
            type="button"
            onClick={handleSignIn}
            disabled={status !== "idle"}
            className="w-full rounded-lg bg-purple-600 px-4 py-3 font-medium text-white hover:bg-purple-500 disabled:opacity-50"
          >
            {status === "signing"
              ? "Check your wallet…"
              : status === "verifying"
              ? "Verifying…"
              : status === "done"
              ? "Signed in ✓"
              : "Sign in with Wallet"}
          </button>
        )}

        {error && (
          <p className="w-full rounded-lg border border-red-800 bg-red-900/20 px-4 py-2 text-center text-sm text-red-400">
            {error}
          </p>
        )}

        {!connected && (
          <p className="text-center text-xs text-zinc-500">
            Supported: Phantom, Solflare
          </p>
        )}
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-500">Loading…</p>
      </main>
    }>
      <SignInContent />
    </Suspense>
  );
}
