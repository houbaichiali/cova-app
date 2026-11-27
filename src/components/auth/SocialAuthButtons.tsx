"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useT } from "@/i18n/client";
import { SOCIAL_PROVIDERS, authActions, type SocialProvider } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/client";

/**
 * Real OAuth sign-in (spec Phase 5.2 + 5.5): only the providers the owner has
 * enabled (platform_settings via the public auth_providers_visible RPC) are
 * rendered. No secret lives in this file; until real credentials exist in
 * Supabase Auth, clicking a provider surfaces a clear, honest message instead
 * of pretending the flow works.
 */
export function SocialAuthButtons({ onError }: { onError?: (message: string) => void }) {
  const t = useT();
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [visible, setVisible] = useState<SocialProvider[] | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error } = await getSupabase().rpc("auth_providers_visible");
      if (error || !data) {
        setVisible([]);
        return;
      }
      const enabled = SOCIAL_PROVIDERS.filter(
        (provider) => (data as Record<string, boolean>)[provider.id] === true,
      ).map((provider) => provider.id);
      setVisible(enabled);
    })();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial visibility fetch
  }, []);

  async function signIn(provider: SocialProvider) {
    setBusy(provider);
    const result = await authActions.signInWithProvider(provider);
    setBusy(null);
    if (!result.ok) {
      const notConfigured = /provider/i.test(result.error) || /unsupported|not enabled|disabled/i.test(result.error);
      const message = notConfigured ? t("auth.social.providerNotConfigured") : result.error;
      if (onError) onError(message);
      else window.alert(message);
    }
    // Success: the browser is redirected to the provider by Supabase.
  }

  // Providers hidden until the owner enables them; nothing renders while the
  // visibility is loading or when none is enabled.
  if (visible === null || visible.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-center text-xs font-medium uppercase tracking-wide text-cova-mute">
        {t("auth.social.title")}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {SOCIAL_PROVIDERS.filter((provider) => visible.includes(provider.id)).map(({ id, label }) => (
          <Button
            key={id}
            type="button"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => void signIn(id)}
          >
            {busy === id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {t("auth.social.continueWith", { provider: label })}
          </Button>
        ))}
      </div>
    </div>
  );
}
