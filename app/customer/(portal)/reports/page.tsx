import { Metadata } from "next";
import { requireCustomerContext } from "@/lib/auth/customer-guard";
import { getCustomerKundlisAction } from "@/app/actions/kundli";
import { ReportsLibraryClient } from "@/components/customer/ReportsLibraryClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Advanced Astrology Report Library | JyotishSetu",
  description: "Generate and access comprehensive Vedic astrology reports including Full Janam Kundli, Career, Marriage, and Dasha Analysis.",
};

export default async function CustomerReportsPage() {
  await requireCustomerContext();
  const kundliRes = await getCustomerKundlisAction();
  const kundlis = kundliRes.success && kundliRes.data ? kundliRes.data : [];

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <ReportsLibraryClient kundlis={kundlis} />
    </div>
  );
}

