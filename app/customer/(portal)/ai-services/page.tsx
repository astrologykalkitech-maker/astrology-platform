import { CustomerShell } from "@/components/customer/CustomerShell";
import { CustomerAIIntelligenceClient } from "@/components/customer/CustomerAIIntelligenceClient";
import { requireCustomerPage } from "@/lib/auth/customer-guard";

export const metadata = {
  title: "AI Astrology Intelligence & Recommendations | JyotishSetu",
  description: "Intelligent Astrologer Matching and Vedic AI Tools Suite.",
};

export default async function CustomerAIPage() {
  const customer = await requireCustomerPage();

  return (
    <CustomerShell
      customerName={customer.profile.full_name || "Seeker"}
      userInitial={(customer.profile.full_name || "S").charAt(0).toUpperCase()}
      photoUrl={customer.profile.avatar_url}
      userId={customer.user.id}
    >
      <div className="space-y-6">
        <CustomerAIIntelligenceClient />
      </div>
    </CustomerShell>
  );
}
