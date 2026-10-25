import React from "react";
import { redirect } from "next/navigation";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { getCustomerFullProfile } from "@/app/actions/customer";
import CustomerProfileClient from "./CustomerProfileClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Profile & Kundli Details | JyotishSetu",
  description: "Manage your personal profile and Vedic birth chart details for accurate consultations.",
};

export default async function CustomerProfilePage() {
  await requireCustomerPage();

  const result = await getCustomerFullProfile();

  if (!result.success || !result.data) {
    redirect("/customer");
  }

  return <CustomerProfileClient initialProfile={result.data} />;
}
