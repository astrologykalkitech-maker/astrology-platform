import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Customer dashboard root redirect:
 * Per user requirements, the customer dashboard index redirects directly
 * to the astrologers discovery page (/customer/astrologers).
 */
export default function CustomerDashboardRoot() {
  redirect("/customer/astrologers");
}