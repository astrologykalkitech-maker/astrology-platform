import React from "react";
import { requireAstrologerPage } from "@/lib/astrologer/guard";
import { getAstrologerSubscriptionDetails } from "@/app/actions/payments";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { AstrologerSubscriptionClient } from "@/components/astrologer/AstrologerSubscriptionClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Subscription & Membership Plans | JyotishSetu",
  description: "Manage your astrologer subscription tier, lead quotas, and commission rates.",
};

export default async function AstrologerSubscriptionPage() {
  await requireAstrologerPage();
  const res = await getAstrologerSubscriptionDetails();
  const subData = res.success && res.data ? res.data : { subscription: null, availablePlans: [] };

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div>
        <CardTitle>Astrologer Subscription & Lead Quotas</CardTitle>
        <p className="text-xs text-muted">
          Manage your platform tier, monthly verified client lead quotas, and commission advantages.
        </p>
      </div>

      <AstrologerSubscriptionClient
        subscription={subData.subscription}
        availablePlans={subData.availablePlans}
      />
    </div>
  );
}

