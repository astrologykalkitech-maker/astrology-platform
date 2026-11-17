import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Universal redirect for legacy or direct visits to /customer/dashboard.
 * Safely redirects the user to /customer/astrologers (the primary customer portal page).
 */
export default function CustomerDashboardPage() {
  redirect("/customer/astrologers");
}
