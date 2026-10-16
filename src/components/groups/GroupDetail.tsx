
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DoorClosed, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Group = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  visibility: "public" | "private";
  post_policy: string;
  owner_id: string;
};

type GroupMessage = {
  id: string;
  space_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

type MemberRole = "owner" | "admin" | "member";

export function GroupDetail({ code }: { code: string }) {
  const router = useRouter();

  const [userId, setUserId] = useState("");
  const [group, setGroup] = useState<Group | null>(null);
  const [role, setRole] = useState<MemberRole | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Charger les publications depuis space_posts
  const loadMessages = useCallback(async (spaceId: string) => {
    const supabase = getSupabase();

    const { data, error: queryError } = await supabase
      .from("space_posts")
      .select("id,space_id,author_id,body,created_at")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: true });

    if (queryError) throw queryError;

    setMessages((data ?? []) as GroupMessage[]);
  }, []);

  // Charger le groupe et le rôle de l'utilisateur
  const loadGroup = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = getSupabase();

      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      if (!authData.user) {
        setUserId("");
        setGroup(null);
        setRole(null);
        setMessages([]);
        setError("Please sign in to access groups.");
        return;
      }

      const currentUserId = authData.user.id;
      setUserId(currentUserId);

      const { data: groupData, error: groupError } = await supabase
        .from("spaces")
        .select(
          "id,name,description,category,visibility,post_policy,owner_id"
        )
        .eq("id", code)
        .eq("kind", "group")
        .maybeSingle();

      if (groupError) throw groupError;

      if (!groupData) {
        setGroup(null);
        setRole(null);
        setMessages([]);
        setError(
          "Group not found, or you do not have permission to view it."
        );
        return;
      }

      const currentGroup = groupData as Group;
      setGroup(currentGroup);

      const { data: membership, error: membershipError } =
        await supabase
          .from("space_members")
          .select("role")
          .eq("space_id", currentGroup.id)
          .eq("user_id", currentUserId)
          .maybeSingle();

      if (membershipError) throw membershipError;

      // Le propriétaire est reconnu même si sa ligne de membre
      // n'a pas encore été créée dans space_members.
      const memberRole: MemberRole | null =
        currentGroup.owner_id === currentUserId
          ? "owner"
          : membership?.role === "admin"
            ? "admin"
            : membership?.role
              ? "member"
              : null;

      setRole(memberRole);

      if (!memberRole) {
        setMessages([]);
        return;
      }

      await loadMessages(currentGroup.id);
    } catch (err) {
      console.error("Error loading group:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not load the group."
      );
    } finally {
      setLoading(false);
    }
  }, [code, loadMessages]);

  useEffect(() => {
    void loadGroup();
  }, [loadGroup]);

  // Actualiser les publications en temps réel
  useEffect(() => {
    if (!group || !role) return;

    const supabase = getSupabase();

    const channel = supabase
      .channel(`space-posts-${group.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "space_posts",
          filter: `space_id=eq.${group.id}`,
        },
        () => {
          void loadMessages(group.id).catch((err: unknown) => {
            setError(
              err instanceof Error
                ? err.message
                : "Could not refresh group posts."
            );
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [group, role, loadMessages]);

  const isStaff = role === "owner" || role === "admin";

  const canPost =
    !!role &&
    (group?.post_policy === "members"
      ? true
      : group?.post_policy === "admins"
        ? isStaff
        : role === "owner");

  // Rejoindre un groupe public
  const joinGroup = async () => {
    if (!group || busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      if (group.visibility !== "public") {
        setError(
          "This group is private. Use its invitation process to request access."
        );
        return;
      }

      const supabase = getSupabase();

      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;
      if (!authData.user) {
        throw new Error("Please sign in before joining a group.");
      }

      const { error: joinError } = await supabase
        .from("space_members")
        .insert({
          space_id: group.id,
          user_id: authData.user.id,
          role: "member",
        });

      if (joinError) throw joinError;

      setNotice("You joined the group.");
      await loadGroup();
    } catch (err) {
      console.error("Error joining group:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not join the group."
      );
    } finally {
      setBusy(false);
    }
  };

  // Publier un message dans space_posts
  const submitMessage = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    const body = text.trim();

    if (!group || !body || !canPost || busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const supabase = getSupabase();

      const { error: insertError } = await supabase
        .from("space_posts")
        .insert({
          space_id: group.id,
          author_id: userId,
          body,
        });

      if (insertError) throw insertError;

      setText("");
      await loadMessages(group.id);
    } catch (err) {
      console.error("Error posting message:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not publish the message. Check your membership and permissions."
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <p className="py-12 text-center text-sm text-cova-mute">
        Loading group...
      </p>
    );
  }

  if (!group) {
    return (
      <EmptyState
        icon={DoorClosed}
        title="Group unavailable"
        description={error || "Could not load the group."}
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
          <h1 className="truncate text-xl font-semibold">
            {group.name}
          </h1>

          {group.description && (
            <p className="text-sm text-cova-mute">
              {group.description}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-cova-mute">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {group.visibility === "public"
                ? "Public group"
                : "Private group"}
            </span>

            {group.category && (
              <span>· {group.category}</span>
            )}
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {notice && (
          <p
            role="status"
            className="mb-3 rounded-lg bg-cova-pale p-3 text-sm"
          >
            {notice}
          </p>
        )}

        {!role ? (
          <Card className="space-y-3 p-5">
            <h2 className="font-semibold">Join this group</h2>

            <p className="text-sm text-cova-mute">
              {group.visibility === "public"
                ? "Join to read and publish messages."
                : "This group is private. You need permission to access it."}
            </p>

            {group.visibility === "public" && (
              <Button
                onClick={() => void joinGroup()}
                disabled={busy}
              >
                {busy ? "Joining..." : "Join group"}
              </Button>
            )}
          </Card>
        ) : (
          <Card className="flex h-[30rem] flex-col sm:h-[36rem]">
            <div
              className="flex-1 space-y-3 overflow-y-auto p-4"
              aria-live="polite"
            >
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
                      mine ? "items-end" : "items-start"
                    )}
                  >
                    <span className="mb-0.5 text-xs text-cova-mute">
                      {mine
                        ? "You"
                        : `Member ${message.author_id.slice(0, 6)}`}
                      {" · "}
                      {new Date(
                        message.created_at
                      ).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>

                    <p
                      className={cn(
                        "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm",
                        mine ? "bg-cova-soft" : "bg-cova-pale"
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
                  placeholder="Write a message..."
                  aria-label="Write a message"
                  className="h-10 min-w-0 flex-1 rounded-lg border border-cova-line px-3 text-sm"
                />

                <Button
                  type="submit"
                  disabled={!text.trim() || busy}
                >
                  <Send
                    className="h-4 w-4 rtl:-scale-x-100"
                    aria-hidden="true"
                  />
                  Send
                </Button>
              </form>
            ) : (
              <p className="border-t border-cova-line p-3 text-center text-sm text-cova-mute">
                You do not have permission to post in this group.
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
