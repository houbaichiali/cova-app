import type { MessageKey } from "@/i18n/translate";

/**
 * COVA global validation (spec Phase 3): one centralized, reusable system for
 * every text field, email and password in the app. Pure TypeScript, no
 * dependency — every rule returns either ok or a translated error key, so
 * forms stay fully i18n (en / fr / ar). Unicode-aware: international names
 * and legitimate text are never rejected.
 *
 * Domain-specific exceptions stay with each feature (e.g. community names cap
 * at 60 by product decision) — they may be stricter than these defaults but
 * must never silently exceed them. Ownership of an email address is verified
 * separately by the confirmation flow (Supabase Auth), never assumed here.
 */

/* ------------------------------------------------------------ text limits */

export const TEXT_LIMITS = {
  firstName: { min: 2, max: 30 },
  lastName: { min: 2, max: 30 },
  username: { min: 3, max: 20 },
  email: { min: 5, max: 254 },
  password: { min: 8, max: 50 },
  title: { min: 3, max: 100 },
  shortDescription: { min: 10, max: 250 },
  description: { min: 20, max: 3000 },
  comment: { min: 1, max: 1000 },
  message: { min: 1, max: 2000 },
  search: { min: 1, max: 100 },
  tag: { min: 2, max: 25 },
  slug: { min: 3, max: 60 },
  url: { min: 10, max: 2048 },
  otp: { min: 6, max: 6 },
  codeSubmission: { min: 1, max: 50000 },
} as const;

export type TextKind = keyof typeof TEXT_LIMITS;

/* ------------------------------------------------------------ char rules */

