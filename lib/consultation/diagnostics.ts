/**
 * Consultation Routing & Telemetry Diagnostics
 * Safe, privacy-preserving structured logging across customer and astrologer devices.
 * NEVER logs JWT tokens, secrets, or sensitive consultation data.
 */

export interface ConsultationDiagnosticEvent {
  event:
    | "provider_resolution"
    | "route_navigation"
    | "meeting_authorized"
    | "token_generated"
    | "room_connected"
    | "connection_error"
    | "meeting_ended_for_all";
  appVersion: string;
  bookingId: string;
  provider: "inhouse-livekit";
  route: string;
  role?: "customer" | "astrologer";
  roomName?: string;
  connectionState?: string;
  deviceType?: "mobile" | "desktop" | "tablet";
  timestamp: string;
}

export const APP_CONFERENCING_VERSION = "2.1.0-inhouse-livekit";

export function logConsultationDiagnostic(
  event: ConsultationDiagnosticEvent["event"],
  details: {
    bookingId: string;
    role?: "customer" | "astrologer";
    roomName?: string;
    connectionState?: string;
  }
): void {
  const isClient = typeof window !== "undefined";
  let deviceType: "mobile" | "desktop" | "tablet" = "desktop";

  if (isClient && typeof navigator !== "undefined") {
    const ua = navigator.userAgent.toLowerCase();
    if (/tablet|ipad|playbook|silk/i.test(ua)) {
      deviceType = "tablet";
    } else if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua)) {
      deviceType = "mobile";
    }
  }

  const payload: ConsultationDiagnosticEvent = {
    event,
    appVersion: APP_CONFERENCING_VERSION,
    bookingId: details.bookingId,
    provider: "inhouse-livekit",
    route: `/consultation/${details.bookingId}`,
    role: details.role,
    roomName: details.roomName,
    connectionState: details.connectionState,
    deviceType,
    timestamp: new Date().toISOString(),
  };

  if (process.env.NODE_ENV !== "production" || isClient) {
    console.info(`[ConsultationDiagnostics:${event}]`, payload);
  }
}

