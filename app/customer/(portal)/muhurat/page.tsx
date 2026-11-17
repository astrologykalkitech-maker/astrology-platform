import { Metadata } from "next";
import { requireCustomerContext } from "@/lib/auth/customer-guard";
import { MuhuratSearchClient } from "@/components/customer/MuhuratSearchClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shubh Muhurat Search | Karmic Ascension",
  description: "Find auspicious timings for Marriage, Griha Pravesh, Property, Vehicle, and Business launches based on daily Vedic Panchang.",
};

export default async function CustomerMuhuratPage() {
  await requireCustomerContext();

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <MuhuratSearchClient />
    </div>
  );
}

