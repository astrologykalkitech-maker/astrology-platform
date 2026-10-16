// Client-side checks that mirror the rules in lib/validations/auth.ts.
// The Server Actions still validate everything again; these only give instant feedback.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Enter your email address.";
  if (!EMAIL_REGEX.test(trimmed)) return "Enter a valid email address.";
  return null;
}

export function validateLoginPassword(value: string): string | null {
  if (!value) return "Enter your password.";
  return null;
}

export function validateNewPassword(value: string): string | null {
  if (value.length < 6) return "Password must be at least 6 characters.";
  return null;
}

export function validateFullName(value: string): string | null {
  if (value.trim().length < 2) return "Enter your full name (at least 2 characters).";
  return null;
}
