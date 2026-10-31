"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { useUserSettings } from "@/lib/user-settings";

/**
 * Blocks the app while the signed-in account is deactivated and offers the way
 * back. Shown on top of every signed-in page.
 */
export function DeactivatedGate() {
  const { settings, update } = useUserSettings();
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!settings.loaded || !settings.deactivated) return null;

  async function reactivate() {
    setBusy(true);
    try {
      const { error } = await getSupabase().rpc("reactivate_own_account");
      if (error) return;
      update({ deactivated: false });
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await getSupabase().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-cova-bg p-6">
      <Card className="w-full max-w-md">
        <CardBody className="flex flex-col items-center gap-4 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-cova-pale">
            <ShieldOff className="h-6 w-6 text-cova-muted" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-semibold">{t("settings.deactivated")}</h1>
            <p className="mt-1 text-sm text-cova-mute">{t("settings.deactivatedBody")}</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void reactivate()} disabled={busy}>
              {busy ? t("settings.saving") : t("settings.reactivate")}
            </Button>
            <Button variant="secondary" onClick={() => void signOut()}>
              {t("user.signOut")}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
