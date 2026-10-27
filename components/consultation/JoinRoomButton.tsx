"use client";

/**
 * JoinRoomButton
 *
 * A smart button that:
 * 1. Calls /api/consultation-token to get a signed JaaS JWT
 * 2. Opens the authenticated 8x8.vc room URL in a new tab
 *
 * The room URL format: https://8x8.vc/<appId>/<roomName>?jwt=<token>
 * This unlocks: E2EE, cloud recording, dial-in, moderation controls.
 */

import { useState } from "react";
import { ExternalLink, Loader2, Video, PhoneCall } from "lucide-react";

interface JoinRoomButtonProps {
  /** The room identifier (lead UUID or booking UUID) */
  roomId: string;
  /** Role determines moderator privileges */
  role: "customer" | "astrologer";
  /** Which call mode to show */
  mode?: "video" | "voice" | "both";
  className?: string;
}

export function JoinRoomButton({
  roomId,
  role,
  mode = "both",
  className = "",
}: JoinRoomButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin(e: React.MouseEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/consultation-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, role }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }

      const { roomUrl } = await res.json();
      window.open(roomUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open room");
    } finally {
      setLoading(false);
    }
  }

  const baseVideo =
    "inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-700 transition-colors disabled:opacity-60";
  const baseVoice =
    "inline-flex items-center gap-1.5 rounded-xl border border-emerald-600 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-800 shadow-sm hover:bg-emerald-50 transition-colors disabled:opacity-60";

  return (
    <div className={`flex flex-wrap items-center gap-2.5 ${className}`}>
      {(mode === "video" || mode === "both") && (
        <button
          type="button"
          onClick={handleJoin}
          disabled={loading}
          className={baseVideo}
          aria-label="Join secure video consultation room"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Video className="h-4 w-4" />
          )}
          {loading ? "Connecting…" : "Join Video Call"}
          {!loading && <ExternalLink className="h-3 w-3 opacity-75" />}
        </button>
      )}

      {mode === "voice" && (
        <button
          type="button"
          onClick={handleJoin}
          disabled={loading}
          className={baseVoice}
          aria-label="Join secure voice consultation room"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PhoneCall className="h-4 w-4 text-emerald-600" />
          )}
          {loading ? "Connecting…" : "Join Voice Call"}
          {!loading && <ExternalLink className="h-3 w-3 opacity-75" />}
        </button>
      )}

      {mode === "both" && (
        <button
          type="button"
          onClick={handleJoin}
          disabled={loading}
          className={baseVoice}
          aria-label="Join secure voice-only consultation room"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PhoneCall className="h-4 w-4 text-emerald-600" />
          )}
          {loading ? "Connecting…" : "Join Voice Call"}
          {!loading && <ExternalLink className="h-3 w-3 opacity-75" />}
        </button>
      )}

      {error && (
        <p className="w-full text-xs text-red-600 mt-1" role="alert">
          ⚠ {error}
        </p>
      )}
    </div>
  );
}
