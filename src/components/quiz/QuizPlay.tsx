"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Hourglass } from "lucide-react";
import { AttemptGame } from "@/components/quiz/AttemptGame";
import { LiveGame } from "@/components/quiz/LiveGame";
import { api, getMe } from "@/components/quiz/quiz-client";
import { getSupabase } from "@/lib/supabase/client";
import { useT } from "@/i18n/client";

/**
 * Play router: /quiz/play/[pin]. A PIN can point at
 *  - an open live session  -> real-time multiplayer (SSE),
 *  - a challenge/solo quiz -> a private server-scored attempt,
 *  - nothing               -> helpful error states.
 */
export function QuizPlay({ pin }: { pin: string }) {
  const t = useT();
  const [resolved, setResolved] = useState<
    | { kind: "loading" }
    | { kind: "live" }
    | { kind: "attempt"; mode: "challenge" | "solo" }
    | { kind: "noSession" }
    | { kind: "signedOut" }
    | { kind: "notFound" }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const me = await getMe();
      if (cancelled) return;
      if (!me) {
        setResolved({ kind: "signedOut" });
        return;
      }
      // 1) an open live session for this PIN?
      const session = await api<{ state?: unknown }>(`/api/quiz/session/${pin}`);
      if (cancelled) return;
      if (session.ok) {
        setResolved({ kind: "live" });
        return;
      }
      // 2) a saved challenge/solo quiz behind this PIN?
      const { data, error } = await getSupabase().rpc("quiz_pin_lookup", { p_pin: pin });
      if (cancelled) return;
      const row = (Array.isArray(data) ? data[0] : data) as { mode: string } | undefined;
      if (!error && row && (row.mode === "challenge" || row.mode === "solo")) {
        setResolved({ kind: "attempt", mode: row.mode as "challenge" | "solo" });
        return;
      }
      if (!error && row) setResolved({ kind: "noSession" });
      else setResolved({ kind: "notFound" });
    })();
    return () => {
      cancelled = true;
    };
  }, [pin]);

  if (resolved.kind === "loading") {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-8 w-2/3 animate-pulse rounded-lg bg-cova-pale" />
        <div className="h-40 animate-pulse rounded-xl bg-cova-pale" />
      </div>
    );
  }
  if (resolved.kind === "signedOut") {
    // LiveGame renders the sign-in empty state for every game type.
    return <LiveGame pin={pin} />;
  }
  if (resolved.kind === "live") return <LiveGame pin={pin} />;
  if (resolved.kind === "attempt") return <AttemptGame pin={pin} mode={resolved.mode} />;
  if (resolved.kind === "noSession") {
    return (
      <EmptyState
        icon={Hourglass}
        title={t("quiz.noLiveSession")}
        description={t("quiz.waitingForHost")}
      />
    );
  }
  return (
    <EmptyState
      icon={Hourglass}
      title={t("quiz.errorNotFound")}
      description={t("quiz.joinDescription")}
    />
  );
}
