/**
 * JaaS (Jitsi as a Service) JWT Token Generator
 *
 * Generates signed RS256 JWT tokens for authenticated 8x8.vc consultation rooms.
 * Features unlocked by JWT auth:
 *  - End-to-end encryption (E2EE)
 *  - Cloud recording to AWS S3
 *  - In-call dial-in phone numbers
 *  - Automated moderation (mute all, lobby, room passwords)
 *
 * Docs: https://developer.8x8.com/jaas/docs/api-keys-jwt
 */

import { SignJWT, importPKCS8 } from "jose";

export interface JaasParticipant {
  /** Internal user ID (Supabase UUID or similar) */
  id: string;
  /** Full display name shown in the call UI */
  name: string;
  /** Avatar URL (optional) */
  avatarUrl?: string;
  /** Email (optional – used for recording attribution) */
  email?: string;
  /** Whether this participant has moderator privileges */
  isModerator: boolean;
}

export interface JaasTokenOptions {
  /** The room name (e.g. booking UUID or lead UUID) */
  room: string;
  participant: JaasParticipant;
  /** Token lifetime in seconds. Default: 2 hours */
  expiresInSeconds?: number;
}

/**
 * Generates a signed JaaS JWT token.
 * MUST only be called from server-side code (API routes, server actions, server components).
 */
export async function generateJaasToken(options: JaasTokenOptions): Promise<string> {
  const appId = process.env.JAAS_APP_ID;
  const keyId = process.env.JAAS_KEY_ID;
  const privateKeyPem = process.env.JAAS_PRIVATE_KEY;

  if (!appId || !keyId || !privateKeyPem) {
    throw new Error(
      "JaaS configuration missing. Set JAAS_APP_ID, JAAS_KEY_ID, and JAAS_PRIVATE_KEY in .env.local"
    );
  }

  // Normalise the PEM key (env vars may have literal \n or actual newlines)
  const normalizedPem = privateKeyPem.replace(/\\n/g, "\n");

  // Import the RSA private key
  const privateKey = await importPKCS8(normalizedPem, "RS256");

  const now = Math.floor(Date.now() / 1000);
  const expiresIn = options.expiresInSeconds ?? 7200; // 2 hours default

  const token = await new SignJWT({
    // JaaS-required claims
    iss: "chat",
    aud: "jitsi",
    sub: appId,
    room: options.room,

    // Participant context (name, avatar, role shown inside the meeting)
    context: {
      user: {
        id: options.participant.id,
        name: options.participant.name,
        avatar: options.participant.avatarUrl ?? "",
        email: options.participant.email ?? "",
        moderator: options.participant.isModerator,
        "hidden-from-recorder": false,
      },
      features: {
        // Unlock production features
        recording: true,
        "live-streaming": false,
        transcription: false,
        "outbound-call": options.participant.isModerator, // only moderator can dial out
      },
    },
  })
    .setProtectedHeader({
      alg: "RS256",
      kid: keyId,
      typ: "JWT",
    })
    .setIssuedAt(now)
    .setNotBefore(now - 10) // 10-second clock-skew tolerance
    .setExpirationTime(now + expiresIn)
    .sign(privateKey);

  return token;
}

/**
 * Builds the full authenticated 8x8.vc room URL.
 * Format: https://8x8.vc/<appId>/<roomName>?jwt=<token>
 */
export function buildJaasRoomUrl(appId: string, roomName: string, jwt: string): string {
  const encodedRoom = encodeURIComponent(roomName);
  return `https://8x8.vc/${appId}/${encodedRoom}?jwt=${jwt}`;
}

/**
 * Sanitises a room name to be safe for JaaS.
 * Only alphanumeric, hyphens and underscores are allowed.
 */
export function sanitiseRoomName(rawId: string): string {
  return `jyotishsetu-${rawId.replace(/[^a-zA-Z0-9-_]/g, "")}`;
}
