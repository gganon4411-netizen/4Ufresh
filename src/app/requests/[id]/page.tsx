"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  Connection,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/lib/supabase";
import type { RequestRow, Pitch } from "@/types";

// ─── Solana constants ─────────────────────────────────────────────────────────
const SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

// Devnet USDC mint (Circle). For mainnet use EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
const USDC_MINT =
  process.env.NEXT_PUBLIC_USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

// The platform custody wallet that holds escrow funds
const ESCROW_WALLET =
  process.env.NEXT_PUBLIC_ESCROW_WALLET ?? "2aMA6ePTAUDUym8tz6BHG8TsKaCgtS4Hzxfo2sLPFtJR";

const USDC_DECIMALS = 6;

/** Parse a human-readable price string like "$1,500" → 1500 */
function parsePriceUSDC(raw: string | null): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return isNaN(n) || n <= 0 ? null : n;
}

// ─── Hiring status ────────────────────────────────────────────────────────────
type HireStep = "idle" | "building_tx" | "awaiting_approval" | "confirming" | "creating_job";

function hireStepLabel(step: HireStep): string {
  switch (step) {
    case "building_tx":     return "Preparing…";
    case "awaiting_approval": return "Approve in wallet…";
    case "confirming":      return "Confirming on-chain…";
    case "creating_job":    return "Creating job…";
    default:                return "Hire This Agent";
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function RequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { user, session } = useAuth();
  const { profile } = useProfile();
  const { publicKey, sendTransaction, connected } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();

  const [request, setRequest] = useState<RequestRow | null>(null);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [myAgents, setMyAgents] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPitchForm, setShowPitchForm] = useState(false);
  const [pitchMessage, setPitchMessage] = useState("");
  const [approach, setApproach] = useState("");
  const [estimatedDelivery, setEstimatedDelivery] = useState("");
  const [priceQuote, setPriceQuote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hireStep, setHireStep] = useState<HireStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const hiring = hireStep !== "idle";

  useEffect(() => {
    if (!id) return;
    const fetchRequest = async () => {
      const { data: req } = await supabase.from("requests").select("*").eq("id_uuid", id).single();
      if (req) {
        setRequest(req as RequestRow);
        const { data: pitchData } = await supabase
          .from("pitches")
          .select("*")
          .eq("request_id", id)
          .order("created_at", { ascending: false });
        setPitches((pitchData as Pitch[]) ?? []);
      }
      setLoading(false);
    };
    fetchRequest();
  }, [id]);

  useEffect(() => {
    if (!user || profile?.role !== "agent_owner") return;
    const fetchAgents = async () => {
      const { data } = await supabase.from("agents").select("id, name").eq("owner_id", user.id);
      setMyAgents((data as { id: number; name: string }[]) ?? []);
    };
    fetchAgents();
  }, [user, profile?.role]);

  const isOwner = user && request && request.user_id === user.id;
  const isAgent = profile?.role === "agent_owner";
  const pitchStatus = (p: Pitch) => p.status ?? "pending";

  // ─── Submit pitch ──────────────────────────────────────────────────────────
  const handleSubmitPitch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!pitchMessage.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const agent = myAgents[0];
      const res = await fetch("/api/receive-pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: id,
          content: pitchMessage.trim(),
          agent_id: agent?.id ?? null,
          agent_name: agent?.name ?? user?.email ?? "Agent",
          approach: approach.trim() || undefined,
          estimated_delivery_time: estimatedDelivery.trim() || undefined,
          price_quote: priceQuote.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to submit pitch");
      }
      const newPitch = await res.json();
      setPitches((prev) => [newPitch as Pitch, ...prev]);
      setRequest((prev) => (prev ? { ...prev, pitch_count: prev.pitch_count + 1 } : null));
      setPitchMessage("");
      setApproach("");
      setEstimatedDelivery("");
      setPriceQuote("");
      setShowPitchForm(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit pitch");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Hire agent (USDC escrow flow) ────────────────────────────────────────
  const handleHireAgent = async (pitchId: number, requestId: string, rawPriceQuote: string | null) => {
    if (!session) return;
    setError(null);

    // Step 0 — wallet must be connected
    if (!connected || !publicKey) {
      openWalletModal(true);
      return;
    }

    // Step 0b — must have a valid price to escrow
    const usdcAmount = parsePriceUSDC(rawPriceQuote);
    if (!usdcAmount) {
      setError(
        rawPriceQuote
          ? `Could not parse price "${rawPriceQuote}" as a USDC amount.`
          : "This pitch has no price quote. Ask the agent to add one before hiring."
      );
      return;
    }

    setHireStep("building_tx");

    try {
      const connection = new Connection(SOLANA_RPC, "confirmed");
      const usdcMint = new PublicKey(USDC_MINT);
      const escrowPubkey = new PublicKey(ESCROW_WALLET);

      // Derive ATAs
      const buyerAta = getAssociatedTokenAddressSync(usdcMint, publicKey);
      const escrowAta = getAssociatedTokenAddressSync(usdcMint, escrowPubkey);

      const instructions = [];

      // Create escrow ATA if it doesn't exist yet
      const escrowAtaInfo = await connection.getAccountInfo(escrowAta);
      if (!escrowAtaInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            publicKey,    // payer
            escrowAta,    // ata address to create
            escrowPubkey, // owner of the new ATA
            usdcMint
          )
        );
      }

      // USDC transfer: buyer → escrow (6 decimals)
      const atomicAmount = BigInt(Math.round(usdcAmount * 10 ** USDC_DECIMALS));
      instructions.push(
        createTransferCheckedInstruction(
          buyerAta,      // source
          usdcMint,      // mint
          escrowAta,     // destination
          publicKey,     // authority (buyer)
          atomicAmount,  // amount
          USDC_DECIMALS
        )
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: publicKey,
      });
      tx.add(...instructions);

      // Step 1 — send to wallet for signing
      setHireStep("awaiting_approval");
      const txSignature = await sendTransaction(tx, connection);

      // Step 2 — wait for on-chain confirmation
      setHireStep("confirming");
      await connection.confirmTransaction(
        { signature: txSignature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      // Step 3 — tell the backend to lock escrow & create the build
      setHireStep("creating_job");
      const res = await fetch("/api/jobs/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pitch_id: pitchId,
          request_id: requestId,
          tx_signature: txSignature,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Backend rejected the hire request.");
        return;
      }

      router.refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      // User rejected the wallet prompt — don't show a scary error
      if (msg.toLowerCase().includes("user rejected") || msg.toLowerCase().includes("cancelled")) {
        setError("Transaction cancelled.");
      } else {
        setError(msg);
      }
    } finally {
      setHireStep("idle");
    }
  };

  // ─── Status change ─────────────────────────────────────────────────────────
  const handleStatusChange = async (newStatus: RequestRow["status"]) => {
    if (!request || request.user_id !== user?.id) return;
    try {
      const { error: err } = await supabase.from("requests").update({ status: newStatus }).eq("id_uuid", id);
      if (err) throw err;
      setRequest((prev) => (prev ? { ...prev, status: newStatus } : null));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    }
  };

  // ─── Loading / not found ───────────────────────────────────────────────────
  if (loading || !request) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-500">{loading ? "Loading…" : "Request not found."}</p>
      </main>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-center gap-4">
        <Link
          href={profile?.role === "human" ? "/dashboard/human" : "/dashboard/agent"}
          className="text-zinc-400 hover:text-white"
        >
          ← Back
        </Link>
      </header>

      <div className="mb-8">
        <h1 className="text-2xl font-bold">{request.title}</h1>
        <p className="mt-2 whitespace-pre-wrap text-zinc-400">{request.description}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm text-zinc-500">
          {request.budget && <span>Budget: {request.budget}</span>}
          {request.timeline && <span>Timeline: {request.timeline}</span>}
          {request.category && <span>Category: {request.category}</span>}
          <span className="capitalize">Status: {request.status.replace("_", " ")}</span>
          <span>{request.pitch_count} pitches</span>
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium">Pitches</h2>
        {pitches.length === 0 ? (
          <p className="text-sm text-zinc-500">No pitches yet.</p>
        ) : (
          <ul className="space-y-4">
            {pitches.map((p) => {
              const status = pitchStatus(p);
              const usdcAmount = parsePriceUSDC(p.price_quote);

              return (
                <li key={p.id} className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm text-zinc-400">
                        <span>{p.agent_name ?? "Agent"}</span>
                        <span className="capitalize text-zinc-500">({status})</span>
                      </div>
                      <p className="mt-2 text-sm">{p.content}</p>
                      {(p.approach || p.estimated_delivery_time || p.price_quote) && (
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
                          {p.approach && <span>Approach: {p.approach}</span>}
                          {p.estimated_delivery_time && <span>Delivery: {p.estimated_delivery_time}</span>}
                          {p.price_quote && <span>Quote: {p.price_quote}</span>}
                        </div>
                      )}
                    </div>

                    {isOwner && request.status === "open" && status === "pending" && (
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleHireAgent(p.id, request.id_uuid, p.price_quote)}
                          disabled={hiring}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                        >
                          {hiring ? hireStepLabel(hireStep) : "Hire This Agent"}
                        </button>
                        {usdcAmount && !hiring && (
                          <span className="text-xs text-zinc-500">
                            {!connected ? "Connect wallet to pay" : `Pay ${usdcAmount} USDC`}
                          </span>
                        )}
                        {!p.price_quote && !hiring && (
                          <span className="text-xs text-amber-500">No price — ask agent to quote</span>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {error && (
        <p className="mb-4 rounded-lg border border-red-800 bg-red-900/30 px-4 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {isOwner && request.status !== "open" && (
        <div className="mb-6 flex flex-wrap gap-2">
          {request.status === "in_progress" && (
            <button
              type="button"
              onClick={() => handleStatusChange("in_review")}
              className="rounded-lg border border-zinc-600 px-4 py-2 text-sm hover:bg-zinc-800"
            >
              Mark: In review
            </button>
          )}
          {request.status === "in_review" && (
            <button
              type="button"
              onClick={() => handleStatusChange("complete")}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500"
            >
              Mark: Complete
            </button>
          )}
        </div>
      )}

      {isAgent && request.status === "open" && (
        <section className="rounded-lg border border-zinc-700 p-6">
          {!showPitchForm ? (
            <button
              type="button"
              onClick={() => setShowPitchForm(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500"
            >
              Submit Pitch
            </button>
          ) : (
            <form onSubmit={handleSubmitPitch} className="space-y-4">
              <h2 className="font-medium">Submit a pitch</h2>
              <div>
                <label htmlFor="pitch_message" className="mb-1 block text-sm text-zinc-400">
                  Pitch message
                </label>
                <textarea
                  id="pitch_message"
                  value={pitchMessage}
                  onChange={(e) => setPitchMessage(e.target.value)}
                  rows={3}
                  placeholder="Describe how you'll build this..."
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-white placeholder-zinc-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="approach" className="mb-1 block text-sm text-zinc-400">
                  Approach
                </label>
                <input
                  id="approach"
                  type="text"
                  value={approach}
                  onChange={(e) => setApproach(e.target.value)}
                  placeholder="e.g. Iterative builds with weekly demos"
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-white placeholder-zinc-500"
                />
              </div>
              <div>
                <label htmlFor="delivery" className="mb-1 block text-sm text-zinc-400">
                  Estimated delivery time
                </label>
                <input
                  id="delivery"
                  type="text"
                  value={estimatedDelivery}
                  onChange={(e) => setEstimatedDelivery(e.target.value)}
                  placeholder="e.g. 2 weeks"
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-white placeholder-zinc-500"
                />
              </div>
              <div>
                <label htmlFor="quote" className="mb-1 block text-sm text-zinc-400">
                  Price quote
                </label>
                <input
                  id="quote"
                  type="text"
                  value={priceQuote}
                  onChange={(e) => setPriceQuote(e.target.value)}
                  placeholder="e.g. $1,500"
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-white placeholder-zinc-500"
                />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {submitting ? "Submitting…" : "Submit pitch"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowPitchForm(false); setError(null); }}
                  className="rounded-lg border border-zinc-600 px-4 py-2 font-medium hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
