"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * OAuth / email-link landing (spec Phase 5): supabase-js detects the session
 * in the URL (PKCE code or hash) on load; the page then routes into COVA.
 */
export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/dashboard");
    }, 1200);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-cova-bg text-cova-ink">
      <Loader2 className="h-6 w-6 animate-spin text-cova-muted" aria-hidden="true" />
      <p className="text-sm text-cova-mute">Signing you in…</p>
    </div>
  );
}
