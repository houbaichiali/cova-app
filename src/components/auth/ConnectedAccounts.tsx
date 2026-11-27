"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { SOCIAL_PROVIDERS, authActions } from "@/lib/auth";

interface LinkedRow {
  provider: string;
  email: string | null;
  linkedAt: string | null;
}

/**
 * Account linking (spec 5.4): an identity is attached to the current user only
 * after the OAuth provider itself proves ownership — no account is ever merged
 * on an unverified email match. Unlinking keeps at least the password identity
 * intact (Supabase enforces this server-side; the error is surfaced verbatim).
 */
export function ConnectedAccounts() {
  const t = useT();
  const toast = useToast();
  const [linked, setLinked] = useState<LinkedRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await authActions.linkedIdentities();
    setLinked(result.ok ? result.value : []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional data fetch on mount
    void load();
  }, [load]);

  async function toggle(provider: (typeof SOCIAL_PROVIDERS)[number]["id"], isLinked: boolean) {
    setBusy(provider);
    if (isLinked) {
      const result = await authActions.unlinkIdentity(provider);
      if (!result.ok) toast.push(result.error);
    } else {
      await authActions.linkIdentity(provider);
      // linkIdentity redirects to the provider; the list refreshes on return.
    }
    setBusy(null);
    await load();
  }

  return (
    <div className="space-y-3 border-t border-cova-line pt-5">
      <div>
        <p className="text-sm font-medium">{t("auth.linked.title")}</p>
        <p className="mt-0.5 text-xs text-cova-mute">{t("auth.linked.desc")}</p>
      </div>
      {linked !== null && linked.length === 0 && (
        <p className="text-sm text-cova-mute">{t("auth.linked.none")}</p>
      )}
      <ul className="space-y-2">
        {SOCIAL_PROVIDERS.map(({ id, label }) => {
          const row = linked?.find((item) => item.provider === id);
          return (
            <li
              key={id}
              className="flex items-center justify-between gap-3 rounded-lg border border-cova-line bg-cova-bg px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-cova-ink">{label}</span>
                {row?.email && (
                  <span className="block truncate text-xs text-cova-mute">{row.email}</span>
                )}
              </span>
              {row ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => void toggle(id, true)}
                >
                  <Unlink className="h-4 w-4" aria-hidden="true" />
                  {t("auth.linked.unlink", { provider: label })}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => void toggle(id, false)}
                >
                  <Link2 className="h-4 w-4" aria-hidden="true" />
                  {t("auth.linked.link", { provider: label })}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
