import type { ReactNode } from "react";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import CustomerLayoutClient from "./CustomerLayoutClient";

export const metadata = {
  title: "Customer Portal | AstroConnect",
  description: "Customer portal for connecting with certified Vedic astrologers.",
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
    <CustomerLayoutClient customerName={customerName} userInitial={userInitial}>
      {children}
    </CustomerLayoutClient>
  );
}