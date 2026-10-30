import { AccessToken } from "livekit-server-sdk";

export interface GenerateConsultationTokenOptions {
  roomName: string;
  participantIdentity: string;
  participantName: string;
  role: "host" | "customer";
  avatarUrl?: string | null;
  expiresInSeconds?: number;
}

export interface ConsultationTokenResult {
  token: string;
  serverUrl: string;
  roomName: string;
  participantIdentity: string;
  participantName: string;
  isHost: boolean;
}

/**
 * Returns whether LiveKit server credentials are configured in the environment.
 */
export function isLiveKitConfigured(): boolean {
  return Boolean(
    process.env.LIVEKIT_API_KEY?.trim() &&
    process.env.LIVEKIT_API_SECRET?.trim()
  );
}

/**
 * Returns the public client-facing LiveKit WebSocket URL.
 */
export function getLiveKitServerUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim() ||
    process.env.LIVEKIT_URL?.trim() ||
    "wss://astrosetu-3dx4gffs.livekit.cloud";
  return url;
}

/**
 * Generates an authorized, short-lived LiveKit WebRTC JWT for an in-house consultation room.
 * Enforces least-privilege grants and ensures secrets never leak to the client.
 */
export async function generateLiveKitConsultationToken(
  options: GenerateConsultationTokenOptions
): Promise<ConsultationTokenResult> {
  const apiKey = process.env.LIVEKIT_API_KEY?.trim() || "API5iWTsYP3tkbe";
  const apiSecret =
    process.env.LIVEKIT_API_SECRET?.trim() || "EGgq9JNeTargvrjxfiOqcGXVbKPYC2lHgddwZNc7Rph";

  const isHost = options.role === "host";
  const ttl = options.expiresInSeconds || 7200; // 2 hours default

  const at = new AccessToken(apiKey, apiSecret, {
    identity: options.participantIdentity,
    name: options.participantName,
    ttl: `${ttl}s`,
    metadata: JSON.stringify({
      role: options.role,
      avatarUrl: options.avatarUrl || null,
      platform: "JyotishSetu Consultation",
    }),
  });

  at.addGrant({
    room: options.roomName,
    roomJoin: true,
    roomAdmin: isHost,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const token = await at.toJwt();

  return {
    token,
    serverUrl: getLiveKitServerUrl(),
    roomName: options.roomName,
    participantIdentity: options.participantIdentity,
    participantName: options.participantName,
    isHost,
  };
}
