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
  if (!value) return "Enter your new password.";
  if (value.length < 8) return "Password must be at least 8 characters.";
  return null;
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Too short" | "Weak" | "Fair" | "Good" | "Strong";
  colorClass: string;
}

export function calculatePasswordStrength(password: string): PasswordStrength {
  if (!password || password.length < 8) {
    return { score: password ? 1 : 0, label: "Too short", colorClass: "bg-rose-500" };
  }

  let score = 1;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  const variations = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
  if (variations >= 2) score++;
  if (variations >= 3 && password.length >= 10) score++;
  if (variations === 4 && password.length >= 12) score++;

  if (score <= 1) return { score: 1, label: "Weak", colorClass: "bg-rose-500" };
  if (score === 2) return { score: 2, label: "Fair", colorClass: "bg-amber-500" };
  if (score === 3) return { score: 3, label: "Good", colorClass: "bg-teal-500" };
  return { score: 4, label: "Strong", colorClass: "bg-emerald-500" };
}

export function validateFullName(value: string): string | null {
  if (value.trim().length < 2) return "Enter your full name (at least 2 characters).";
  return null;
}
