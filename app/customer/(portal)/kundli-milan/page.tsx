import React from "react";
import type { Metadata } from "next";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { getCustomerKundliMilansAction, getKundliMilanByIdAction } from "@/app/actions/kundli-milan";
import { getCustomerFullProfile } from "@/app/actions/customer";
import KundliMilanClient from "@/components/kundli-milan/KundliMilanClient";
import { KundliMilanResultView } from "@/components/kundli-milan/KundliMilanResultView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kundli Matching & Ashtakoota Milan | JyotishSetu",
  description: "Authentic 36-guna Vedic compatibility matching for marriage and relationships based on actual birth charts.",
};

interface Props {
  searchParams: Promise<{ id?: string }>;
}

export default async function KundliMilanPage({ searchParams }: Props) {
  await requireCustomerPage();
  const { id } = await searchParams;

  // If a specific Milan ID is requested in query params, load it directly
  if (id) {
    const singleRes = await getKundliMilanByIdAction(id);
    if (singleRes.success && singleRes.data) {
      return (
        <KundliMilanResultView
          record={singleRes.data}
          onBack={undefined}
        />
      );
    }
  }

  // Otherwise load the complete Kundli Milan hub (form + saved history)
  const [milansRes, profileRes] = await Promise.all([
    getCustomerKundliMilansAction(),
    getCustomerFullProfile(),
  ]);

  const initialRecords = milansRes.success && milansRes.data ? milansRes.data : [];
  const customerProfile = profileRes.success && profileRes.data ? profileRes.data : null;

  return (
    <KundliMilanClient
      initialRecords={initialRecords}
      customerProfile={customerProfile}
    />
  );
}
