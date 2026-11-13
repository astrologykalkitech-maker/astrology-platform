import { CustomerShell } from "@/components/customer/CustomerShell";
import { CustomerCommunityFeedClient } from "@/components/customer/CustomerCommunityFeedClient";
import { getCommunityFeedAction } from "@/app/actions/community";
import { requireCustomerPage } from "@/lib/auth/customer-guard";

export const metadata = {
  title: "Vedic Community & Satsang Feed | JyotishSetu",
  description: "Moderated Vedic astrology discussions, astrologer insights and spiritual announcements.",
};

export default async function CommunityFeedPage() {
  const customer = await requireCustomerPage();
  const feedRes = await getCommunityFeedAction({ limit: 30 });

  return (
    <CustomerShell
      customerName={customer.profile.full_name || "Seeker"}
      userInitial={(customer.profile.full_name || "S").charAt(0).toUpperCase()}
      photoUrl={customer.profile.avatar_url}
      userId={customer.user.id}
    >
      <CustomerCommunityFeedClient
        initialPosts={feedRes.data || []}
        currentUserId={customer.user.id}
      />
    </CustomerShell>
  );
}
