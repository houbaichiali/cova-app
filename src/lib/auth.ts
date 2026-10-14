import { getSupabase } from "@/lib/supabase/client";
import { fail, ok } from "@/lib/result";
import type { ActionResult } from "@/types/social";

/**
 * Real authentication (Supabase Auth). The signed-in person is read through `useDemoState().session`
 * (kept for existing screens) or `useMe()` for the social profile.
 *
 * These replace the old fake `demoActions.signIn(session)`, which trusted whatever name and email
 * the form passed in.
 */

export const MIN_PASSWORD_LENGTH = 8;

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don't match.";
  if (m.includes("email not confirmed")) return "Confirm your email first. Check your inbox for the link.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "An account with this email already exists. Try signing in.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Too many attempts. Wait a minute and try again.";
  if (m.includes("password")) return message;
  return "Something went wrong. Please try again.";
}

export const authActions = {
  /**
   * Creates the account. The database creates the matching profile (public COVA id included)
   * from `displayName`. When the project requires email confirmation there is no session yet and
   * `needsEmailConfirmation` is true.
   */
  async signUp(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<ActionResult<{ needsEmailConfirmation: boolean }>> {
    const email = input.email.trim().toLowerCase();
    const displayName = input.displayName.trim();
    if (!email) return fail("Enter your email.");
    if (input.password.length < MIN_PASSWORD_LENGTH)
      return fail(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (!displayName) return fail("Enter your name.");
    const { data, error } = await getSupabase().auth.signUp({
      email,
      password: input.password,
      options: { data: { name: displayName.slice(0, 60) } },
    });
    if (error) return fail(friendly(error.message));
    return ok({ needsEmailConfirmation: !data.session });
  },

  async signIn(emailInput: string, password: string): Promise<ActionResult> {
    const email = emailInput.trim().toLowerCase();
    if (!email || !password) return fail("Enter your email and password.");
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) return fail(friendly(error.message));
    return ok(undefined);
  },

  async signOut(): Promise<void> {
    await getSupabase().auth.signOut();
  },
};
