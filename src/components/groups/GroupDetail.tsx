
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DoorClosed, LockKeyhole, LockOpen, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Community = {
  id: string;
  name: string;
  description: string | null;
  visibility: "public" | "private";
  is_locked: boolean;
  posting_policy: "everyone" | "admins" | "owner";
  owner_id: string;
};

type CommunityMessage = {
  id: string;
  community_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

type MemberRole = "owner" | "admin" | "member";

export function GroupDetail({ code }: { code: string }) {
  const router = useRouter();

  const [userId, setUserId] = useState("");
  const [community, setCommunity] = useState<Community | null>(null);
  const [role, setRole] = useState<MemberRole | null>(null);
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadMessages = useCallback(async (communityId: string) => {
    const supabase = getSupabase();

    const { data, error: queryError } = await supabase
      .from("community_messages")
      .select("id,community_id,author_id,body,created_at")
      .eq("community_id", communityId)
      .order("created_at", { ascending: true });

    if (queryError) throw queryError;
    setMessages((data ?? []) as CommunityMessage[]);
  }, []);

const loadGroup = useCallback(async () => {
  try {
      const supabase = getSupabase();
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      if (!authData.user) {
        setUserId("");
        setCommunity(null);
        setRole(null);
        setError("Please sign in to access groups.");
        return;
      }

      const currentUserId = authData.user.id;
      setUserId(currentUserId);

      const { data: group, error: groupError } = await supabase
        .from("communities")
        .select(
          "id,name,description,visibility,is_locked,posting_policy,owner_id",
        )
        .eq("id", code)
        .maybeSingle();

      if (groupError) throw groupError;

      if (!group) {
        setCommunity(null);
        setRole(null);
        setMessages([]);
        setError(
          "Group not found, or you do not have permission to view this private group.",
        );
        return;
      }

      const currentGroup = group as Community;
      setCommunity(currentGroup);

      const { data: membership, error: membershipError } = await supabase
        .from("community_members")
        .select("role")
        .eq("community_id", currentGroup.id)
        .eq("user_id", currentUserId)
        .maybeSingle();

      if (membershipError) throw membershipError;

      const memberRole = membership?.role as MemberRole | undefined;
      setRole(memberRole ?? null);

      if (!memberRole) {
        setMessages([]);
        return;
      }

      await loadMessages(currentGroup.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load the group.",
      );
    } finally {
      setLoading(false);
    }
  }, [code, loadMessages]);

useEffect(() => {
  const timer = window.setTimeout(() => {
    void loadGroup();
  }, 0);

  return () => window.clearTimeout(timer);
}, [loadGroup]);

  useEffect(() => {
    if (!community || !role) return;

    const supabase = getSupabase();
    const channel = supabase
      .channel(`community-messages-${community.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_messages",
          filter: `community_id=eq.${community.id}`,
        },
        () => {
          void loadMessages(community.id).catch((err: unknown) => {
            setError(
              err instanceof Error
                ? err.message
                : "Could not refresh messages.",
            );
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [community, role, loadMessages]);

  const isStaff = role === "owner" || role === "admin";

  const canPost =
    !!role &&
    (community?.is_locked
      ? isStaff
      : community?.posting_policy === "everyone"
        ? true
        : community?.posting_policy === "admins"
          ? isStaff
          : role === "owner");

  const joinGroup = async () => {
    if (!community || busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      if (community.visibility !== "public") {
        setError("This is a private group. Join using its invitation code.");
        return;
      }

      const supabase = getSupabase();
      const { error: joinError } = await supabase
        .from("community_members")
        .insert({ community_id: community.id });

      if (joinError) throw joinError;

      setNotice("You joined the group.");
      await loadGroup();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not join the group.",
      );
    } finally {
      setBusy(false);
    }
  };

  const submitMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const body = text.trim();
    if (!community || !body || !canPost || busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const supabase = getSupabase();
      const { error: insertError } = await supabase
        .from("community_messages")
        .insert({
          community_id: community.id,
          body,
        });

      if (insertError) throw insertError;

      setText("");
      await loadMessages(community.id);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not send the message. Check your membership and posting permissions.",
      );
    } finally {
      setBusy(false);
    }
  };

  const toggleLock = async () => {
    if (!community || role !== "owner" || busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const supabase = getSupabase();
      const { data, error: updateError } = await supabase
        .from("communities")
        .update({ is_locked: !community.is_locked })
        .eq("id", community.id)
        .select("id,is_locked")
        .maybeSingle();

      if (updateError) throw updateError;
      if (!data) {
        throw new Error(
          "The group lock was not changed. Check the database update policy.",
        );
      }

      setCommunity((current) =>
        current ? { ...current, is_locked: data.is_locked } : current,
      );
      setNotice(data.is_locked ? "Group locked." : "Group unlocked.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not change the group lock.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="py-12 text-center text-sm text-cova-mute">Loading group…</p>;
  }

  if (!community) {
    return (
      <EmptyState
        icon={DoorClosed}
        title="Group unavailable"
        description={error || code}
        action={
          <Button onClick={() => router.push("/groups")}>
            Back to groups
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0">
        <div className="mb-3">
          <h1 className="truncate text-xl font-semibold">{community.name}</h1>
          {community.description && (
            <p className="text-sm text-cova-mute">
              {community.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-cova-mute">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {community.visibility === "public" ? "Public group" : "Private group"}
            </span>
            {community.is_locked && (
              <span className="inline-flex items-center gap-1">
                <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                Locked
              </span>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {notice && (
          <p role="status" className="mb-3 rounded-lg bg-cova-pale p-3 text-sm">
            {notice}
          </p>
        )}

        {!role ? (
          <Card className="space-y-3 p-5">
            <h2 className="font-semibold">Join this group</h2>
            <p className="text-sm text-cova-mute">
              {community.visibility === "public"
                ? "Join to read and send messages."
                : "This group is private. Use a valid invitation code to request access."}
            </p>
            {community.visibility === "public" && (
              <Button onClick={() => void joinGroup()} disabled={busy}>
                {busy ? "Joining…" : "Join group"}
              </Button>
            )}
          </Card>
        ) : (
          <Card className="flex h-[30rem] flex-col sm:h-[36rem]">
            <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
              {messages.length === 0 && (
                <p className="py-10 text-center text-sm text-cova-mute">
                  No messages yet. Start the conversation.
                </p>
              )}

              {messages.map((message) => {
                const mine = message.author_id === userId;

                return (
                  <div
                    key={message.id}
                    className={cn(
                      "flex flex-col",
                      mine ? "items-end" : "items-start",
                    )}
                  >
                    <span className="mb-0.5 text-xs text-cova-mute">
                      {mine
                        ? "You"
                        : `Member ${message.author_id.slice(0, 6)}`}{" "}
                      ·{" "}
                      {new Date(message.created_at).toLocaleTimeString(
                        undefined,
                        { hour: "2-digit", minute: "2-digit" },
                      )}
                    </span>
                    <p
                      className={cn(
                        "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm",
                        mine ? "bg-cova-soft" : "bg-cova-pale",
                      )}
                    >
                      {message.body}
                    </p>
                  </div>
                );
              })}
            </div>

            {canPost ? (
              <form
                className="flex gap-2 border-t border-cova-line p-3"
                onSubmit={(event) => void submitMessage(event)}
              >
                <input
                  value={text}
                  maxLength={5000}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Write a message…"
                  aria-label="Write a message"
                  className="h-10 min-w-0 flex-1 rounded-lg border border-cova-line px-3 text-sm"
                />
                <Button type="submit" disabled={!text.trim() || busy}>
                  <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
                  Send
                </Button>
              </form>
            ) : (
              <p className="border-t border-cova-line p-3 text-center text-sm text-cova-mute">
                {community.is_locked
                  ? "This group is locked. Only admins can post."
                  : "You do not have permission to post in this group."}
              </p>
            )}
          </Card>
        )}
      </div>

      <div className="space-y-3">
        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">Group settings</h2>
          <p className="text-sm text-cova-mute">
            Your role: {role ?? "Not a member"}
          </p>

          {role === "owner" && (
            <Button
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={() => void toggleLock()}
            >
              {community.is_locked ? (
                <LockOpen className="h-4 w-4" aria-hidden="true" />
              ) : (
                <LockKeyhole className="h-4 w-4" aria-hidden="true" />
              )}
              {community.is_locked ? "Unlock group" : "Lock group"}
            </Button>
          )}

          <Button
            variant="secondary"
            className="w-full"
            onClick={() => router.push("/groups")}
          >
            Back to groups
          </Button>
        </Card>
      </div>
    </div>
  );
}
