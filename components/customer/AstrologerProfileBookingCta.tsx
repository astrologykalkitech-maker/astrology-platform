"use client";

import { useState } from "react";
import { Send, CalendarCheck2 } from "lucide-react";
import Link from "next/link";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import { AstrologerBookingModal } from "@/components/customer/AstrologerBookingModal";

interface AstrologerProfileBookingCtaProps {
  astrologerId: string;
  astrologerName: string;
  voicePrice: number;
  chatPrice: number;
  videoPrice: number;
  consultationUrl: string;
}

export function AstrologerProfileBookingCta({
  astrologerId,
  astrologerName,
  voicePrice,
  chatPrice,
  videoPrice,
  consultationUrl,
}: AstrologerProfileBookingCtaProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className={buttonStyles({
            variant: "gold",
            size: "lg",
            className: "w-full shadow-md text-center justify-center py-3 font-bold cursor-pointer",
          })}
        >
          <CalendarCheck2 className="h-4 w-4 mr-2" /> Book Instant Consultation
        </button>

        <Link
          href={consultationUrl}
          className={buttonStyles({
            variant: "outline",
            size: "md",
            className: "w-full text-center justify-center py-2.5 text-xs text-muted hover:text-midnight",
          })}
        >
          <Send className="h-3.5 w-3.5 mr-1.5" /> Or Submit Free Enquiry First
        </Link>
      </div>

      <AstrologerBookingModal
        astrologerId={astrologerId}
        astrologerName={astrologerName}
        voicePrice={voicePrice}
        chatPrice={chatPrice}
        videoPrice={videoPrice}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
