import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock, ShieldAlert, Sparkles } from "lucide-react";
import { getOrCreateConsultationMeeting } from "@/app/actions/consultation-meeting";
import { ConsultationRoomClient } from "@/components/consultation/ConsultationRoomClient";

export const metadata: Metadata = {
  title: "Live Vedic Consultation | JyotishSetu",
  description: "Secure, confidential, in-house video consultation room.",
};

export default async function ConsultationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await getOrCreateConsultationMeeting(id);

  if (!res.success || !res.meeting || !res.tokenResult) {
    return (
      <div className="min-h-screen bg-midnight text-parchment flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full rounded-2xl border border-gold/30 bg-midnight/80 backdrop-blur-xl p-6 sm:p-8 text-center shadow-2xl">
          <div className="h-14 w-14 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center mx-auto mb-4 text-gold-deep">
            <Clock className="h-7 w-7" />
          </div>

          <h1 className="text-xl font-bold font-display text-white mb-2">
            Consultation Room Status
          </h1>

          <p className="text-xs text-parchment/80 leading-relaxed mb-6">
            {res.error || "Unable to enter consultation room at this time."}
          </p>

          <div className="rounded-xl bg-midnight/60 border border-gold/20 p-3.5 mb-6 text-left flex items-start gap-3">
            <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-parchment/70">
              <p className="font-semibold text-white mb-0.5">Muhurat Lock Policy</p>
              <p>
                To maintain Vedic sanctity and scheduled punctuality, consultation rooms unlock
                precisely 15 minutes prior to the confirmed appointment time.
              </p>
            </div>
          </div>

          <Link
            href="/customer/bookings"
            className="inline-flex items-center justify-center gap-1.5 w-full py-2.5 px-4 rounded-xl bg-gold-deep text-midnight font-semibold text-xs hover:bg-gold transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Return to My Bookings
          </Link>
        </div>
      </div>
    );
  }

  const partnerName = res.isHost ? res.customerName || "Seeker" : res.astrologerName || "Vedic Astrologer";

  return (
    <ConsultationRoomClient
      meeting={res.meeting}
      tokenResult={res.tokenResult}
      customerName={res.customerName || "Seeker"}
      astrologerName={res.astrologerName || "Vedic Astrologer"}
      serviceType={res.serviceType || "Astrology Consultation"}
      scheduledAt={res.scheduledAt || ""}
      durationMinutes={res.durationMinutes || 30}
      consultationMode={res.consultationMode || "Video"}
      isHost={Boolean(res.isHost)}
      partnerName={partnerName}
    />
  );
}

