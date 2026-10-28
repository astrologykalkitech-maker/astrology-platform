import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import BookingForm from "./BookingForm";

export const metadata = {
  title: "Create Booking | JyotishSetu",
  description: "Schedule a new consultation booking for a customer.",
};

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{
    customerId?: string;
    customerName?: string;
    leadId?: string;
    serviceType?: string;
  }>;
}) {
  const { customerId, customerName, leadId, serviceType } = await searchParams;

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/astrologer/bookings"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors"
          aria-label="Back to bookings"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <CardTitle>Schedule Consultation</CardTitle>
          <p className="text-xs text-muted">
            Create an official Vedic consultation session with encrypted room link.
          </p>
        </div>
      </div>
      <BookingForm
        initialCustomerId={customerId}
        initialCustomerName={customerName}
        initialLeadId={leadId}
        initialServiceType={serviceType}
      />
    </div>
  );
}
