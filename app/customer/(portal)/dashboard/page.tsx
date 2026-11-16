import { redirect } from "next/navigation";
import { requireCustomerPage } from "@/lib/auth/customer-guard";

export const dynamic = "force-dynamic";

/**
 * Redirect /customer/dashboard to /customer/astrologers (the primary customer portal directory).
 */
export default async function CustomerDashboardRedirectPage() {
  await requireCustomerPage();
  redirect("/customer/astrologers");
}