// Unicode letters (+ combining marks), spaces, apostrophes (straight and
// typographic) and hyphens — the international-name friendly pattern.
const NAME_CHARS = /^[\p{L}\p{M}][\p{L}\p{M}\s'’-]*$/u;
// Letters (any script), digits, underscores.
const USERNAME_CHARS = /^[\p{L}\p{N}_]+$/u;
// Letters, digits and reasonable punctuation (curated, includes Unicode).
const TITLE_CHARS = /^[\p{L}\p{N}\s.,:;!?()\-–—'"“”&%+/\\@#*=[\]…]+$/u;
// Letters, digits, underscores, hyphens.
const TAG_CHARS = /^[\p{L}\p{N}_-]+$/u;
// Lowercase letters, digits, hyphens (ASCII — slugs are identifiers).
const SLUG_CHARS = /^[a-z0-9-]+$/u;

const CHAR_RULES: Partial<Record<TextKind, { re: RegExp; key: MessageKey }>> = {
  firstName: { re: NAME_CHARS, key: "validation.firstName.chars" },
  lastName: { re: NAME_CHARS, key: "validation.lastName.chars" },
  username: { re: USERNAME_CHARS, key: "validation.username.chars" },
  title: { re: TITLE_CHARS, key: "validation.title.chars" },
  tag: { re: TAG_CHARS, key: "validation.tag.chars" },
  slug: { re: SLUG_CHARS, key: "validation.slug.chars" },
};

/* ------------------------------------------------------------ primitives */

/** Validation errors are message keys so the forms can show them in the person's language. */
export type FieldErrors<T extends string> = Partial<Record<T, MessageKey>>;

export interface FieldError {
  key: MessageKey;
}
export type FieldResult = { ok: true } | { ok: false; error: FieldError };

const ok: FieldResult = { ok: true };
function fail(key: MessageKey): FieldResult {
  return { ok: false, error: { key } };
}

// Per-kind limit error keys — explicit so MessageKey typing stays exact.
const LIMIT_KEYS: Record<TextKind, { min: MessageKey; max: MessageKey }> = {
  firstName: { min: "validation.firstName.min", max: "validation.firstName.max" },
  lastName: { min: "validation.lastName.min", max: "validation.lastName.max" },
  username: { min: "validation.username.min", max: "validation.username.max" },
  email: { min: "validation.email.tooShort", max: "validation.email.tooLong" },
  password: { min: "validation.password.min", max: "validation.password.max" },
  title: { min: "validation.title.min", max: "validation.title.max" },
  shortDescription: { min: "validation.shortDesc.min", max: "validation.shortDesc.max" },
  description: { min: "validation.description.min", max: "validation.description.max" },
  comment: { min: "validation.comment.min", max: "validation.comment.max" },
  message: { min: "validation.message.min", max: "validation.message.max" },
  search: { min: "validation.search.min", max: "validation.search.max" },
  tag: { min: "validation.tag.min", max: "validation.tag.max" },
  slug: { min: "validation.slug.min", max: "validation.slug.max" },
  url: { min: "validation.url.invalid", max: "validation.url.invalid" },
  otp: { min: "validation.otp.invalid", max: "validation.otp.invalid" },
  codeSubmission: { min: "validation.code.min", max: "validation.code.max" },
};

/** Validates one text field against its default limits and character rules.
 * Empty values are reported as required so callers never store blanks. */
export function validateText(kind: TextKind, value: string): FieldResult {
  const limits = TEXT_LIMITS[kind];
  const trimmed = value.trim();
  if (trimmed.length === 0) return fail("validation.required");
  if (trimmed.length < limits.min) return fail(LIMIT_KEYS[kind].min);
  if (trimmed.length > limits.max) return fail(LIMIT_KEYS[kind].max);
  const chars = CHAR_RULES[kind];
  if (chars && !chars.re.test(trimmed)) return fail(chars.key);
  if (kind === "email") return validateEmail(trimmed);
  if (kind === "password") return validatePassword(trimmed);
  if (kind === "url") return validateHttpsUrl(trimmed);
  if (kind === "otp" && !/^\d{6}$/.test(trimmed)) return fail("validation.otp.invalid");
  return ok;
}

/** Same as validateText but accepts empty values (optional fields). */
export function validateOptionalText(kind: TextKind, value: string): FieldResult {
  if (value.trim().length === 0) return ok;
  return validateText(kind, value);
}

// Error keys for the character rules live in CHAR_RULES; the kinds below have
// dedicated validators instead of generic min/max keys.
function kindErrorBase(kind: TextKind): string {
  switch (kind) {
    case "shortDescription":
      return "validation.shortDesc";
    case "codeSubmission":
      return "validation.code";
    default:
      return `validation.${kind}`;
  }
}
void kindErrorBase; // kept for future generic error keys

/* ------------------------------------------------------------------ email */

/**
 * Strict structural email check (spec 3.2): exactly one @, valid local part,
 * valid domain labels, no spaces, 5–254 total characters. Ownership is
 * verified separately by the confirmation email flow (Supabase Auth).
 */
export function validateEmail(value: string): FieldResult {
  const email = value.trim();
  if (email.length === 0) return fail("validation.required");
  if (email.length < TEXT_LIMITS.email.min) return fail("validation.email.tooShort");
  if (email.length > TEXT_LIMITS.email.max) return fail("validation.email.tooLong");
  if (/\s/.test(email)) return fail("validation.email.invalid");
  const at = email.split("@");
  if (at.length !== 2) return fail("validation.email.invalid"); // exactly one @
  const local = at[0];
  const domain = at[1];
  if (!local || !domain) return fail("validation.email.invalid");
  if (local.length === 0 || local.length > 64) return fail("validation.email.invalid");
  if (/^[.-]/.test(local) || /[.-]$/.test(local) || local.includes("..")) {
    return fail("validation.email.invalid");
  }
  if (!/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local)) return fail("validation.email.invalid");
  if (domain.length === 0 || domain.length > 253) return fail("validation.email.invalid");
  const labels = domain.split(".");
  if (labels.length < 2) return fail("validation.email.invalid");
  for (const label of labels) {
    if (label.length === 0 || label.length > 63) return fail("validation.email.invalid");
    if (!/^[A-Za-z0-9-]+$/.test(label)) return fail("validation.email.invalid");
    if (label.startsWith("-") || label.endsWith("-")) return fail("validation.email.invalid");
  }
  const tld = labels.at(-1);
  if (!tld || !/^[A-Za-z]{2,}$/.test(tld)) return fail("validation.email.invalid");
  return ok;
}

/** Backwards-compatible quick regex (used for live hints, not for storage). */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* --------------------------------------------------------------- password */

export interface PasswordCheck {
  key: MessageKey;
  ok: boolean;
}

/**
 * Requirement checklist (spec 3.3): 8–50 chars, one uppercase, one lowercase,
 * one digit, one special character, no whitespace. Unicode-aware — digits and
 * letters from any script count; the special character is anything printable
 * that is not a letter, digit or whitespace. There is no per-category maximum:
 * total length (50) is the only maximum.
 */
export function passwordChecks(value: string): PasswordCheck[] {
  return [
    { key: "validation.password.req.length", ok: value.length >= 8 && value.length <= 50 },
    { key: "validation.password.req.upper", ok: /\p{Lu}/u.test(value) },
    { key: "validation.password.req.lower", ok: /\p{Ll}/u.test(value) },
    { key: "validation.password.req.digit", ok: /\p{N}/u.test(value) },
    { key: "validation.password.req.special", ok: /[^\p{L}\p{N}\s]/u.test(value) },
    { key: "validation.password.req.noSpace", ok: value.length > 0 && !/\s/.test(value) },
  ];
}

export function isPasswordValid(value: string): boolean {
  return passwordChecks(value).every((check) => check.ok);
}

export function validatePassword(value: string): FieldResult {
  if (value.length === 0) return fail("validation.required");
  if (value.length < TEXT_LIMITS.password.min) return fail("validation.password.min");
  if (value.length > TEXT_LIMITS.password.max) return fail("validation.password.max");
  if (/\s/.test(value)) return fail("validation.password.whitespace");
  if (!/\p{Lu}/u.test(value)) return fail("validation.password.upper");
  if (!/\p{Ll}/u.test(value)) return fail("validation.password.lower");
  if (!/\p{N}/u.test(value)) return fail("validation.password.digit");
  if (!/[^\p{L}\p{N}\s]/u.test(value)) return fail("validation.password.special");
  return ok;
}

export function validatePasswordConfirmation(password: string, confirmation: string): FieldResult {
  if (password !== confirmation) return fail("validation.confirm.mismatch");
  return ok;
}

/* -------------------------------------------------------------------- url */

/** HTTPS-only URL (spec 3.1): 10–2,048 chars, parseable, has a hostname. */
export function validateHttpsUrl(value: string): FieldResult {
  const raw = value.trim();
  if (raw.length === 0) return fail("validation.required");
  if (raw.length < TEXT_LIMITS.url.min || raw.length > TEXT_LIMITS.url.max) {
    return fail("validation.url.invalid");
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.hostname.length === 0) {
      return fail("validation.url.invalid");
    }
    return ok;
  } catch {
    return fail("validation.url.invalid");
  }
}

