"use client";

/**
 * JoinRoomButton
 *
 * Direct in-app video consultation launcher for leads & bookings.
 * Routes directly to the branded in-house consultation room (/consultation/[roomId]).
 */

import { useRouter } from "next/navigation";
import { Video, PhoneCall } from "lucide-react";

interface JoinRoomButtonProps {
  roomId: string;
  role: "customer" | "astrologer";
  mode?: "video" | "voice" | "both";
  className?: string;
}

export function JoinRoomButton({
  roomId,
  mode = "both",
  className = "",
}: JoinRoomButtonProps) {
  const router = useRouter();

  function handleJoin(e: React.MouseEvent) {
    e.preventDefault();
    router.push(`/consultation/${roomId}`);
  }

  const baseVideo =
    "inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-700 transition-colors cursor-pointer";
  const baseVoice =
    "inline-flex items-center gap-1.5 rounded-xl border border-emerald-600 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-800 shadow-sm hover:bg-emerald-50 transition-colors cursor-pointer";

  return (
    <div className={`flex flex-wrap items-center gap-2.5 ${className}`}>
      {(mode === "video" || mode === "both") && (
        <button
          type="button"
          onClick={handleJoin}
          className={baseVideo}
          aria-label="Join secure video consultation room"
        >
          <Video className="h-4 w-4" />
          <span>Join Video Call</span>
        </button>
      )}

      {mode === "voice" && (
        <button
          type="button"
          onClick={handleJoin}
          className={baseVoice}
          aria-label="Join secure voice consultation room"
        >
          <PhoneCall className="h-4 w-4 text-emerald-600" />
          <span>Join Voice Call</span>
        </button>
      )}
    </div>
  );
}
