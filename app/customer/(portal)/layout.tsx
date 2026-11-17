import type { ReactNode } from "react";
import { getOptionalCustomerPage } from "@/lib/auth/customer-guard";
import { CustomerShell } from "@/components/customer/CustomerShell";

export const metadata = {
  title: "Customer Portal | Karmic Ascension",
  description: "Customer portal for divine Vedic astrology consultations, verified astrologers, and enquiries.",
};

export default async function CustomerLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { profile, user } = await getOptionalCustomerPage();

  const customerName = profile?.full_name || "Guest Seeker";
  const userInitial = (customerName[0] || "G").toUpperCase();
  const photoUrl = profile?.avatar_url ?? null;
  const isLoggedIn = Boolean(user && profile);

  return (
    <CustomerShell
      customerName={customerName}
      userInitial={userInitial}
      photoUrl={photoUrl}
      userId={user?.id || ""}
      isLoggedIn={isLoggedIn}
    >
      {children}
    </CustomerShell>
  );
}
