import { redirect } from "next/navigation";
import { requireCustomerPage } from "@/lib/auth/customer-guard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Vedic Portal Dashboard | Karmic Ascension",
  description: "Personalized customer portal for Vedic astrology consultations, Kundli, and bookings.",
};

export default async function CustomerPortalRoot() {
  await requireCustomerPage();
  redirect("/customer/astrologers");
}
