import { redirect } from "next/navigation";
import { requireCustomerPage } from "@/lib/auth/customer-guard";

export const dynamic = "force-dynamic";

export default async function MilanRedirectPage() {
  await requireCustomerPage();
  redirect("/customer/kundli-milan");
}

