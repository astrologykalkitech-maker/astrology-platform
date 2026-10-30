import { redirect } from "next/navigation";
import { requireCustomerPage } from "@/lib/auth/customer-guard";

export const dynamic = "force-dynamic";

/**
 * Direct route for /customer/kundli:
 * Routes seeker directly to their Vedic Kundli & birth chart management profile.
 * Prevents 404 when navigating or clicking Kundli links.
 */
export default async function CustomerKundliPage() {
  await requireCustomerPage();
  redirect("/customer/profile");
}

