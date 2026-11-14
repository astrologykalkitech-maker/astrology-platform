import { CustomerPrivacySettingsClient } from "@/components/customer/CustomerPrivacySettingsClient";
import { requireCustomerPage } from "@/lib/auth/customer-guard";

export const metadata = {
  title: "Privacy & Consent Settings | JyotishSetu",
  description: "Manage personal data processing consent, export customer records, and handle account closure.",
};

export default async function CustomerPrivacyPage() {
  await requireCustomerPage();

  return <CustomerPrivacySettingsClient />;
}
