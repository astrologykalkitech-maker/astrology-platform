import crypto from "node:crypto";

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * Returns standardized, high-performance ICE servers for peer-to-peer WebRTC consultations.
 * Automatically provisions public STUN servers for direct P2P NAT punching,
 * plus Coturn TURN servers with dynamic short-lived HMAC credentials when COTURN_SHARED_SECRET is configured.
 */
export function getWebRtcIceServers(): IceServerConfig[] {
  const iceServers: IceServerConfig[] = [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
      ],
    },
  ];

  // If self-hosted Coturn is configured in environment
  const turnHost = process.env.COTURN_HOST || process.env.NEXT_PUBLIC_COTURN_HOST;
  const turnSecret = process.env.COTURN_SHARED_SECRET;
  const turnUser = process.env.COTURN_STATIC_USERNAME;
  const turnPass = process.env.COTURN_STATIC_PASSWORD;

  if (turnHost) {
    if (turnSecret) {
      // Ephemeral time-limited credentials (standard coturn REST API)
      const expiry = Math.floor(Date.now() / 1000) + 24 * 3600; // 24 hours
      const username = `${expiry}:karmicascension`;
      const hmac = crypto.createHmac("sha1", turnSecret);
      hmac.update(username);
      const credential = hmac.digest("base64");

      iceServers.push(
        {
          urls: [`turn:${turnHost}:3478?transport=udp`, `turn:${turnHost}:3478?transport=tcp`],
          username,
          credential,
        },
        {
          urls: [`turns:${turnHost}:5349?transport=tcp`],
          username,
          credential,
        }
      );
    } else if (turnUser && turnPass) {
      iceServers.push({
        urls: [`turn:${turnHost}:3478?transport=udp`, `turn:${turnHost}:3478?transport=tcp`],
        username: turnUser,
        credential: turnPass,
      });
    }
  }

  return iceServers;
}

