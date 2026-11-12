/**
 * Open-redirect protection for post-authentication destinations.
 *
 * Accepts only same-origin relative paths. Besides absolute and protocol-relative URLs
 * it rejects backslash tricks (`/\evil.com` is normalised to `//evil.com` by browsers and
 * by `new URL()`), control characters, and encoded variants that decode to either.
 */
export function sanitizeRedirectPath(
  next: string | null | undefined,
  fallback: string = "/"
): string {
  if (!next || typeof next !== "string") return fallback;

  const trimmed = next.trim();
  if (!trimmed.startsWith("/")) return fallback;

  // Reject protocol-relative URLs, backslashes and control characters (raw or percent-encoded)
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return fallback;
  }
  for (const candidate of [trimmed, decoded]) {
    if (candidate.startsWith("//") || candidate.includes("\\")) return fallback;
    const lower = candidate.toLowerCase();
    if (lower.includes("javascript:") || lower.includes("data:") || lower.includes("vbscript:")) {
      return fallback;
    }
    for (let i = 0; i < candidate.length; i++) {
      const code = candidate.charCodeAt(i);
      if (code <= 0x1f || code === 0x7f) return fallback;
    }
  }

  // Allow the legitimate password reset interface: /auth/reset-password (with optional search params)
  const isResetPasswordPath =
    trimmed === "/auth/reset-password" ||
    trimmed.startsWith("/auth/reset-password?") ||
    trimmed.startsWith("/auth/reset-password/");

  // Avoid redirect loops through the OAuth callback, unapproved /auth/ endpoints, or login/signup screens
  if (
    (trimmed.startsWith("/auth/") && !isResetPasswordPath) ||
    trimmed.startsWith("/customer/login") ||
    trimmed.startsWith("/customer/signup") ||
    trimmed.startsWith("/customer/forgot-password") ||
    trimmed.startsWith("/astrologer/login") ||
    trimmed.startsWith("/astrologer/signup") ||
    trimmed.startsWith("/astrologer/forgot-password")
  ) {
    return fallback;
  }

  // Final defence: the path must resolve to the same origin
  try {
    const base = "http://internal.invalid";
    if (new URL(trimmed, base).origin !== base) return fallback;
  } catch {
    return fallback;
  }

  return trimmed;
}
