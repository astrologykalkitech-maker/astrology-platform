import type { Metadata } from "next";
import { Star } from "lucide-react";
import { requireSuperAdminPage } from "@/lib/auth/admin-guard";
import { getAdminReviewsAction } from "@/app/actions/admin-reviews";
import { AdminReviewsClient } from "./AdminReviewsClient";
import { ErrorState } from "@/components/astrologer/ui/feedback";

export const metadata: Metadata = {
  title: "Review Moderation & Feedback | Super Admin | JyotishSetu",
  description: "Monitor, publish, hide, and moderate customer consultation reviews.",
};

export default async function SuperAdminReviewsPage() {
  await requireSuperAdminPage();

  const res = await getAdminReviewsAction();

  if (!res.success || !res.data) {
    return (
      <ErrorState
        title="We couldn't load customer consultation reviews"
        description={res.error || "Please refresh the page to try again."}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-midnight flex items-center gap-2">
          <Star className="h-6 w-6 text-gold fill-gold/20" />
          Customer Reviews & Moderation
        </h1>
        <p className="text-xs text-muted">
          Review authentic feedback from completed consultations, control public visibility, and ensure compliance.
        </p>
      </div>

      <AdminReviewsClient initialData={res.data} />
    </div>
  );
}

