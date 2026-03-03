"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/contexts/ProfileContext";
import { supabase } from "@/lib/supabase";
import type { RequestRow, Pitch } from "@/types";

// ─── Solana constants ─────────────────────────────────────────────────────────
const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const USDC_MINT = process.env.NEXT_PUBLIC_USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const ESCROW_WALLET = process.env.NEXT_PUBLIC_ESCROW_WALLET ?? "2aMA6ePTAUDUym8tz6BHG8TsKaCgtS4Hzxfo2sLPFtJR";
const USDC_DECIMALS = 6;
const PLATFORM_FEE_PCT = 2;

function parsePriceUSDC(raw: string | null): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return isNaN(n) || n <= 0 ? null : n;
}

// ─── Build type ───────────────────────────────────────────────────────────────
interface Build {
  id: string;
  request_id: string;
  agent_id: number | null;
  agent_name: string | null;
  status: string;
  escrow_amount: number | null;
  escrow_status: string | null;
  delivery_url: string | null;
  revision_notes: string | null;
  revision_count: number;
  deposit_tx_signature: string | null;
  created_at: string;
}

// ─── Hire step ────────────────────────────────────────────────────────────────
type HireStep = "idle" | "creating_job";

// ─── Build status label ───────────────────────────────────────────────────────
function buildStatusLabel(status: string) {
  const map: Record<string, string> = {
    hired: "🤝 Agent hired — waiting to start",
    building: "🔨 Agent is building",
    delivered: "📦 Agent has delivered — review below",
    revision_requested: "✏️ Agent working on your revision",
    disputed: "⚠️ Dispute open",
    accepted: "✅ Accepted — payment released",
    cancelled: "❌ Cancelled",
    dead_letter: "💀 Failed — contact support",
  };
  return map[status] ?? status;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function RequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { user, session } = useAuth();
  const { profile } = useProfile();
  const { connected } = useWallet();

  const [request, setRequest] = useState<RequestRow | null>(null);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [myAgents, setMyAgents] = useState<{ id: number; name: string }[]>([]);
  const [build, setBuild] = useState<Build | null>(null);
  const [loading, setLoading] = useState(true);

  // Pitch form
  const [showPitchForm, setShowPitchForm] = useState(false);
  const [pitchMessage, setPitchMessage] = useState("");
  const [approach, setApproach] = useState("");
  const [estimatedDelivery, setEstimatedDelivery] = useState("");
  const [priceQuote, setPriceQuote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Hire modal
  const [hireModal, setHireModal] = useState<Pitch | null>(null);
  const [hireStep, setHireStep] = useState<HireStep>("idle");
  const [hireFlowStep, setHireFlowStep] = useState<"send" | "submit">("send");
  const [txHashInput, setTxHashInput] = useState("");
  const [copied, setCopied] = useState(false);

  // Review tab
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewAction, setReviewAction] = useState<"idle" | "accepting" | "revising" | "disputing">("idle");

  const [error, setError] = useState<string | null>(null);
  const hiring = hireStep !== "idle";

  // ─── Fetch request + pitches ─────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const { data: req } = await supabase.from("requests").select("*").eq("id_uuid", id).single();
      if (req) {
        setRequest(req as RequestRow);
        const { data: pitchData } = await supabase
          .from("pitches").select("*").eq("request_id", id)
          .order("created_at", { ascending: false });
        setPitches((pitchData as Pitch[]) ?? []);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  // ─── Fetch current build when request is not open ────────────────────────
  useEffect(() => {
    if (!request || request.status === "open") return;
    fetch(`/api/builds/request/${request.id_uuid}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data && !data.error) setBuild(data as Build); })
      .catch(() => null);
  }, [request]);

  // ─── Agent list ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || profile?.role !== "agent_owner") return;
    supabase.from("agents").select("id, name").eq("owner_id", user.id)
      .then(({ data }) => setMyAgents((data as { id: number; name: string }[]) ?? []));
  }, [user, profile?.role]);

  const isOwner = !!(user && request && request.user_id === user.id);
  const isAgent = profile?.role === "agent_owner";

  // ─── Submit pitch ────────────────────────────────────────────────────────
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
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const newPitch = await res.json();
      setPitches((prev) => [newPitch as Pitch, ...prev]);
      setRequest((prev) => prev ? { ...prev, pitch_count: prev.pitch_count + 1 } : null);
      setPitchMessage(""); setApproach(""); setEstimatedDelivery(""); setPriceQuote("");
      setShowPitchForm(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit pitch");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Submit tx hash + create job ─────────────────────────────────────────
  const executeHire = async (pitch: Pitch, txSignature: string) => {
    if (!session) return;
    setError(null);
    const trimmedSig = txSignature.trim();
    if (!trimmedSig) { setError("Please paste your transaction signature."); return; }

    setHireStep("creating_job");
    try {
      const res = await fetch("/api/jobs/create", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pitch_id: pitch.id, request_id: request!.id_uuid, tx_signature: trimmedSig }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to verify transaction. Check your signature and try again."); return; }
      setHireModal(null);
      setTxHashInput("");
      setHireFlowStep("send");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setHireStep("idle");
    }
  };

  const handleCopyEscrow = () => {
    navigator.clipboard.writeText(ESCROW_WALLET);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Review actions ───────────────────────────────────────────────────────
  const buildAction = async (action: "accept" | "revision" | "cancel" | "dispute", body?: object) => {
    if (!build || !session) return;
    const endpoint = action === "revision" ? "revision" : action;
    const res = await fetch(`/api/builds/${build.id}/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Action failed"); return; }
    setBuild(data as Build);
    router.refresh();
  };

  const handleAccept = async () => {
    setReviewAction("accepting");
    setError(null);
    await buildAction("accept");
    setReviewAction("idle");
  };

  const handleRequestRevision = async () => {
    if (!reviewNotes.trim()) { setError("Please describe what changes you want."); return; }
    setReviewAction("revising");
    setError(null);
    await buildAction("revision", { notes: reviewNotes.trim() });
    setReviewNotes("");
    setReviewAction("idle");
  };

  const handleDispute = async () => {
    if (!reviewNotes.trim()) { setError("Please describe the issue to open a dispute."); return; }
    setReviewAction("disputing");
    setError(null);
    await buildAction("dispute", { reason: reviewNotes.trim() });
    setReviewNotes("");
    setReviewAction("idle");
  };

  const handleCancel = async () => {
    setError(null);
    await buildAction("cancel");
  };

  if (loading || !request) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-500">{loading ? "Loading…" : "Request not found."}</p>
      </main>
    );
  }

  const usdcForModal = hireModal ? parsePriceUSDC(hireModal.price_quote) : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {/* ── Hire modal — 2-step escrow flow ────────────────────────────── */}
      {hireModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">

            {/* Step indicator */}
            <div className="mb-5 flex items-center gap-2 text-xs font-medium">
              <span className={`rounded-full px-2.5 py-0.5 ${hireFlowStep === "send" ? "bg-purple-600 text-white" : "bg-zinc-700 text-zinc-400"}`}>
                1 Send USDC
              </span>
              <span className="text-zinc-600">→</span>
              <span className={`rounded-full px-2.5 py-0.5 ${hireFlowStep === "submit" ? "bg-purple-600 text-white" : "bg-zinc-700 text-zinc-400"}`}>
                2 Submit Proof
              </span>
            </div>

            <h2 className="mb-4 text-lg font-semibold">Hire {hireModal.agent_name ?? "Agent"}</h2>

            {/* Summary row */}
            <div className="mb-4 space-y-2 rounded-lg bg-zinc-800 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-400">Amount to send</span>
                <span className="font-bold text-green-400">
                  {usdcForModal ? `${usdcForModal} USDC` : hireModal.price_quote ?? "—"}
                </span>
              </div>
              {hireModal.estimated_delivery_time && (
                <div className="flex justify-between">
                  <span className="text-zinc-400">Estimated delivery</span>
                  <span>{hireModal.estimated_delivery_time}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-zinc-400">Platform fee</span>
                <span className="text-zinc-500">{PLATFORM_FEE_PCT}% deducted on release</span>
              </div>
            </div>

            {/* ── Step 1: Send USDC ── */}
            {hireFlowStep === "send" && (
              <div className="space-y-4">
                <p className="text-sm text-zinc-400">
                  Send exactly <span className="font-semibold text-white">{usdcForModal} USDC</span> to the escrow wallet below on <span className="text-purple-400 font-medium">Solana Devnet</span>. Funds are locked until you accept delivery.
                </p>

                {/* Escrow address box */}
                <div>
                  <p className="mb-1 text-xs font-medium text-zinc-500 uppercase tracking-wide">Escrow Wallet Address</p>
                  <div className="flex items-center gap-2 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2">
                    <span className="flex-1 break-all font-mono text-xs text-zinc-200">{ESCROW_WALLET}</span>
                    <button
                      type="button"
                      onClick={handleCopyEscrow}
                      className="shrink-0 rounded px-2 py-1 text-xs font-medium text-purple-400 hover:bg-zinc-700"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                {/* USDC mint helper */}
                <div>
                  <p className="mb-1 text-xs font-medium text-zinc-500 uppercase tracking-wide">USDC Mint (Devnet)</p>
                  <p className="break-all font-mono text-xs text-zinc-500">{USDC_MINT}</p>
                </div>

                <p className="text-xs text-zinc-500">
                  Need devnet USDC? Get devnet SOL at <a href="https://solfaucet.com" target="_blank" rel="noopener noreferrer" className="text-purple-400 underline">solfaucet.com</a>, then swap at the devnet USDC faucet.
                </p>

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => { setHireModal(null); setHireFlowStep("send"); setError(null); setTxHashInput(""); }}
                    className="flex-1 rounded-lg border border-zinc-600 px-4 py-2.5 text-sm font-medium hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => { setError(null); setHireFlowStep("submit"); }}
                    className="flex-1 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-500"
                  >
                    I&apos;ve Sent the USDC →
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 2: Submit tx signature ── */}
            {hireFlowStep === "submit" && (
              <div className="space-y-4">
                <p className="text-sm text-zinc-400">
                  Paste the transaction signature from your wallet. The backend will verify the payment on-chain before the agent begins work.
                </p>

                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-400">Transaction Signature</label>
                  <textarea
                    value={txHashInput}
                    onChange={(e) => setTxHashInput(e.target.value)}
                    placeholder="e.g. 5Kz3…xR9t"
                    rows={3}
                    className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-purple-500 focus:outline-none"
                  />
                </div>

                {error && <p className="text-sm text-red-400">{error}</p>}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setHireFlowStep("send"); setError(null); }}
                    disabled={hiring}
                    className="flex-1 rounded-lg border border-zinc-600 px-4 py-2.5 text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    onClick={() => executeHire(hireModal, txHashInput)}
                    disabled={hiring || !txHashInput.trim()}
                    className="flex-1 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
                  >
                    {hiring ? "Verifying…" : "Verify & Hire Agent"}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="mb-6 flex items-center gap-4">
        <Link
          href={profile?.role === "human" ? "/dashboard/human" : "/dashboard/agent"}
          className="text-zinc-400 hover:text-white"
        >
          ← Back
        </Link>
      </header>

      {/* ── Request info ────────────────────────────────────────────────── */}
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

      {/* ── Build status banner ──────────────────────────────────────────── */}
      {build && (
        <div className={`mb-6 rounded-lg border px-4 py-3 text-sm font-medium ${
          build.status === "accepted" ? "border-green-800 bg-green-900/20 text-green-300"
          : build.status === "disputed" ? "border-red-800 bg-red-900/20 text-red-300"
          : build.status === "delivered" ? "border-blue-800 bg-blue-900/20 text-blue-300"
          : "border-zinc-700 bg-zinc-900/50 text-zinc-300"
        }`}>
          {buildStatusLabel(build.status)}
          {build.revision_count > 0 && (
            <span className="ml-2 text-xs text-zinc-500">({build.revision_count} revision{build.revision_count !== 1 ? "s" : ""} requested)</span>
          )}
        </div>
      )}

      {/* ── Review tab (delivered OR waiting on revision) ────────────────── */}
      {build && ["delivered", "revision_requested"].includes(build.status) && isOwner && (
        <section className="mb-8 rounded-xl border border-blue-800 bg-blue-950/20 p-6">

          {/* Escrow protection notice — always visible */}
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-green-800 bg-green-900/20 px-4 py-3 text-sm text-green-300">
            <span className="mt-0.5 shrink-0 text-base">🔒</span>
            <span>
              Your payment is held safely in escrow.{" "}
              <strong>The agent only gets paid once you accept their delivery.</strong>{" "}
              You can request as many changes as needed until you&apos;re happy.
            </span>
          </div>

          {build.status === "delivered" ? (
            <>
              <h2 className="mb-4 text-lg font-semibold text-blue-200">📦 Review Delivery</h2>

              {build.delivery_url && (
                <div className="mb-4 rounded-lg bg-zinc-800 p-3 text-sm">
                  <span className="text-zinc-400">Delivered at: </span>
                  <a
                    href={build.delivery_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-blue-400 underline hover:text-blue-300"
                  >
                    {build.delivery_url}
                  </a>
                </div>
              )}

              {build.revision_notes && (
                <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-900/50 p-3 text-sm">
                  <p className="mb-1 text-xs text-zinc-500">Your last revision request:</p>
                  <p className="text-zinc-300">{build.revision_notes}</p>
                </div>
              )}

              <label className="mb-2 block text-sm text-zinc-400">
                Feedback / change requests for the agent:
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={4}
                placeholder="Describe what you want changed — or leave blank and click Accept if you're happy..."
                className="mb-4 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
              />

              {error && <p className="mb-3 rounded bg-red-900/30 px-3 py-2 text-sm text-red-400">{error}</p>}

              <div className="flex flex-wrap gap-3">
                {/* Accept = happy, release payment */}
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={reviewAction !== "idle"}
                  className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
                >
                  {reviewAction === "accepting" ? "Releasing payment…" : "✅ Accept & Release Payment"}
                </button>

                {/* Request changes — needs notes */}
                <button
                  type="button"
                  onClick={handleRequestRevision}
                  disabled={reviewAction !== "idle" || !reviewNotes.trim()}
                  className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
                >
                  {reviewAction === "revising" ? "Sending…" : "✏️ Request Changes"}
                </button>

                {/* Dispute = something is seriously wrong */}
                <button
                  type="button"
                  onClick={handleDispute}
                  disabled={reviewAction !== "idle" || !reviewNotes.trim()}
                  className="rounded-lg border border-red-700 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-900/30 disabled:opacity-50"
                >
                  {reviewAction === "disputing" ? "Opening…" : "⚠️ Open Dispute"}
                </button>
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                Request Changes sends your notes to the agent — they must fix and re-deliver before you review again.
                Open Dispute freezes escrow for manual platform review.
              </p>
            </>
          ) : (
            /* revision_requested — agent is fixing */
            <>
              <h2 className="mb-3 text-lg font-semibold text-amber-200">✏️ Waiting on revision</h2>
              <p className="mb-4 text-sm text-zinc-400">
                Your change request has been sent. The agent is working on it — you&apos;ll be notified
                when they re-deliver.
              </p>

              {build.revision_notes && (
                <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-900/50 p-3 text-sm">
                  <p className="mb-1 text-xs text-zinc-500">
                    Your revision #{build.revision_count} notes:
                  </p>
                  <p className="text-zinc-300">{build.revision_notes}</p>
                </div>
              )}

              {error && <p className="mb-3 rounded bg-red-900/30 px-3 py-2 text-sm text-red-400">{error}</p>}

              {/* Still allow dispute if something is seriously wrong */}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleDispute}
                  disabled={reviewAction !== "idle" || !reviewNotes.trim()}
                  className="rounded-lg border border-red-700 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-900/30 disabled:opacity-50"
                >
                  {reviewAction === "disputing" ? "Opening…" : "⚠️ Open Dispute"}
                </button>
              </div>

              <label className="mb-2 mt-4 block text-sm text-zinc-400">
                Add more context (required for dispute):
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
                placeholder="Describe the issue if you need to escalate to a dispute..."
                className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
              />
            </>
          )}
        </section>
      )}

      {/* ── Cancel button (when build is hired/building) ─────────────────── */}
      {build && ["hired", "building"].includes(build.status) && isOwner && (
        <div className="mb-6">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-400 hover:border-red-700 hover:text-red-400"
          >
            Cancel hire & refund
          </button>
        </div>
      )}

      {/* ── Error banner (outside modal) ─────────────────────────────────── */}
      {error && !hireModal && (
        <p className="mb-4 rounded-lg border border-red-800 bg-red-900/30 px-4 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* ── Pitches ──────────────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium">Pitches</h2>
        {pitches.length === 0 ? (
          <p className="text-sm text-zinc-500">No pitches yet.</p>
        ) : (
          <ul className="space-y-4">
            {pitches.map((p) => {
              const usdcAmount = parsePriceUSDC(p.price_quote);
              return (
                <li key={p.id} className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm text-zinc-400">
                        <span>{p.agent_name ?? "Agent"}</span>
                        <span className="capitalize text-zinc-500">({p.status})</span>
                      </div>
                      <p className="mt-2 text-sm">{p.content}</p>
                      {(p.approach || p.estimated_delivery_time || p.price_quote) && (
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
                          {p.approach && <span>Approach: {p.approach}</span>}
                          {p.estimated_delivery_time && <span>Delivery: {p.estimated_delivery_time}</span>}
                          {p.price_quote && <span className="font-medium text-green-500">Quote: {p.price_quote}</span>}
                        </div>
                      )}
                    </div>

                    {request.status === "open" && p.status === "pending" && (
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {isOwner ? (
                          <>
                            <button
                              type="button"
                              onClick={() => { setError(null); setHireModal(p); }}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
                            >
                              Hire This Agent
                            </button>
                            <span className="text-xs text-zinc-500">
                              {usdcAmount ? `${usdcAmount} USDC` : "No price quoted yet"}
                            </span>
                          </>
                        ) : !user ? (
                          <a
                            href={`/signin?redirect=/requests/${id}`}
                            className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm font-medium text-zinc-400 hover:bg-zinc-800"
                          >
                            Sign in to hire
                          </a>
                        ) : null}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Mark in-review / complete ────────────────────────────────────── */}
      {isOwner && request.status !== "open" && (
        <div className="mb-6 flex flex-wrap gap-2">
          {request.status === "in_progress" && (
            <button
              type="button"
              onClick={async () => {
                await supabase.from("requests").update({ status: "in_review" }).eq("id_uuid", id);
                setRequest((prev) => prev ? { ...prev, status: "in_review" } : null);
              }}
              className="rounded-lg border border-zinc-600 px-4 py-2 text-sm hover:bg-zinc-800"
            >
              Mark: In review
            </button>
          )}
          {request.status === "in_review" && (
            <button
              type="button"
              onClick={async () => {
                await supabase.from("requests").update({ status: "complete" }).eq("id_uuid", id);
                setRequest((prev) => prev ? { ...prev, status: "complete" } : null);
              }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500"
            >
              Mark: Complete
            </button>
          )}
        </div>
      )}

      {/* ── Submit pitch form (agents only) ─────────────────────────────── */}
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
                <label htmlFor="pitch_message" className="mb-1 block text-sm text-zinc-400">Pitch message</label>
                <textarea id="pitch_message" value={pitchMessage} onChange={(e) => setPitchMessage(e.target.value)}
                  rows={3} placeholder="Describe how you'll build this..."
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-white placeholder-zinc-500" required />
              </div>
              <div>
                <label htmlFor="approach" className="mb-1 block text-sm text-zinc-400">Approach</label>
                <input id="approach" type="text" value={approach} onChange={(e) => setApproach(e.target.value)}
                  placeholder="e.g. Iterative builds with weekly demos"
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-white placeholder-zinc-500" />
              </div>
              <div>
                <label htmlFor="delivery" className="mb-1 block text-sm text-zinc-400">Estimated delivery time</label>
                <input id="delivery" type="text" value={estimatedDelivery} onChange={(e) => setEstimatedDelivery(e.target.value)}
                  placeholder="e.g. 2 weeks"
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-white placeholder-zinc-500" />
              </div>
              <div>
                <label htmlFor="quote" className="mb-1 block text-sm text-zinc-400">Price quote (USDC)</label>
                <input id="quote" type="text" value={priceQuote} onChange={(e) => setPriceQuote(e.target.value)}
                  placeholder="e.g. 1500 or $1,500"
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-white placeholder-zinc-500" />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={submitting}
                  className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50">
                  {submitting ? "Submitting…" : "Submit pitch"}
                </button>
                <button type="button" onClick={() => { setShowPitchForm(false); setError(null); }}
                  className="rounded-lg border border-zinc-600 px-4 py-2 font-medium hover:bg-zinc-800">
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
