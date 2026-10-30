/**
 * Consultation Provider Service
 * Enforces server-authoritative, in-house LiveKit consultation routing across all devices.
 * Jitsi, external meeting links, and third-party redirects are strictly prohibited.
 */

import { logConsultationDiagnostic } from "./diagnostics";

export interface ConsultationProviderResolution {
  provider: "inhouse-livekit";
  route: string;
  isExternal: false;
  version: string;
}

export function resolveConsultationRoute(bookingId: string): ConsultationProviderResolution {
  return {
    provider: "inhouse-livekit",
    route: `/consultation/${bookingId}`,
    isExternal: false,
    version: "2.1.0-inhouse",
  };
}

export function getBookingConsultationUrl(bookingId: string): string {
  if (typeof window !== "undefined") {
    logConsultationDiagnostic("route_navigation", { bookingId });
  }
  return `/consultation/${bookingId}`;
}
