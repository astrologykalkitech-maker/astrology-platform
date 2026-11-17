import React from "react";
import type { Metadata } from "next";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import {
  getCustomerConversationsAction,
  getEligibleAstrologersAction,
} from "@/app/actions/direct-chat";
import { CustomerChatClient } from "@/components/customer/chat/CustomerChatClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Astrologer Consultation Chat | Karmic Ascension Seeker Portal",
  description: "Direct real-time consultation messaging with your verified Vedic astrologers.",
};

export default async function CustomerChatPage() {
  const { user } = await requireCustomerPage();
  const [convosRes, astrosRes] = await Promise.all([
    getCustomerConversationsAction(),
    getEligibleAstrologersAction(),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-midnight">
          Astrologer Consultation Chat
        </h1>
        <p className="text-xs sm:text-sm text-muted mt-1">
          Direct, real-time messaging with your verified astrologers before and after consultations.
        </p>
      </div>

      <CustomerChatClient
        initialConversations={convosRes.data || []}
        initialAstrologers={astrosRes.data || []}
        currentUserId={user.id}
      />
    </div>
  );
}
