import type { MessageKey } from "@/i18n/translate";

/** Validation errors are message keys so the forms can show them in the person's language. */
export type FieldErrors<T extends string> = Partial<Record<T, MessageKey>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateLogin(values: {
  email: string;
  password: string;
}): FieldErrors<"email" | "password"> {
  const errors: FieldErrors<"email" | "password"> = {};
  if (!values.email.trim()) errors.email = "auth.err.emailRequired";
  else if (!EMAIL_RE.test(values.email.trim())) errors.email = "auth.err.emailInvalid";
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

export function validateRegister(values: RegisterValues): FieldErrors<keyof RegisterValues> {
  const errors: FieldErrors<keyof RegisterValues> = {};
  if (values.name.trim().length < 2) errors.name = "auth.err.nameShort";
  if (!values.email.trim()) errors.email = "auth.err.emailRequired";
  else if (!EMAIL_RE.test(values.email.trim())) errors.email = "auth.err.emailInvalid";
  if (values.password.length < 8) errors.password = "auth.err.passwordShort";
  else if (!/[A-Za-z]/.test(values.password) || !/\d/.test(values.password))
    errors.password = "auth.err.passwordWeak";
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
