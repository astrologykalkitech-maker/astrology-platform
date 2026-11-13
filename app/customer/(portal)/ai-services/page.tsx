import { CustomerAIIntelligenceClient } from "@/components/customer/CustomerAIIntelligenceClient";
import { requireCustomerPage } from "@/lib/auth/customer-guard";

export const metadata = {
  title: "AI Astrology Intelligence & Recommendations | JyotishSetu",
  description: "Intelligent Astrologer Matching and Vedic AI Tools Suite.",
};

export default async function CustomerAIPage() {
  await requireCustomerPage();

  return (
    <div className="space-y-6">
      <CustomerAIIntelligenceClient />
    </div>
  );
}
