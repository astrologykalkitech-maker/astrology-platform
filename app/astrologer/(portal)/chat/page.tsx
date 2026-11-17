import type { Metadata } from "next";
import { requireAstrologerPage } from "@/lib/astrologer/guard";
import {
  getAstrologerConversationsAction,
  getEligibleSeekersAction,
} from "@/app/actions/direct-chat";
import { AstrologerChatClient } from "@/components/astrologer/chat/AstrologerChatClient";
import { ErrorState } from "@/components/astrologer/ui/feedback";

export const metadata: Metadata = {
  title: "Direct Messages | Karmic Ascension Astrologer Portal",
  description: "One-to-one consultation messaging with seekers.",
};

export default async function AstrologerChatPage() {
  const profile = await requireAstrologerPage();

  const [convosRes, seekersRes] = await Promise.all([
    getAstrologerConversationsAction(),
    getEligibleSeekersAction(),
  ]);

  if (!convosRes.success && !seekersRes.success) {
    return (
      <ErrorState
        title="We couldn't load your consultation chat"
        description="Please refresh the page to try again."
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-midnight">Seeker Consultation Chat</h1>
          <p className="text-xs text-muted mt-0.5">
            Direct, real-time messaging with your seekers before and after scheduled consultations.
          </p>
        </div>
      </div>

      <AstrologerChatClient
        initialConversations={convosRes.data || []}
        initialSeekers={seekersRes.data || []}
        currentUserId={profile.id}
      />
    </div>
  );
}
