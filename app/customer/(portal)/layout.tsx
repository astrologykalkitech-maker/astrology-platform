import type { ReactNode } from "react";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { CustomerShell } from "@/components/customer/CustomerShell";

export const metadata = {
  title: "Customer Portal | JyotishSetu",
  description: "Customer portal for divine Vedic astrology consultations, verified astrologers, and enquiries.",
};

export default async function CustomerLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { profile } = await requireCustomerPage();

  const customerName = profile.full_name || "Customer";
  const userInitial = (customerName[0] || "C").toUpperCase();

  return (
    <CustomerShell customerName={customerName} userInitial={userInitial} isLoggedIn={true}>
      {children}
    </CustomerShell>
  );
}
