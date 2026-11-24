import React from "react";
import type { Metadata } from "next";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import {
  getCustomerConversationsAction,
  getEligibleAstrologersAction,
  getOrCreateBookingConversationAction,
} from "@/app/actions/direct-chat";
import { CustomerChatClient } from "@/components/customer/chat/CustomerChatClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Astrologer Consultation Chat | Karmic Ascension Seeker Portal",
  description: "Direct real-time consultation messaging with your verified Vedic astrologers.",
};

export default async function CustomerChatPage({
  searchParams,
}: {
  searchParams?: Promise<{ bookingId?: string; conversationId?: string }>;
}) {
  const { user } = await requireCustomerPage();
  const sp = searchParams ? await searchParams : {};
  let targetConversationId = sp.conversationId || null;

  if (sp.bookingId && !targetConversationId) {
    const convoRes = await getOrCreateBookingConversationAction(sp.bookingId);
    if (convoRes.success && convoRes.conversationId) {
      targetConversationId = convoRes.conversationId;
    }
  }

  const [convosRes, astrosRes] = await Promise.all([
    getCustomerConversationsAction(),
    getEligibleAstrologersAction(),
  ]);

  const allConversations = convosRes.data || [];
  const allAstrologers = astrosRes.data || [];

  // When entering from a specific chat consultation booking, scope strictly to that astrologer's conversation
  const scopedConversations =
    sp.bookingId && targetConversationId
      ? allConversations.filter((c) => c.id === targetConversationId)
      : allConversations;

  const scopedAstrologerIds = new Set(scopedConversations.map((c) => c.astrologer_id));
  const scopedAstrologers =
    sp.bookingId && targetConversationId
      ? allAstrologers.filter((a) => scopedAstrologerIds.has(a.id))
      : allAstrologers;

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
        initialConversations={scopedConversations}
        initialAstrologers={scopedAstrologers}
        currentUserId={user.id}
        initialSelectedConversationId={targetConversationId}
      />
    </div>
  );
}
