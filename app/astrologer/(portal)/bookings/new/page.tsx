import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import BookingForm from "./BookingForm";

export const metadata = {
  title: "Create Booking | JyotishSetu",
  description: "Schedule a new consultation booking for a customer.",
};

export default function NewBookingPage() {
  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/astrologer/dashboard"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <CardTitle>Create Booking</CardTitle>
          <p className="text-xs text-muted">Schedule a new consultation for a customer.</p>
        </div>
      </div>
      <BookingForm />
    </div>
  );
}
