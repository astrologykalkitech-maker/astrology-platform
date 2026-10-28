import React from "react";
import Link from "next/link";
import {
  Compass,
  MessageSquarePlus,
} from "lucide-react";
import { getPublicApprovedAstrologers } from "@/lib/astrologer/queries";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import AstrologersDirectoryClient from "./AstrologersDirectoryClient";

export const dynamic = "force-dynamic";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default async function FindAstrologersPage() {
  const [, astrologers] = await Promise.all([
    requireCustomerPage(),
    getPublicApprovedAstrologers({ limit: 100 }),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Certified Astrologers Directory</CardTitle>
          <p className="text-xs text-muted mt-1">
            Browse our panel of verified Vedic astrologers, numerologists, and spiritual mentors.
          </p>
        </div>
        <Link
          href="/customer/enquiries/new"
          className={buttonStyles({ variant: "outline", size: "sm" })}
        >
          <MessageSquarePlus className="h-4 w-4" /> Ask Platform Directly
        </Link>
      </div>

      {astrologers.length === 0 ? (
        <div className={`${CARD} py-16 px-6 text-center`}>
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep mb-3">
            <Compass className="h-7 w-7" />
          </span>
          <h2 className="text-lg font-semibold text-midnight">No Astrologers Listed Yet</h2>
          <p className="text-xs text-muted max-w-md mx-auto mt-1 mb-5">
            Astrologer profiles are currently undergoing administrative verification. You can still submit general platform consultation enquiries.
          </p>
          <Link href="/customer/enquiries/new" className={buttonStyles({ variant: "gold", size: "sm" })}>
            Submit General Enquiry
          </Link>
        </div>
      ) : (
        <AstrologersDirectoryClient astrologers={astrologers} />
      )}
    </div>
  );
}