/* -------------------------------------------- auth form API (existing use) */

export function validateLogin(values: {
  email: string;
  password: string;
}): FieldErrors<"email" | "password"> {
  const errors: FieldErrors<"email" | "password"> = {};
  if (!values.email.trim()) errors.email = "auth.err.emailRequired";
  else if (!validateEmail(values.email.trim()).ok) errors.email = "auth.err.emailInvalid";
  if (!values.password) errors.password = "auth.err.passwordRequired";
  return errors;
}

export type RegisterValues = {
  name: string;
  email: string;
  password: string;
  confirm: string;
  accepted: boolean;
};

/** First failing password requirement as a granular, translatable error. */
function firstPasswordError(value: string): MessageKey | undefined {
  const result = validatePassword(value);
  return result.ok ? undefined : result.error.key;
}

export function validateRegister(values: RegisterValues): FieldErrors<keyof RegisterValues> {
  const errors: FieldErrors<keyof RegisterValues> = {};
  if (values.name.trim().length < 2) errors.name = "auth.err.nameShort";
  if (!values.email.trim()) errors.email = "auth.err.emailRequired";
  else if (!validateEmail(values.email.trim()).ok) errors.email = "auth.err.emailInvalid";
  const passwordError = firstPasswordError(values.password);
  if (passwordError) errors.password = passwordError;
  if (values.confirm !== values.password) errors.confirm = "auth.err.confirmMismatch";
  if (!values.accepted) errors.accepted = "auth.err.accept";
  return errors;
}

export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local.split(/[._-]+/).filter(Boolean);
  if (words.length === 0) return "Student";
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/* -------------------------------------------------------------- helpers */

/** Builds the maxLength HTML attribute for a kind (guards paste overflow). */
export function maxLengthFor(kind: TextKind): number {
  return TEXT_LIMITS[kind].max;
}

/** Normalizes a display name for storage (shared with profile editors). */
export function normalizeName(value: string, max: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}
