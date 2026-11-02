/**
 * Helpers for safely interpolating user input into PostgREST `.or()` / `.ilike()` filter strings.
 *
 * PostgREST parses `.or("a.eq.x,b.eq.y")` by splitting on commas and parentheses, so an
 * unsanitised value such as `x,assigned_to.neq.0` injects an extra condition.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns the lower-cased UUID, or null when the value is not a well-formed UUID. */
export function toUuidOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed.toLowerCase() : null;
}

/**
 * Replaces characters that have structural meaning inside a PostgREST filter expression
 * (comma, parentheses, quotes, backslash and control characters) with spaces and caps the
 * length. Dots and percent signs are kept: they are harmless inside a value once commas and
 * parentheses are gone.
 */
export function sanitizeFilterTerm(term: string, maxLength = 100): string {
  let out = "";
  for (const ch of term) {
    const code = ch.charCodeAt(0);
    const structural = ",()\"'\\".includes(ch) || code <= 0x1f || code === 0x7f;
    out += structural ? " " : ch;
  }
  return out.replace(/\s+/g, " ").trim().slice(0, maxLength);
}
