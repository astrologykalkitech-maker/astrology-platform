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
 * Thrown when LiveKit credentials or URL are missing. Callers should log the
 * message server-side and show users a generic "video service unavailable" error.
 */
export class LiveKitConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveKitConfigError";
  }
}

export interface LiveKitConfig {
  apiKey: string;
  apiSecret: string;
  /** WebSocket URL handed to browsers (wss://...). */
  wsUrl: string;
  /** HTTP(S) URL for the server-side RoomServiceClient (https://...). */
  httpUrl: string;
}

/**
 * Resolves LiveKit configuration from the environment and fails closed:
 * there are intentionally no hardcoded fallback credentials or hosts.
 */
export function getLiveKitConfig(): LiveKitConfig {
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  const url =
    process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim() ||
    process.env.LIVEKIT_URL?.trim();

  const missing: string[] = [];
  if (!apiKey) missing.push("LIVEKIT_API_KEY");
  if (!apiSecret) missing.push("LIVEKIT_API_SECRET");
  if (!url) missing.push("LIVEKIT_URL or NEXT_PUBLIC_LIVEKIT_URL");
  if (missing.length > 0 || !apiKey || !apiSecret || !url) {
    throw new LiveKitConfigError(
      `LiveKit is not configured. Missing environment variable(s): ${missing.join(", ")}.`
    );
  }

  return {
    apiKey,
    apiSecret,
    wsUrl: url.replace(/^http/i, "ws"),
    httpUrl: url.replace(/^ws/i, "http"),
  };
}

/**
 * Returns whether LiveKit server credentials and URL are configured in the environment.
 */
export function isLiveKitConfigured(): boolean {
  try {
    getLiveKitConfig();
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the public client-facing LiveKit WebSocket URL.
 * Throws LiveKitConfigError when no URL is configured.
 */
export function getLiveKitServerUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim() ||
    process.env.LIVEKIT_URL?.trim();
  if (!url) {
    throw new LiveKitConfigError(
      "LiveKit is not configured. Missing environment variable(s): LIVEKIT_URL or NEXT_PUBLIC_LIVEKIT_URL."
    );
  }
  return url.replace(/^http/i, "ws");
}

/**
 * Generates an authorized, short-lived LiveKit WebRTC JWT for an in-house consultation room.
 * Enforces least-privilege grants and ensures secrets never leak to the client.
 */
export async function generateLiveKitConsultationToken(
  options: GenerateConsultationTokenOptions
): Promise<ConsultationTokenResult> {
  const { apiKey, apiSecret, wsUrl } = getLiveKitConfig();

  const isHost = options.role === "host";
  const ttl = options.expiresInSeconds || 7200; // 2 hours default

  const at = new AccessToken(apiKey, apiSecret, {
    identity: options.participantIdentity,
    name: options.participantName,
    ttl: `${ttl}s`,
    metadata: JSON.stringify({
      role: options.role,
      avatarUrl: options.avatarUrl || null,
      platform: "Karmic Ascension Consultation",
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
    serverUrl: wsUrl,
    roomName: options.roomName,
    participantIdentity: options.participantIdentity,
    participantName: options.participantName,
    isHost,
  };
}
