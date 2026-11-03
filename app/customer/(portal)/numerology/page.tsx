import { Metadata } from "next";
import { requireCustomerContext } from "@/lib/auth/customer-guard";
import { getCustomerKundlisAction } from "@/app/actions/kundli";
import { calculateNumerology } from "@/lib/astrology/numerology";
import { NumerologyClient } from "@/components/customer/NumerologyClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vedic & Chaldean Numerology | JyotishSetu",
  description: "Calculate Moolank (Birth Number), Bhagyank (Destiny Number), and Namank (Chaldean Name Number) with personalized cosmic insights.",
};

export default async function CustomerNumerologyPage() {
  const { user, profile } = await requireCustomerContext();

  const kundliRes = await getCustomerKundlisAction();
  const kundlis = kundliRes.success && kundliRes.data ? kundliRes.data : [];

  const defaultDob = kundlis[0]?.date_of_birth || "1995-05-15";
  const defaultName = kundlis[0]?.name || profile?.full_name || "Seeker";

  const initialProfile = calculateNumerology(defaultDob, defaultName);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <NumerologyClient
        defaultName={defaultName}
        defaultDob={defaultDob}
        initialProfile={initialProfile}
      />
    </div>
  );
}
