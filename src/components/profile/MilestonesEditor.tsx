"use client";

import { useEffect, useState } from "react";
import { Flag, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SelectFilter, TextAreaField, TextField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";

/**
 * Learning-journey milestones the student adds themselves. The journey also
 * shows real COVA events (joined, badges, first lesson) — these rows are
 * always labeled as student-added, so nothing looks fabricated.
 */

interface MilestoneForm {
  title: string;
  description: string;
  happened_on: string;
  visibility: "public" | "friends" | "private";
}

const EMPTY: MilestoneForm = {
  title: "",
  description: "",
  happened_on: "",
  visibility: "public",
};

export function MilestonesEditor({ onSaved }: { onSaved?: () => void }) {
  const t = useT();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<
    { id: string; title: string; happened_on: string; visibility: string }[] | null
  >(null);
  const [form, setForm] = useState<MilestoneForm>({ ...EMPTY });

  async function load() {
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data } = await supabase
      .from("portfolio_milestones")
      .select("id,title,happened_on,visibility")
      .eq("user_id", auth.user.id)
      .order("happened_on", { ascending: false });
    setItems((data ?? []) as never);
  }

  useEffect(() => {
    void (async () => {
      const supabase = getSupabase();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from("portfolio_milestones")
        .select("id,title,happened_on,visibility")
        .eq("user_id", auth.user.id)
        .order("happened_on", { ascending: false });
      setItems((data ?? []) as never);
    })();
  }, []);

  async function persist() {
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user || form.title.trim().length === 0 || !form.happened_on) return;
    setSaving(true);
    const { error } = await supabase.from("portfolio_milestones").insert({
      user_id: auth.user.id,
      title: form.title.trim().slice(0, 100),
      description: form.description.slice(0, 400),
      happened_on: form.happened_on,
      visibility: form.visibility,
    });
    setSaving(false);
    if (error) {
      toast.push(error.message);
      return;
    }
    setForm({ ...EMPTY });
    setAdding(false);
    await load();
    onSaved?.();
    toast.push(t("profile.milestones.saved"));
  }

  async function remove(id: string) {
    if (!window.confirm(t("profile.milestones.confirmDelete"))) return;
    const { error } = await getSupabase().from("portfolio_milestones").delete().eq("id", id);
    if (error) {
      toast.push(error.message);
      return;
    }
    await load();
    onSaved?.();
  }

  return (
    <Card>
      <CardHeader title={t("profile.milestones.title")} description={t("profile.milestones.hint")} />
      <CardBody className="space-y-3">
        <Button onClick={() => setAdding(!adding)}>
          <Plus className="h-4 w-4" aria-hidden="true" /> {t("profile.milestones.add")}
        </Button>
        {adding && (
          <div className="space-y-3 rounded-lg border border-cova-line p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                id="milestone-title"
                label={t("profile.milestones.name")}
                value={form.title}
                maxLength={100}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
              <TextField
                id="milestone-date"
                label={t("profile.milestones.date")}
                type="date"
                value={form.happened_on}
                onChange={(event) => setForm({ ...form, happened_on: event.target.value })}
              />
            </div>
            <TextAreaField
              id="milestone-description"
              label={t("profile.milestones.description")}
              value={form.description}
              rows={2}
              maxLength={400}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
            <SelectFilter
              id="milestone-visibility"
              label={t("profile.privacy.label")}
              options={[
                { value: "public", label: t("profile.privacy.public") },
                { value: "friends", label: t("profile.privacy.friends") },
                { value: "private", label: t("profile.privacy.private") },
              ]}
              value={form.visibility}
              onChange={(event) =>
                setForm({ ...form, visibility: event.target.value as MilestoneForm["visibility"] })
              }
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAdding(false)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={() => void persist()} disabled={saving || form.title.trim().length === 0 || !form.happened_on}>
                <Flag className="h-4 w-4" aria-hidden="true" /> {t("portfolio.manager.save")}
              </Button>
            </div>
          </div>
        )}
        {items === null ? null : items.length === 0 ? (
          <p className="text-sm text-cova-mute">{t("profile.milestones.empty")}</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-cova-line bg-white px-3 py-1.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  <span className="text-xs text-cova-mute">
                    {item.happened_on} · {item.visibility}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={t("profile.milestones.delete")}
                  onClick={() => void remove(item.id)}
                  className="rounded p-1.5 text-cova-mute hover:bg-cova-pale"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
