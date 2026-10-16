
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Users, RefreshCw, LockKeyhole, Globe } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type Community = {
  id: string;
  name: string;
  description: string;
  category: string | null;
  visibility: "public" | "private";
  created_at: string;
};

export function GroupsBrowser() {
  const router = useRouter();

  const [groups, setGroups] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [visibility, setVisibility] =
    useState<"public" | "private">("public");

  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);

  // Charger les groupes depuis la bonne table : spaces
  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = getSupabase();

      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      if (!authData.user) {
        setGroups([]);
        setError("Please sign in to view and create groups.");
        return;
      }

      const { data, error: queryError } = await supabase
        .from("spaces")
        .select(
          "id, name, description, category, visibility, created_at"
        )
        .eq("kind", "group")
        .eq("visibility", "public")
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;

      setGroups((data ?? []) as Community[]);
    } catch (err) {
      console.error("Error loading groups:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Could not load groups. Check your Supabase configuration and database policies."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  // Créer un groupe dans spaces
  const createGroup = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const supabase = getSupabase();

      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      if (!authData.user) {
        setError("Please sign in before creating a group.");
        return;
      }

      const cleanName = name.trim();
      const cleanDescription = description.trim();

      if (cleanName.length < 3 || cleanName.length > 60) {
        setError(
          "Group name must contain between 3 and 60 characters."
        );
        return;
      }

      if (
        cleanDescription.length < 10 ||
        cleanDescription.length > 500
      ) {
        setError(
          "Description must contain between 10 and 500 characters."
        );
        return;
      }

      const { data: newGroup, error: insertError } = await supabase
        .from("spaces")
        .insert({
          kind: "group",
          name: cleanName,
          description: cleanDescription,
          category,
          visibility,
          post_policy: "members",
          owner_id: authData.user.id,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      setNotice("Group created successfully.");
      setShowCreate(false);
      setName("");
      setDescription("");
      setCategory("General");
      setVisibility("public");

      await loadGroups();

      // Ouvrir la page du groupe créé
      router.push(`/groups/${newGroup.id}`);
    } catch (err) {
      console.error("Error creating group:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Could not create the group. Please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  // Rejoindre un groupe avec un code d'invitation.
  // Cette fonction nécessite la RPC join_by_code dans Supabase.
  const joinGroup = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setJoining(true);
    setError("");
    setNotice("");

    try {
      const supabase = getSupabase();

      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      if (!authData.user) {
        setError("Please sign in before joining a group.");
        return;
      }

      const code = inviteCode.trim().toUpperCase();

      if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
        setError("Enter a valid 8-character group invite code.");
        return;
      }

      const { data, error: joinError } = await supabase.rpc(
        "join_by_code",
        { p_code: code }
      );

      if (joinError) throw joinError;

      const result = data as {
        communityId?: string;
        outcome?: string;
      } | null;

      if (!result?.communityId) {
        throw new Error("The server did not return a group ID.");
      }

      setNotice(
        result.outcome === "requested"
          ? "Your request to join the private group has been sent."
          : result.outcome === "already-member"
            ? "You are already a member of this group."
            : "You joined the group successfully."
      );

      setInviteCode("");
      await loadGroups();

      if (result.outcome !== "requested") {
        router.push(`/groups/${result.communityId}`);
      }
    } catch (err) {
      console.error("Error joining group:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Could not join this group. Check the invite code and try again."
      );
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            Groups &amp; Community
          </h1>
          <p className="mt-1 text-sm text-cova-mute">
            Discover communities, create a group, and chat with members.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => void loadGroups()}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>

          <Button
            onClick={() => {
              setError("");
              setShowCreate((current) => !current);
            }}
          >
            <Plus className="h-4 w-4" />
            Create group
          </Button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="rounded-lg border border-green-300 p-3 text-sm text-green-700"
        >
          {notice}
        </p>
      )}

      <Card className="p-4">
        <form onSubmit={joinGroup} className="flex flex-wrap gap-2">
          <input
            value={inviteCode}
            onChange={(event) =>
              setInviteCode(event.target.value.toUpperCase())
            }
            maxLength={8}
            required
            aria-label="Group invitation code"
            placeholder="Enter 8-character invite code"
            className="h-10 min-w-0 flex-1 rounded-lg border border-cova-line px-3 text-sm"
          />

          <Button type="submit" disabled={joining}>
            {joining ? "Joining..." : "Join with code"}
          </Button>
        </form>
      </Card>

      {showCreate && (
        <Card className="p-5">
          <form onSubmit={createGroup} className="space-y-4">
            <h2 className="text-lg font-semibold">
              Create a new group
            </h2>

            <label className="block space-y-1 text-sm">
              <span>Group name</span>
              <input
                required
                minLength={3}
                maxLength={60}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-lg border border-cova-line px-3 py-2"
                placeholder="e.g. English learners"
              />
            </label>

            <label className="block space-y-1 text-sm">
              <span>Description</span>
              <textarea
                required
                minLength={10}
                maxLength={500}
                rows={3}
                value={description}
                onChange={(event) =>
                  setDescription(event.target.value)
                }
                className="w-full rounded-lg border border-cova-line px-3 py-2"
                placeholder="What is this group about?"
              />
            </label>

            <label className="block space-y-1 text-sm">
              <span>Category</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="w-full rounded-lg border border-cova-line px-3 py-2"
              >
                <option value="General">General</option>
                <option value="Languages">Languages</option>
                <option value="Technology">Technology</option>
                <option value="Study">Study</option>
                <option value="Other">Other</option>
              </select>
            </label>

            <label className="block space-y-1 text-sm">
              <span>Visibility</span>
              <select
                value={visibility}
                onChange={(event) =>
                  setVisibility(
                    event.target.value as "public" | "private"
                  )
                }
                className="w-full rounded-lg border border-cova-line px-3 py-2"
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </label>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? "Creating..." : "Create group"}
              </Button>

              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCreate(false)}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-cova-mute">
          Loading groups...
        </p>
      ) : groups.length === 0 ? (
        <Card className="p-8 text-center">
          <Users className="mx-auto mb-3 h-8 w-8 text-cova-mute" />
          <h2 className="font-semibold">No public groups yet</h2>
          <p className="mt-1 text-sm text-cova-mute">
            Create the first group or come back later.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <Card
              key={group.id}
              className="flex flex-col gap-3 p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-cova-pale px-3 py-1 text-xs">
                  {group.category || "General"}
                </span>

                {group.visibility === "private" ? (
                  <LockKeyhole
                    className="h-4 w-4"
                    aria-label="Private group"
                  />
                ) : (
                  <Globe
                    className="h-4 w-4"
                    aria-label="Public group"
                  />
                )}
              </div>

              <h2 className="text-lg font-semibold">
                {group.name}
              </h2>

              <p className="flex-1 whitespace-pre-wrap break-words text-sm text-cova-mute">
                {group.description}
              </p>

              <Link
                href={`/groups/${group.id}`}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-cova-line px-4 text-sm font-medium hover:bg-cova-pale"
              >
                Open group
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
