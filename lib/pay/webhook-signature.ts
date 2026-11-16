import crypto from "node:crypto";

export function isValidJyotishWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !secret) return false;
  const normalizedSignature = signature.trim().replace(/^sha256=/i, "");
  if (!/^[a-f0-9]{64}$/i.test(normalizedSignature)) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest();
  const provided = Buffer.from(normalizedSignature, "hex");
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}
