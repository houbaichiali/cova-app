"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, BookmarkX } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useT } from "@/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { useMe, useSocial } from "@/lib/social-store";

type SavedRow = {
  post_id: string;
  post: {
    id: string;
    body: string;
    author_id: string;
    created_at: string;
    space: { id: string; kind: string; name: string } | null;
  } | null;
};

/**
 * "Saved posts" — the member's private bookmarks written through
 * 20261115000005_follows_bookmarks.sql. Only the owner ever sees this list
 * (post_bookmarks RLS is owner-only).
 */
export function SavedPostsList() {
  const t = useT();
  const social = useSocial();
  const me = useMe();
  const [rows, setRows] = useState<SavedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  // The fetcher returns data instead of setting state, so the mount effect
  // stays free of synchronous setState calls (react-hooks rule).
  const fetchSaved = useCallback(async (): Promise<SavedRow[] | null> => {
    const meId = social.meId;
    if (!meId) return [];
    const { data, error } = await getSupabase()
      .from("post_bookmarks")
      .select(
        "post_id, post:space_posts(id, body, author_id, created_at, space:spaces(id, kind, name))",
      )
      .eq("user_id", meId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return null;
    return (data ?? []) as unknown as SavedRow[];
  }, [social.meId]);

  useEffect(() => {
    if (!social.ready) return;
    let cancelled = false;
    void fetchSaved().then((saved) => {
      if (cancelled) return;
      if (saved === null) {
        // Migration not applied yet — show a quiet empty state, not a crash.
        setUnavailable(true);
        setRows([]);
      } else {
        setRows(saved);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [social.ready, fetchSaved]);

  async function removeBookmark(postId: string) {
    const meId = social.meId;
    if (!meId) return;
    const { error } = await getSupabase()
      .from("post_bookmarks")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", meId);
    if (!error) {
      setRows((current) => current.filter((row) => row.post_id !== postId));
    }
  }

  if (!social.ready || loading) {
    return (
      <div>
        <PageHeader title={t("saved.title")} />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardBody className="flex gap-3">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div>
        <PageHeader title={t("saved.title")} />
        <p className="rounded-lg bg-cova-pale px-4 py-3 text-sm">{t("notif.signin")}</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t("saved.title")} />
      <div className="space-y-3">
      {rows.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-2 py-10 text-center">
            <Bookmark className="h-8 w-8 text-cova-mute" aria-hidden="true" />
            <p className="text-sm text-cova-mute">
              {unavailable ? t("saved.unavailable") : t("saved.empty")}
            </p>
          </CardBody>
        </Card>
      ) : (
        rows.map((row) => {
          if (!row.post) return null;
          const space = row.post.space;
          const href = space
            ? space.kind === "group"
              ? `/groups/${space.id}`
              : `/community/${space.id}`
            : "/community";
          const author = social.users[row.post.author_id];
          return (
            <Card key={row.post_id}>
              <CardBody className="flex gap-3">
                <Avatar name={author?.displayName ?? "—"} tone={author?.tone} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{author?.displayName ?? "—"}</p>
                  <p className="mt-0.5 line-clamp-3 whitespace-pre-line break-words text-sm">
                    {row.post.body}
                  </p>
                  <div className="mt-1.5 flex items-center gap-3 text-xs">
                    <Link href={href} className="text-cova-mute hover:underline">
                      {space?.name ?? t("saved.openSource")}
                    </Link>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-cova-mute hover:text-red-600 hover:underline"
                      onClick={() => void removeBookmark(row.post_id)}
                    >
                      <BookmarkX className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("saved.remove")}
                    </button>
                  </div>
                </div>
              </CardBody>
            </Card>
          );
        })
      )}
      </div>
    </div>
  );
}
