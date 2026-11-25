/**
 * Consultation Provider Service
 * Enforces server-authoritative, mode-aware consultation routing across all devices.
 * Jitsi, external meeting links, and third-party redirects are strictly prohibited.
 */

import { logConsultationDiagnostic } from "./diagnostics";

export interface ConsultationProviderResolution {
  provider: "inhouse-livekit" | "inhouse-chat" | "inhouse-voice";
  route: string;
  isExternal: false;
  version: string;
  mode: "Chat" | "Call" | "Video";
}

/**
 * Authoritatively resolves the destination consultation route based on booking mode and role.
 * Normalized to handle lowercase, uppercase, and alternative terminology safely.
 */
export function resolveConsultationRoute(
  bookingId: string,
  mode?: string | null,
  role: "customer" | "astrologer" = "customer"
): ConsultationProviderResolution {
  const normalized = (mode || "").trim().toLowerCase();

  if (normalized === "chat") {
    const route = role === "astrologer" ? `/astrologer/chat?bookingId=${bookingId}` : `/customer/chat?bookingId=${bookingId}`;
    return {
      provider: "inhouse-chat",
      route,
      isExternal: false,
      version: "2.1.0-inhouse",
      mode: "Chat",
    };
  }

  // Voice/Call consultations use dedicated in-house audio-only LiveKit session
  if (normalized === "call" || normalized === "voice") {
    return {
      provider: "inhouse-voice",
      route: `/consultation/${bookingId}`,
      isExternal: false,
      version: "2.1.0-inhouse",
      mode: "Call",
    };
  }

  // Video consultation default
  return {
    provider: "inhouse-livekit",
    route: `/consultation/${bookingId}`,
    isExternal: false,
    version: "2.1.0-inhouse",
    mode: "Video",
  };
}

export function getBookingConsultationUrl(
  bookingId: string,
  mode?: string | null,
  role: "customer" | "astrologer" = "customer"
): string {
  if (typeof window !== "undefined") {
    logConsultationDiagnostic("route_navigation", { bookingId, role });
  }
  return resolveConsultationRoute(bookingId, mode, role).route;
}
