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
    for (let i = 0; i < candidate.length; i++) {
      const code = candidate.charCodeAt(i);
      if (code <= 0x1f || code === 0x7f) return fallback;
    }
  }

  // Avoid redirect loops through the OAuth callback
  if (trimmed.startsWith("/auth/callback")) return fallback;

  // Final defence: the path must resolve to the same origin
  try {
    const base = "http://internal.invalid";
    if (new URL(trimmed, base).origin !== base) return fallback;
  } catch {
    return fallback;
  }

  return trimmed;
}
