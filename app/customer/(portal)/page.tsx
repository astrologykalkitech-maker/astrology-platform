import { redirect } from "next/navigation";
import { requireCustomerPage } from "@/lib/auth/customer-guard";

export const dynamic = "force-dynamic";

/**
 * Customer portal root redirect:
 * When any customer logs in or navigates to /customer, they are redirected to /customer/astrologers.
 */
export default async function CustomerPortalRoot() {
  await requireCustomerPage();
  redirect("/customer/astrologers");
}
