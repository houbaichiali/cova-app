"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUp, BadgeCheck, Check, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { TextAreaField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { socialActions, useMe, useSocial } from "@/lib/social-store";

type QaQuestion = {
  id: string;
  title: string;
  body: string;
  subject: string;
  status: string;
  created_at: string;
  author: { display_name: string | null; user_code: string | null } | null;
};

type QaAnswer = {
  id: string;
  author_id: string;
  body: string;
  is_best: boolean;
  created_at: string;
  author: { display_name: string | null; user_code: string | null } | null;
};

type VoteRow = { target_type: string; target_id: string; user_id: string; value: number };

export function QaDetail({ questionId }: { questionId: string }) {
  const t = useT();
  const toast = useToast();
  const social = useSocial();
  const me = useMe();
  const [question, setQuestion] = useState<QaQuestion | null>(null);
  const [answers, setAnswers] = useState<QaAnswer[]>([]);
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [myVoteIds, setMyVoteIds] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  const fetchAll = useCallback(async (): Promise<
    { question: QaQuestion | null; answers: QaAnswer[]; votes: VoteRow[] } | null
  > => {
    const questionQ = getSupabase()
      .from("qa_questions")
      .select("id,title,body,subject,status,created_at,author:profiles(display_name,user_code)")
      .eq("id", questionId)
      .maybeSingle();
    const answersQ = getSupabase()
      .from("qa_answers")
      .select("id,author_id,body,is_best,created_at,author:profiles(display_name,user_code)")
      .eq("question_id", questionId)
      .order("created_at", { ascending: true });
    const [questionRes, answersRes] = await Promise.all([questionQ, answersQ]);
    if (questionRes.error || answersRes.error) return null;
    const q = questionRes.data as unknown as QaQuestion | null;
    if (!q) return { question: null, answers: [], votes: [] };
    const rows = (answersRes.data ?? []) as unknown as QaAnswer[];
    const ids = [questionId, ...rows.map((a) => a.id)];
    const votesRes = await getSupabase()
      .from("qa_votes")
      .select("target_type,target_id,user_id,value")
      .in("target_id", ids);
    if (votesRes.error) return null;
    return { question: q, answers: rows, votes: (votesRes.data ?? []) as VoteRow[] };
  }, [questionId]);

  useEffect(() => {
    if (!social.ready) return;
    let cancelled = false;
    void Promise.all([fetchAll(), socialActions.qaMyVotes()]).then(([result, mine]) => {
      if (cancelled) return;
      if (result === null) {
        setMissing(true);
        setLoading(false);
        return;
      }
      setQuestion(result.question);
      setAnswers(result.answers);
      setVotes(result.votes);
      if (mine.ok) setMyVoteIds(mine.value);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [social.ready, fetchAll]);

  function score(targetId: string): number {
    return votes
      .filter((v) => v.target_id === targetId)
      .reduce((sum, v) => sum + v.value, 0);
  }

  function voted(targetId: string): boolean {
    return myVoteIds.includes(targetId);
  }

  function refetch(result: Awaited<ReturnType<typeof fetchAll>>) {
    if (result) {
      setQuestion(result.question);
      setAnswers(result.answers);
      setVotes(result.votes);
    }
  }

  async function vote(targetType: "question" | "answer", targetId: string) {
    if (!social.meId || busy) return;
    setBusy(true);
    try {
      const result = await socialActions.qaVote(targetType, targetId);
      if (!result.ok) {
        toast.push(result.error);
        return;
      }
      refetch(await fetchAll());
      const mine = await socialActions.qaMyVotes();
      if (mine.ok) setMyVoteIds(mine.value);
    } finally {
      setBusy(false);
    }
  }

  async function answer() {
    if (!social.meId || busy || draft.trim().length === 0) return;
    setBusy(true);
    try {
      const { error } = await getSupabase()
        .from("qa_answers")
        .insert({ question_id: questionId, body: draft.trim() });
      if (error) {
        toast.push(error.message);
        return;
      }
      setDraft("");
      refetch(await fetchAll());
    } finally {
      setBusy(false);
    }
  }

  async function acceptBest(answerId: string) {
    const { error } = await getSupabase().rpc("qa_select_best_answer", { p_answer: answerId });
    if (error) {
      toast.push(error.message);
      return;
    }
    refetch(await fetchAll());
  }

  if (!social.ready || loading) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4">
        <PageHeader title={t("qa.title")} />
        <p className="text-sm text-cova-mute">{t("common.loading")}…</p>
      </div>
    );
  }

  if (missing || !question) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4">
        <PageHeader title={t("qa.title")} />
        <Card>
          <CardBody className="py-10 text-center text-sm text-cova-mute">
            {missing ? t("qa.unavailable") : t("qa.notFound")}
          </CardBody>
        </Card>
      </div>
    );
  }

  const isAuthor = !!me && question.author?.user_code === me.id;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
      <Link href="/qa" className="inline-flex items-center gap-1.5 text-sm text-cova-mute hover:underline">
        <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
        {t("qa.back")}
      </Link>

      <PageHeader title={question.title} description={t("qa.by", { name: question.author?.display_name ?? "—" })} />
      {question.body && <p className="whitespace-pre-line break-words text-sm">{question.body}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void vote("question", questionId)}
          disabled={!social.meId || busy}
          aria-pressed={voted(questionId)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-cova-mute hover:bg-cova-pale hover:text-cova-ink"
        >
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
          {score(questionId)}
        </button>
        <span className="text-xs text-cova-mute">
          {question.status === "resolved" ? t("qa.resolved") : t("qa.open")}
        </span>
      </div>

      <h2 className="pt-2 text-lg font-semibold">
        {t("qa.answers", { count: answers.length })}
      </h2>
      {answers.length === 0 && <p className="text-sm text-cova-mute">{t("qa.noAnswers")}</p>}
      {answers.map((a) => (
        <Card key={a.id} className={a.is_best ? "border-emerald-400" : undefined}>
          <CardBody>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-cova-mute">
                  {a.author?.display_name ?? "—"} ·{" "}
                  {new Date(a.created_at).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
                <p className="mt-1 whitespace-pre-line break-words text-sm">{a.body}</p>
              </div>
              <div className="flex shrink-0 flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => void vote("answer", a.id)}
                  disabled={!social.meId || busy}
                  aria-pressed={voted(a.id)}
                  aria-label={t("qa.vote")}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-cova-mute hover:bg-cova-pale hover:text-cova-ink"
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  {score(a.id)}
                </button>
                {a.is_best && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                    <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                    {t("qa.best")}
                  </span>
                )}
                {isAuthor && !a.is_best && (
                  <button
                    type="button"
                    onClick={() => void acceptBest(a.id)}
                    className="inline-flex items-center gap-1 text-xs text-cova-mute hover:underline"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("qa.accept")}
                  </button>
                )}
              </div>
            </div>
          </CardBody>
        </Card>
      ))}

      {me ? (
        <Card>
          <CardBody className="space-y-3">
            <TextAreaField
              id="qa-answer"
              label={t("qa.yourAnswer")}
              value={draft}
              maxLength={1000}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="flex justify-end">
              <Button onClick={() => void answer()} disabled={busy || draft.trim().length === 0}>
                <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
                {t("qa.sendAnswer")}
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <p className="rounded-lg bg-cova-pale px-4 py-3 text-sm">{t("notif.signin")}</p>
      )}
    </div>
  );
}
