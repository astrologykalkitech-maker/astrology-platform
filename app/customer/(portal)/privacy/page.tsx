import { CustomerShell } from "@/components/customer/CustomerShell";
import { CustomerPrivacySettingsClient } from "@/components/customer/CustomerPrivacySettingsClient";
import { requireCustomerPage } from "@/lib/auth/customer-guard";

export const metadata = {
  title: "Privacy & Consent Settings | JyotishSetu",
  description: "Manage personal data processing consent, export customer records, and handle account closure.",
};

export default async function CustomerPrivacyPage() {
  const customer = await requireCustomerPage();

  return (
    <CustomerShell
      customerName={customer.profile.full_name || "Seeker"}
      userInitial={(customer.profile.full_name || "S").charAt(0).toUpperCase()}
      photoUrl={customer.profile.avatar_url}
      userId={customer.user.id}
    >
      <CustomerPrivacySettingsClient />
    </CustomerShell>
  );
}
