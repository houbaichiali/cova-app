"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ShieldOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { useUserSettings } from "@/lib/user-settings";

/**
 * Account actions: password change (the current password is verified by
 * re-authenticating), temporary deactivation and permanent deletion.
 * Deletion runs in the delete-account Edge Function with the service role;
 * the browser only ever sends the user's own access token.
 */
export function AccountPanel() {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const { update } = useUserSettings();

  // --- password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changing, setChanging] = useState(false);

  // --- deactivate / delete
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [formKey, setFormKey] = useState(0);

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8) {
      toast.push(t("settings.passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.push(t("settings.passwordMismatch"));
      return;
    }
    setChanging(true);
    try {
      const supabase = getSupabase();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user?.email) {
        toast.push(t("settings.passwordError"));
        return;
      }
      // Supabase has no "verify password" call: re-authenticating checks it.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: userData.user.email,
        password: currentPassword,
      });
      if (verifyError) {
        toast.push(t("settings.wrongCurrentPassword"));
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast.push(error.message || t("settings.passwordError"));
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFormKey((key) => key + 1);
      toast.push(t("settings.passwordChanged"));
    } finally {
      setChanging(false);
    }
  }

  async function deactivate() {
    setDeactivating(true);
    try {
      const { error } = await getSupabase().rpc("deactivate_own_account");
      if (error) {
        toast.push(error.message);
        return;
      }
      update({ deactivated: true });
      setDeactivateOpen(false);
      toast.push(t("settings.deactivated"));
    } finally {
      setDeactivating(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        toast.push(t("settings.deleteError"));
        return;
      }
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.status === 404 || response.status === 501) {
        toast.push(t("settings.deleteNotConfigured"));
        return;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.push(body?.error || t("settings.deleteError"));
        return;
      }
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } catch {
      toast.push(t("settings.deleteError"));
    } finally {
      setDeleting(false);
    }
  }

  const inputClass =
    "h-10 w-full rounded-lg border border-cova-line bg-white px-3 text-sm text-cova-ink placeholder:text-cova-mute";

  return (
    <div className="space-y-6">
      <form onSubmit={changePassword} className="space-y-3" key={formKey}>
        <p className="text-sm font-medium">{t("settings.password")}</p>
        <p className="text-sm text-cova-mute">{t("settings.passwordDesc")}</p>
        <input
          type="password"
          autoComplete="current-password"
          placeholder={t("settings.currentPassword")}
          aria-label={t("settings.currentPassword")}
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
          className={inputClass}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="password"
            autoComplete="new-password"
            placeholder={t("settings.newPassword")}
            aria-label={t("settings.newPassword")}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            minLength={8}
            className={inputClass}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder={t("settings.confirmPassword")}
            aria-label={t("settings.confirmPassword")}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            minLength={8}
            className={inputClass}
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={changing}>
            {changing ? t("settings.saving") : t("settings.save")}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-3 border-t border-cova-line pt-5 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={() => setDeactivateOpen(true)}>
          <ShieldOff className="h-4 w-4" aria-hidden="true" /> {t("settings.deactivate")}
        </Button>
        <Button
          variant="secondary"
          className="text-red-800 hover:bg-red-50"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" /> {t("settings.delete")}
        </Button>
      </div>

      <Modal
        open={deactivateOpen}
        onClose={() => setDeactivateOpen(false)}
        title={t("settings.deactivateConfirmTitle")}
        description={t("settings.deactivateConfirmBody")}
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeactivateOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void deactivate()} disabled={deactivating}>
            {deactivating ? t("settings.saving") : t("settings.deactivateAction")}
          </Button>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t("settings.deleteConfirmTitle")}
        description={t("settings.deleteConfirmBody")}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (deleteConfirmText === "DELETE") void deleteAccount();
          }}
        >
          <TextField
            id="delete-confirm"
            label={t("settings.deleteTypeHint")}
            value={deleteConfirmText}
            onChange={(event) => setDeleteConfirmText(event.target.value)}
            placeholder="DELETE"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={deleteConfirmText !== "DELETE" || deleting}
              className="bg-red-700 text-white hover:bg-red-800"
            >
              {deleting ? t("settings.saving") : t("settings.deleteAction")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
