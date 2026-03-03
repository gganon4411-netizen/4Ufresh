"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SignUpRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Pass through any redirect/role params to the wallet sign-in page
    const params = searchParams.toString();
    router.replace(`/signin${params ? `?${params}` : ""}`);
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-zinc-500">Redirecting…</p>
    </main>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-500">Loading…</p>
      </main>
    }>
      <SignUpRedirect />
    </Suspense>
  );
}
