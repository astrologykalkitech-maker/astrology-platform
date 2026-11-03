import React from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { getKundliByIdAction } from "@/app/actions/kundli";
import KundliDetailClient from "@/components/kundli/KundliDetailClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vedic Kundli Details | JyotishSetu",
  description: "View birth charts, planetary positions, houses, nakshatra interpretations, and Vimshottari dasha.",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function KundliDetailPage({ params }: Props) {
  await requireCustomerPage();
  const { id } = await params;

  if (!id) {
    notFound();
  }

  const res = await getKundliByIdAction(id);
  if (!res.success || !res.data) {
    redirect("/customer/kundli");
  }

  return <KundliDetailClient kundli={res.data} />;
}

