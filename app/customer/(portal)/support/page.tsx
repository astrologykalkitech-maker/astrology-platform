import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import CustomerSupportInteractiveClient from "./CustomerSupportInteractiveClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Customer Support & Escalations | Karmic Ascension",
  description:
    "Direct escalation to administrative support, booking guidance, and consultation resolution.",
};

export default async function CustomerSupportPage() {
  await requireCustomerPage();

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/customer/astrologers"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors"
          aria-label="Back to astrologers"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <CardTitle>Customer Support & Escalations</CardTitle>
          <p className="text-xs text-muted">
            Direct escalation pathways to platform administrators and instant consultation guidance.
          </p>
        </div>
      </div>

      <CustomerSupportInteractiveClient />
    </div>
  );
}
