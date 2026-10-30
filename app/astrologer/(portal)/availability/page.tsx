import type { Metadata } from "next";
import { Clock } from "lucide-react";
import { requireAstrologerPage } from "@/lib/astrologer/guard";
import { getMyAvailabilityAction } from "@/app/actions/astrologer-availability";
import { AstrologerAvailabilityClient } from "@/components/astrologer/availability/AstrologerAvailabilityClient";
import { ErrorState } from "@/components/astrologer/ui/feedback";

export const metadata: Metadata = {
  title: "Availability & Working Hours | JyotishSetu Astrologer Portal",
  description: "Configure weekly working schedules, breaks, and holiday time off.",
};

export default async function AstrologerAvailabilityPage() {
  await requireAstrologerPage();

  const res = await getMyAvailabilityAction();

  if (!res.success || !res.data) {
    return (
      <ErrorState
        title="We couldn't load your availability schedule"
        description={res.error || "Please refresh the page to try again."}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-midnight flex items-center gap-2">
          <Clock className="h-6 w-6 text-gold" />
          Availability & Consultation Schedule
        </h1>
        <p className="text-xs text-muted">
          Manage your working hours, consultation duration, lunch breaks, and holiday time off.
        </p>
      </div>

      <AstrologerAvailabilityClient initialData={res.data} />
    </div>
  );
}

