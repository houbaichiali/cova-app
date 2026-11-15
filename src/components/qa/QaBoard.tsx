"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleDot, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { TextAreaField, TextField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { friendsOf, socialActions, useMe, useSocial } from "@/lib/social-store";

type QaQuestion = {
  id: string;
  title: string;
  body: string;
  subject: string;
  status: string;
  created_at: string;
  author: { display_name: string | null; user_code: string | null } | null;
};

type CollabRow = {
  id: string;
  requester_id: string;
  target_id: string;
  kind: string;
  status: string;
  message: string;
  requester: { display_name: string | null; user_code: string | null } | null;
  target: { display_name: string | null; user_code: string | null } | null;
};

const SUBJECTS = ["general", "math", "programming", "languages", "science"] as const;

const SUBJECT_KEYS = {
  general: "qa.subject_general",
  math: "qa.subject_math",
  programming: "qa.subject_programming",
  languages: "qa.subject_languages",
  science: "qa.subject_science",
} as const;

export function QaBoard() {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const social = useSocial();
  const me = useMe();
  const [tab, setTab] = useState<"questions" | "partners">("questions");
  const [questions, setQuestions] = useState<QaQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState<(typeof SUBJECTS)[number]>("general");
  const [busy, setBusy] = useState(false);

  const fetchQuestions = useCallback(async (): Promise<QaQuestion[] | null> => {
    const { data, error } = await getSupabase()
      .from("qa_questions")
      .select("id,title,body,subject,status,created_at,author:profiles(display_name,user_code)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return null;
    return (data ?? []) as unknown as QaQuestion[];
  }, []);

  useEffect(() => {
    if (!social.ready) return;
    let cancelled = false;
    void fetchQuestions().then((rows) => {
      if (cancelled) return;
      if (rows === null) {
        setUnavailable(true);
        setQuestions([]);
      } else {
        setQuestions(rows);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [social.ready, fetchQuestions]);

  async function ask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || title.trim().length < 5) return;
    setBusy(true);
    try {
      const { data, error } = await getSupabase()
        .from("qa_questions")
        .insert({ title: title.trim(), body: body.trim(), subject })
        .select("id")
        .single();
      if (error) throw error;
      setTitle("");
      setBody("");
      const newId = (data as { id: string } | null)?.id;
      if (newId) router.push(`/qa/${newId}`);
    } catch (err) {
      toast.push(err instanceof Error && err.message ? err.message : t("qa.error"));
      setBusy(false);
    }
  }

  if (!social.ready || loading) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4">
        <PageHeader title={t("qa.title")} />
        <p className="text-sm text-cova-mute">{t("common.loading")}…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-4">
      <PageHeader title={t("qa.title")} description={t("qa.desc")} />
      <Tabs
        tabs={["questions", "partners"] as const}
        value={tab}
        onChange={(id) => setTab(id)}
        label={t("qa.title")}
        labels={{ questions: t("qa.tabQuestions"), partners: t("collab.title") }}
      />

      {tab === "questions" ? (
        <div className="mt-4 space-y-4">
          {me ? (
            <Card>
              <CardHeader title={t("qa.ask")} />
              <CardBody>
                <form onSubmit={ask} className="space-y-3">
                  <TextField
                    id="qa-title"
                    label={t("qa.questionTitle")}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <TextAreaField
                    id="qa-body"
                    label={t("qa.details")}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">{t("qa.subject")}</span>
                    <select
                      value={subject}
                      onChange={(e) => setSubject(e.target.value as (typeof SUBJECTS)[number])}
                      className="w-full rounded-lg border border-cova-line bg-white px-3 py-2 text-sm dark:bg-cova-ink"
                    >
                      {SUBJECTS.map((s) => (
                        <option key={s} value={s}>
                          {t(SUBJECT_KEYS[s])}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex justify-end">
                    <Button type="submit" disabled={busy || title.trim().length < 5}>
                      <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
                      {t("qa.submitQuestion")}
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>
          ) : (
            <p className="rounded-lg bg-cova-pale px-4 py-3 text-sm">{t("notif.signin")}</p>
          )}

          {questions.length === 0 ? (
            <Card>
              <CardBody className="py-10 text-center text-sm text-cova-mute">
                {unavailable ? t("qa.unavailable") : t("qa.empty")}
              </CardBody>
            </Card>
          ) : (
            questions.map((q) => (
              <Card key={q.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/qa/${q.id}`} className="font-semibold hover:underline">
                      {q.title}
                    </Link>
                    {q.status === "resolved" ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {t("qa.resolved")}
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-cova-pale px-2.5 py-0.5 text-xs font-medium text-cova-mute">
                        <CircleDot className="h-3.5 w-3.5" aria-hidden="true" />
                        {t("qa.open")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-cova-mute">{q.body}</p>
                  <p className="mt-1.5 text-xs text-cova-mute">
                    {q.author?.display_name ?? "—"} · {t(SUBJECT_KEYS[q.subject as keyof typeof SUBJECT_KEYS] ?? "qa.subject_general")}
                  </p>
                </CardBody>
              </Card>
            ))
          )}
        </div>
      ) : (
        <PartnersTab />
      )}
    </div>
  );
}

function PartnersTab() {
  const t = useT();
  const toast = useToast();
  const social = useSocial();
  const me = useMe();
  const [incoming, setIncoming] = useState<CollabRow[]>([]);
  const [sent, setSent] = useState<CollabRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async (): Promise<{ incoming: CollabRow[]; sent: CollabRow[] } | null> => {
    if (!social.meId) return { incoming: [], sent: [] };
    const { data, error } = await getSupabase()
      .from("collab_requests")
      .select(
        "id,requester_id,target_id,kind,status,message," +
          "requester:profiles!collab_requests_requester_id_fkey(display_name,user_code)," +
          "target:profiles!collab_requests_target_id_fkey(display_name,user_code)",
      )
      .or(`requester_id.eq.${social.meId},target_id.eq.${social.meId}`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return null;
    const rows = (data ?? []) as unknown as CollabRow[];
    return {
      incoming: rows.filter((r) => r.target_id === social.meId),
      sent: rows.filter((r) => r.requester_id === social.meId),
    };
  }, [social.meId]);

  useEffect(() => {
    if (!social.ready) return;
    let cancelled = false;
    void fetchRequests().then((result) => {
      if (cancelled) return;
      if (result === null) {
        setLoading(false);
        return;
      }
      setIncoming(result.incoming);
      setSent(result.sent);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [social.ready, fetchRequests]);

  async function decide(id: string, status: "accepted" | "declined") {
    const { error } = await getSupabase()
      .from("collab_requests")
      .update({ status })
      .eq("id", id)
      .eq("target_id", social.meId ?? "");
    if (error) {
      toast.push(error.message);
      return;
    }
    const fresh = await fetchRequests();
    if (fresh) {
      setIncoming(fresh.incoming);
      setSent(fresh.sent);
    }
  }

  async function cancel(id: string) {
    const { error } = await getSupabase().from("collab_requests").delete().eq("id", id);
    if (error) {
      toast.push(error.message);
      return;
    }
    const fresh = await fetchRequests();
    if (fresh) setSent(fresh.sent);
  }

  async function invite(targetId: string, kind: "study_partner" | "mentor") {
    const result = await socialActions.requestCollab(targetId, kind);
    toast.push(result.ok ? t("collab.requestSent") : (result.error ?? ""));
    if (result.ok) {
      const fresh = await fetchRequests();
      if (fresh) setSent(fresh.sent);
    }
  }

  const friends = me ? friendsOf(social, me.id) : [];
  const nameOf = (row: { requester: CollabRow["requester"]; target: CollabRow["target"] }, side: "requester" | "target") =>
    (side === "requester" ? row.requester?.display_name : row.target?.display_name) ?? "—";

  if (!social.ready || loading) {
    return <p className="mt-4 text-sm text-cova-mute">{t("common.loading")}…</p>;
  }

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader title={t("collab.title")} />
        <CardBody>
          <p className="text-sm text-cova-mute">{t("collab.hint")}</p>
          {friends.length === 0 ? (
            <p className="mt-2 text-sm text-cova-mute">{t("collab.noFriends")}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {friends.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{f.displayName}</span>
                  <span className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void invite(f.id, "study_partner")}
                    >
                      {t("collab.studyPartner")}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void invite(f.id, "mentor")}>
                      {t("collab.mentor")}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("collab.incoming")} />
        <CardBody>
          {incoming.length === 0 ? (
            <p className="text-sm text-cova-mute">{t("collab.none")}</p>
          ) : (
            <ul className="space-y-2">
              {incoming.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{nameOf(r, "requester")}</span>
                    {" · "}
                    {r.kind === "mentor" ? t("collab.mentor") : t("collab.studyPartner")}
                    {r.status !== "pending" && (
                      <span className="ml-2 text-xs text-cova-mute">{r.status}</span>
                    )}
                  </span>
                  {r.status === "pending" && (
                    <span className="flex shrink-0 gap-2">
                      <Button size="sm" onClick={() => void decide(r.id, "accepted")}>
                        {t("collab.accept")}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void decide(r.id, "declined")}>
                        {t("collab.decline")}
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("collab.sent")} />
        <CardBody>
          {sent.length === 0 ? (
            <p className="text-sm text-cova-mute">{t("collab.none")}</p>
          ) : (
            <ul className="space-y-2">
              {sent.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{nameOf(r, "target")}</span>
                    {" · "}
                    {r.kind === "mentor" ? t("collab.mentor") : t("collab.studyPartner")}
                    {" · "}
                    <span className="text-xs text-cova-mute">{r.status}</span>
                  </span>
                  {r.status === "pending" && (
                    <Button size="sm" variant="ghost" onClick={() => void cancel(r.id)}>
                      {t("collab.cancel")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
