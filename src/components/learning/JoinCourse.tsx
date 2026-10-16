
"use client";

import { useState } from "react";
import { KeyRound, Loader2, Plus } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

export function JoinCourse() {
  const [isOpen, setIsOpen] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function joinCourse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);

    const normalizedCode = code.trim().toUpperCase();

    if (!normalizedCode) {
      setMessage("Please enter an invitation code.");
      return;
    }

    setLoading(true);

    try {
      const supabase = getSupabase();
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error("Please sign in before joining a course.");
      }

      const { error } = await supabase.rpc("join_course_by_code", {
        p_code: normalizedCode,
      });

      if (error) throw error;

      setSuccess(true);
      setMessage("You joined the course successfully!");
      setCode("");
    } catch (error) {
      console.error("Joining course failed:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not join the course. Check the code and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mb-6">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setIsOpen((open) => !open);
            setMessage("");
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          {isOpen ? "Close" : "Join a course"}
        </Button>
      </div>

      {isOpen && (
        <div className="mt-4 rounded-xl border border-cova-line p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-cova-soft p-2">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Join a private course</h2>
              <p className="text-sm text-cova-mute">
                Enter the invitation code shared by the course creator.
              </p>
            </div>
          </div>

          <form
            onSubmit={joinCourse}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <label className="block flex-1 text-sm font-medium">
              Invitation code
              <input
                required
                maxLength={32}
                autoComplete="off"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Enter your code"
                className="mt-1.5 w-full rounded-lg border border-cova-line bg-transparent px-3 py-2"
              />
            </label>

            <div className="flex items-end">
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Joining...
                  </>
                ) : (
                  "Join course"
                )}
              </Button>
            </div>
          </form>

          {message && (
            <p
              role="status"
              className={`mt-4 text-sm ${
                success ? "text-green-600" : "text-cova-mute"
              }`}
            >
              {message}
            </p>
          )}

          {success && (
            <Button
              type="button"
              variant="secondary"
              className="mt-3"
              onClick={() => window.location.reload()}
            >
              Refresh courses
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
