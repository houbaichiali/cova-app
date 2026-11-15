"use client";

import { useCallback, useEffect, useState } from "react";
import { Bookmark, MessageCircle, Send, ThumbsUp, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useT } from "@/i18n/client";
import type { TFunction } from "@/i18n/translate";
import { socialActions, useSocial } from "@/lib/social-store";
import { cn } from "@/lib/utils";
import type { SocialUser } from "@/types/social";

type CommentRow = {
  id: string;
  authorId: string;
  parentId: string | null;
  body: string;
  createdAt: string;
};

/**
 * Likes, bookmarks and threaded comments for a space post, backed by the
 * interactions migrations through social-store actions. If those migrations
 * have not run yet (older database), the block hides itself quietly instead
 * of breaking the feed.
 */
export function PostInteractions({
  postId,
  users,
  meId,
}: {
  postId: string;
  users: Record<string, SocialUser>;
  /** Public COVA code of the signed-in member, or "" when signed out. */
  meId: string;
}) {
  const t = useT();
  const social = useSocial();
  const [available, setAvailable] = useState(true);
  const [likeCount, setLikeCount] = useState(0);
  const [likedByMe, setLikedByMe] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The fetcher returns data instead of setting state, so the mount effect
  // stays free of synchronous setState calls (react-hooks rule).
  const fetchState = useCallback(async (): Promise<{
    likeCount: number;
    likedByMe: boolean;
    bookmarked: boolean;
    comments: CommentRow[];
  } | null> => {
    const result = await socialActions.loadPostInteractions(postId);
    if (!result.ok) return null;
    return result.value;
  }, [postId]);

  useEffect(() => {
    if (!social.ready) return;
    let cancelled = false;
    void fetchState().then((state) => {
      if (cancelled) return;
      if (state === null) {
        setAvailable(false);
        return;
      }
      setLikeCount(state.likeCount);
      setLikedByMe(state.likedByMe);
      setBookmarked(state.bookmarked);
      setComments(state.comments);
    });
    return () => {
      cancelled = true;
    };
  }, [social.ready, fetchState]);

  if (!available) return null;

  const topLevel = comments.filter((c) => c.parentId === null);

  function nameOf(authorId: string): string {
    return users[authorId]?.displayName ?? authorId.slice(0, 8);
  }

  async function toggleLike() {
    if (meId === "" || busy) return;
    setBusy(true);
    try {
      const result = await socialActions.togglePostLike(postId);
      if (!result.ok) return;
      const state = await fetchState();
      if (state) {
        setLikeCount(state.likeCount);
        setLikedByMe(state.likedByMe);
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleBookmark() {
    if (meId === "" || busy) return;
    const next = !bookmarked;
    setBookmarked(next);
    const result = await socialActions.togglePostBookmark(postId, next);
    if (!result.ok) setBookmarked(!next);
  }

  async function submitComment() {
    if (meId === "" || busy || draft.trim().length === 0) return;
    setBusy(true);
    try {
      const result = await socialActions.addPostComment(postId, draft.trim(), replyTo);
      if (!result.ok) return;
      setDraft("");
      setReplyTo(null);
      const state = await fetchState();
      if (state) setComments(state.comments);
    } finally {
      setBusy(false);
    }
  }

  async function removeComment(id: string) {
    const result = await socialActions.deletePostComment(id);
    if (result.ok) {
      const state = await fetchState();
      if (state) setComments(state.comments);
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
          {likeCount > 0 && <span>{likeCount}</span>}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-cova-mute hover:bg-cova-pale hover:text-cova-ink"
        >
          <MessageCircle className="h-4.5 w-4.5" aria-hidden="true" />
          {topLevel.length > 0 && <span>{topLevel.length}</span>}
        </button>
        {meId !== "" && (
          <button
            type="button"
            onClick={() => void toggleBookmark()}
            aria-pressed={bookmarked}
            aria-label={t("saved.title")}
            className={cn(
              "ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm",
              bookmarked
                ? "font-medium text-cova-ink"
                : "text-cova-mute hover:bg-cova-pale hover:text-cova-ink",
            )}
          >
            <Bookmark className={cn("h-4.5 w-4.5", bookmarked && "fill-current")} aria-hidden="true" />
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 space-y-2 border-t border-cova-line pt-2">
          {topLevel.length === 0 && (
            <p className="text-xs text-cova-mute">{t("interact.empty")}</p>
          )}
          {topLevel.map((comment) => {
            const replies = comments.filter((c) => c.parentId === comment.id);
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

          {meId !== "" && replyTo && (
            <div className="flex items-center justify-between rounded-lg bg-cova-pale px-3 py-1.5 text-xs text-cova-mute">
              <span>
                {t("interact.replyingTo", {
                  name: nameOf(comments.find((c) => c.id === replyTo)?.authorId ?? ""),
                })}
              </span>
              <button type="button" onClick={() => setReplyTo(null)} aria-label={t("dm.cancel")}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

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
          {comment.authorId === meId ? t("groupDetail.you") : nameOf(comment.authorId)}
        </span>
        {" · "}
        {new Date(comment.createdAt).toLocaleString(undefined, {
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
        {comment.authorId === meId && (
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
