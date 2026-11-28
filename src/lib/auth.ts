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

export type SocialProvider = "google" | "github" | "discord" | "twitter";

/** The four approved providers (spec Phase 5.2). X is "twitter" in Supabase. */
export const SOCIAL_PROVIDERS: Array<{ id: SocialProvider; label: string }> = [
  { id: "google", label: "Google" },
  { id: "github", label: "GitHub" },
  { id: "discord", label: "Discord" },
  { id: "twitter", label: "X (Twitter)" },
];

export const authActions = {
  /**
   * Creates the account. The database creates the matching profile (public COVA id included)
   * from `displayName`. When the project requires email confirmation there is no session yet and
   * `needsEmailConfirmation` is true. The metadata carries BOTH `name` and `display_name`
   * so the profile trigger works whichever key it reads.
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
      options: {
        data: { name: displayName.slice(0, 60), display_name: displayName.slice(0, 60) },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
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

  /** Real OAuth sign-in (spec Phase 5.2). The provider must be enabled with
   * real credentials in the Supabase Auth settings by the project owner —
   * when it is not, Supabase returns an error that surfaces verbatim. */
  async signInWithProvider(provider: SocialProvider): Promise<ActionResult> {
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) return fail(friendly(error.message));
    return ok(undefined);
  },

  /** Sends the password-recovery email; the link lands on /reset-password. */
  async requestPasswordReset(emailInput: string): Promise<ActionResult> {
    const email = emailInput.trim().toLowerCase();
    if (!email) return fail("Enter your email.");
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return fail(friendly(error.message));
    return ok(undefined);
  },

  /** Resends the signup confirmation email (spec 5.3 "Resend verification"). */
  async resendConfirmation(emailInput: string): Promise<ActionResult> {
    const email = emailInput.trim().toLowerCase();
    if (!email) return fail("Enter your email.");
    const { error } = await getSupabase().auth.resend({ type: "signup", email });
    if (error) return fail(friendly(error.message));
    return ok(undefined);
  },

  /** Identity linking (spec 5.4): the OAuth provider itself proves ownership
   * before Supabase attaches the identity to the current user. No account is
   * ever merged on an unverified email match. */
  async linkedIdentities(): Promise<
    ActionResult<Array<{ provider: string; email: string | null; linkedAt: string | null }>>
  > {
    const { data, error } = await getSupabase().auth.getUserIdentities();
    if (error) return fail(friendly(error.message));
    return ok(
      data.identities.map((identity) => ({
        provider: identity.provider,
        email: identity.identity_data?.email ?? null,
        linkedAt: identity.last_sign_in_at ?? null,
      })),
    );
  },

  async linkIdentity(provider: SocialProvider): Promise<ActionResult> {
    const { error } = await getSupabase().auth.linkIdentity({
      provider,
      options: { redirectTo: `${window.location.origin}/settings` },
    });
    if (error) return fail(friendly(error.message));
    return ok(undefined);
  },

  async unlinkIdentity(provider: SocialProvider): Promise<ActionResult> {
    // supabase-js takes the FULL identity object (not just the provider id).
    const { data, error: listError } = await getSupabase().auth.getUserIdentities();
    if (listError) return fail(friendly(listError.message));
    const identity = data.identities.find((item) => item.provider === provider);
    if (!identity) return fail(friendly("Identity not found."));
    const { error } = await getSupabase().auth.unlinkIdentity(identity);
    if (error) return fail(friendly(error.message));
    return ok(undefined);
  },
};
