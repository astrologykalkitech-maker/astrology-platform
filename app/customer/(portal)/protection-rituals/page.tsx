import { Metadata } from "next";
import { requireCustomerContext } from "@/lib/auth/customer-guard";
import { getCustomerProtectionRitualsAction } from "@/app/actions/protection-rituals";
import { CustomerProtectionRitualsClient } from "@/components/customer/CustomerProtectionRitualsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vedic Protection Rituals | Karmic Ascension",
  description: "Authentic Vedic rituals and sacred practices for Evil Eye (Drishti Dosha), negative energy clearing, and spiritual home protection.",
};

export default async function CustomerProtectionRitualsPage() {
  await requireCustomerContext();

  const ritualsRes = await getCustomerProtectionRitualsAction();
  const rituals = ritualsRes.success && ritualsRes.data ? ritualsRes.data : [];

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <CustomerProtectionRitualsClient initialRituals={rituals} />
    </div>
  );
}
