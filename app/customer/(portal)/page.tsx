import { redirect } from "next/navigation";
import { requireCustomerPage } from "@/lib/auth/customer-guard";

export const dynamic = "force-dynamic";

/**
 * Customer portal root redirect:
 * Requires verified customer session, then routes to /customer/dashboard.
 */
export default async function CustomerDashboardRoot() {
  await requireCustomerPage();
  redirect("/customer/dashboard");
}
