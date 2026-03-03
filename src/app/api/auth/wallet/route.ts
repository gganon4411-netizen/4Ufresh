import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import crypto from "crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const WALLET_SECRET = process.env.WALLET_AUTH_SECRET ?? "4u-wallet-auth-fallback-secret";

function derivePassword(publicKey: string): string {
  return crypto.createHmac("sha256", WALLET_SECRET).update(publicKey).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const { publicKey, signature, message } = await req.json() as {
      publicKey: string;
      signature: number[];
      message: string;
    };

    if (!publicKey || !signature || !message) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Verify nonce is within 5 minutes
    const nonceMatch = message.match(/Nonce: (\d+)/);
    if (nonceMatch) {
      const nonce = parseInt(nonceMatch[1]);
      if (Date.now() - nonce > 5 * 60 * 1000) {
        return NextResponse.json({ error: "Sign-in request expired. Please try again." }, { status: 401 });
      }
    }

    // Verify Ed25519 signature
    const msgBytes = new TextEncoder().encode(message);
    const sigBytes = new Uint8Array(signature);
    const pubKeyBytes = bs58.decode(publicKey);

    const valid = ed25519.verify(sigBytes, msgBytes, pubKeyBytes);
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Deterministic email + password from wallet pubkey
    const email = `wallet_${publicKey}@4u.app`;
    const password = derivePassword(publicKey);

    const supabasePublic = createClient(SUPABASE_URL, ANON_KEY);

    // Try sign in first (returning user)
    const { data: signInData, error: signInError } = await supabasePublic.auth.signInWithPassword({
      email,
      password,
    });

    if (!signInError && signInData.session) {
      return NextResponse.json({ session: signInData.session });
    }

    // New user — create account
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { wallet_address: publicKey },
    });

    if (createError) {
      console.error("Create user error:", createError);
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    // Sign in with new account
    const { data: newSession, error: newErr } = await supabasePublic.auth.signInWithPassword({
      email,
      password,
    });

    if (newErr || !newSession.session) {
      return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }

    return NextResponse.json({ session: newSession.session, isNew: true });
  } catch (err) {
    console.error("Wallet auth error:", err);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}
