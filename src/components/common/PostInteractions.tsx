"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Send, ThumbsUp, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useT } from "@/i18n/client";
import type { TFunction } from "@/i18n/translate";
import { getSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { SocialUser } from "@/types/social";

type ReactionRow = { id: string; kind: string; user_id: string };
type CommentRow = {
  id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
};

/**
 * Likes and threaded comments for a space post, backed by the
 * 20261115000004_social_interactions migration. If that migration has not
 * run yet (older database), the queries fail and the whole block hides
 * itself instead of breaking the feed.
 */
export function PostInteractions({
  postId,
  users,
  meId,
}: {
  postId: string;
  users: Record<string, SocialUser>;
  meId: string;
}) {
  const t = useT();
  const [available, setAvailable] = useState(true);
  const [reactions, setReactions] = useState<ReactionRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Fetchers return data (or null on failure) instead of setting state, so the
  // mount effects below stay free of synchronous setState calls.
  const fetchReactions = useCallback(
    async (id: string): Promise<ReactionRow[] | null> => {
      const { data, error } = await getSupabase()
        .from("post_reactions")
        .select("id,kind,user_id")
        .eq("post_id", id);
      if (error) return null;
      return (data ?? []) as ReactionRow[];
    },
    [],
  );

  const fetchComments = useCallback(
    async (id: string): Promise<CommentRow[] | null> => {
      const { data, error } = await getSupabase()
        .from("post_comments")
        .select("id,author_id,parent_id,body,created_at")
        .eq("post_id", id)
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) return null;
      return (data ?? []) as CommentRow[];
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void fetchReactions(postId).then((rows) => {
      if (cancelled) return;
      if (rows === null) setAvailable(false);
      else setReactions(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [postId, fetchReactions]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchComments(postId).then((rows) => {
      if (cancelled) return;
      if (rows === null) setAvailable(false);
      else setComments(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open, postId, fetchComments]);

  if (!available) return null;

  const likedByMe = meId !== "" && reactions.some((r) => r.user_id === meId && r.kind === "like");
  const topLevel = comments.filter((c) => c.parent_id === null);

  function nameOf(authorId: string): string {
    return users[authorId]?.displayName ?? authorId.slice(0, 8);
  }

  async function toggleLike() {
    if (meId === "" || busy) return;
    const mine = reactions.find((r) => r.user_id === meId && r.kind === "like");
    setBusy(true);
    try {
      const supabase = getSupabase();
      if (mine) {
        const { error } = await supabase.from("post_reactions").delete().eq("id", mine.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("post_reactions").insert({ post_id: postId, kind: "like" });
        if (error) throw error;
      }
      const rows = await fetchReactions(postId);
      if (rows !== null) setReactions(rows);
    } catch {
      /* the next refresh reconciles; keep the feed usable */
    } finally {
      setBusy(false);
    }
  }

  async function submitComment() {
    if (meId === "" || busy || draft.trim().length === 0) return;
    setBusy(true);
    try {
      const supabase = getSupabase();
      const { error } = await supabase.from("post_comments").insert({
        post_id: postId,
        parent_id: replyTo,
        body: draft.trim(),
      });
      if (error) throw error;
      setDraft("");
      setReplyTo(null);
      const rows = await fetchComments(postId);
      if (rows !== null) setComments(rows);
    } catch {
      /* keep the composer open on failure */
    } finally {
      setBusy(false);
    }
  }

  async function removeComment(id: string) {
    const supabase = getSupabase();
    const { error } = await supabase.from("post_comments").delete().eq("id", id);
    if (!error) {
      const rows = await fetchComments(postId);
      if (rows !== null) setComments(rows);
    }
  }

  return (
    <div className="mt-1 border-t border-cova-line px-1 pt-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => void toggleLike()}
          disabled={meId === ""}
          aria-pressed={likedByMe}
          aria-label={t("interact.like")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm",
            likedByMe
              ? "font-medium text-cova-ink"
              : "text-cova-mute hover:bg-cova-pale hover:text-cova-ink",
          )}
        >
          <ThumbsUp className={cn("h-4.5 w-4.5", likedByMe && "fill-current")} aria-hidden="true" />
          {reactions.length > 0 && <span>{reactions.length}</span>}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-cova-mute hover:bg-cova-pale hover:text-cova-ink"
        >
          <MessageCircle className="h-4.5 w-4.5" aria-hidden="true" />
          {topLevel.length > 0 && <span>{topLevel.length}</span>}
        </button>
      </div>

      {open && (
        <div className="mt-2 space-y-2 border-t border-cova-line pt-2">
          {topLevel.length === 0 && (
            <p className="text-xs text-cova-mute">{t("interact.empty")}</p>
          )}
          {topLevel.map((comment) => {
            const replies = comments.filter((c) => c.parent_id === comment.id);
            return (
              <div key={comment.id} className="space-y-1">
                <CommentBubble
                  comment={comment}
                  nameOf={nameOf}
                  meId={meId}
                  t={t}
                  onReply={() => {
                    setReplyTo(comment.id);
                    setDraft("");
                  }}
                  onDelete={() => void removeComment(comment.id)}
                />
                {replies.map((reply) => (
                  <div key={reply.id} className="ml-6">
                    <CommentBubble
                      comment={reply}
                      nameOf={nameOf}
                      meId={meId}
                      t={t}
                      onReply={() => {
                        setReplyTo(comment.id);
                        setDraft("");
                      }}
                      onDelete={() => void removeComment(reply.id)}
                    />
                  </div>
                ))}
              </div>
            );
          })}

          {meId !== "" ? (
            replyTo ? (
              <div className="flex items-center justify-between rounded-lg bg-cova-pale px-3 py-1.5 text-xs text-cova-mute">
                <span>
                  {t("interact.replyingTo", { name: nameOf(comments.find((c) => c.id === replyTo)?.author_id ?? "") })}
                </span>
                <button type="button" onClick={() => setReplyTo(null)} aria-label={t("dm.cancel")}>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ) : null
          ) : null}

          {meId !== "" && (
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                maxLength={1000}
                rows={1}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t("interact.addComment")}
                aria-label={t("interact.addComment")}
                className="min-h-10 flex-1 rounded-lg border border-cova-line px-3 py-2 text-sm"
              />
              <Button
                onClick={() => void submitComment()}
                disabled={busy || draft.trim().length === 0}
                aria-label={t("interact.send")}
              >
                <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CommentBubble({
  comment,
  nameOf,
  meId,
  t,
  onReply,
  onDelete,
}: {
  comment: CommentRow;
  nameOf: (id: string) => string;
  meId: string;
  t: TFunction;
  onReply: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-2xl bg-cova-pale px-3 py-2">
      <p className="text-xs text-cova-mute">
        <span className="font-medium text-cova-ink">
          {comment.author_id === meId ? t("groupDetail.you") : nameOf(comment.author_id)}
        </span>
        {" · "}
        {new Date(comment.created_at).toLocaleString(undefined, {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
      <p className="mt-0.5 whitespace-pre-line break-words text-sm">{comment.body}</p>
      <div className="mt-1 flex items-center gap-3 text-xs text-cova-mute">
        <button type="button" className="hover:underline" onClick={onReply}>
          {t("interact.reply")}
        </button>
        {comment.author_id === meId && (
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:underline"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
            {t("interact.delete")}
          </button>
        )}
      </div>
    </div>
  );
}
