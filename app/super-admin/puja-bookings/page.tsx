import React from "react";
import { requireSuperAdmin } from "@/lib/auth/admin-guard";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import {
  getSuperAdminPujaBookings,
  getEligiblePandits,
} from "@/app/actions/super-admin-puja-bookings";
import { SuperAdminPujaBookingsClient } from "@/components/admin/SuperAdminPujaBookingsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Puja Bookings Management | JyotishSetu Super Admin",
  description: "Monitor and manage customer Puja bookings, Gotra details, and statuses.",
};

export default async function SuperAdminPujaBookingsPage() {
  await requireSuperAdmin();
  const [bRes, pRes] = await Promise.all([
    getSuperAdminPujaBookings(),
    getEligiblePandits(),
  ]);

  const bookings = bRes.success ? bRes.data : [];
  const eligiblePandits = pRes.success ? pRes.data : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
      <div>
        <CardTitle>Puja Booking Management & Ritual Execution</CardTitle>
        <p className="text-xs text-muted">
          Oversee seeker Sankalp details, assign approved temple priests, monitor Live Darshan, and review sacred completion evidence.
        </p>
      </div>

      <SuperAdminPujaBookingsClient
        initialBookings={bookings}
        eligiblePandits={eligiblePandits}
      />
    </div>
  );
}
