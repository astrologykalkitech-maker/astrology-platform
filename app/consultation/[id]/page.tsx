import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Clock, ShieldAlert } from "lucide-react";
import { getOrCreateConsultationMeeting } from "@/app/actions/consultation-meeting";
import { ConsultationRoomClient } from "@/components/consultation/ConsultationRoomClient";

export const metadata: Metadata = {
  title: "Live Vedic Consultation | Karmic Ascension",
  description: "Secure, confidential, in-house video consultation room.",
};

export default async function ConsultationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await getOrCreateConsultationMeeting(id);

  // If the booking's consultation mode is Chat, route to the dedicated chat interface
  if (res.consultationMode?.toLowerCase() === "chat") {
    if (res.isHost) {
      redirect(`/astrologer/chat?bookingId=${id}`);
    } else {
      redirect(`/customer/chat?bookingId=${id}`);
    }
  }

  if (!res.success || !res.meeting || !res.tokenResult) {
    return (
      <div className="min-h-screen bg-midnight text-parchment flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full rounded-2xl border border-gold/30 bg-midnight/80 backdrop-blur-xl p-6 sm:p-8 text-center shadow-2xl">
          <div className="h-14 w-14 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center mx-auto mb-4 text-gold-deep">
            <Clock className="h-7 w-7" />
          </div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white mb-2">
            Consultation Unavailable
          </h1>
          <p className="text-sm text-parchment-muted mb-6 leading-relaxed">
            {res.error || "Unable to join the consultation room at this time."}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/customer/bookings"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-gold/30 bg-gold/10 hover:bg-gold/20 text-gold-deep font-medium transition text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              Customer Bookings
            </Link>
            <Link
              href="/astrologer/bookings"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-300 font-medium transition text-sm"
            >
              Astrologer Desk
            </Link>
          </div>
          <div className="mt-6 pt-5 border-t border-slate-800/80 text-xs text-parchment-muted flex items-center justify-center gap-2">
            <ShieldAlert className="h-3.5 w-3.5 text-gold-deep" />
            <span>Encrypted In-House LiveKit Media Channel</span>
          </div>
        </div>
      </div>
    );
  }

  const isHost = Boolean(res.isHost);
  const customerName = res.customerName || "Seeker";
  const astrologerName = res.astrologerName || "Vedic Astrologer";

  return (
    <ConsultationRoomClient
      meeting={res.meeting}
      tokenResult={res.tokenResult}
      customerName={customerName}
      astrologerName={astrologerName}
      serviceType={res.serviceType || "Vedic Consultation"}
      scheduledAt={res.scheduledAt || new Date().toISOString()}
      durationMinutes={res.durationMinutes || 30}
      consultationMode={res.consultationMode || "Video"}
      isHost={isHost}
      partnerName={isHost ? customerName : astrologerName}
    />
  );
}
