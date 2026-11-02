import { redirect } from "next/navigation";
import { requireCustomerPage } from "@/lib/auth/customer-guard";

export const dynamic = "force-dynamic";

/**
 * Customer portal root redirect:
 * Requires verified customer session, then routes to the astrologer directory.
 */
export default async function CustomerPortalRoot() {
  await requireCustomerPage();
  redirect("/customer/astrologers");
}
