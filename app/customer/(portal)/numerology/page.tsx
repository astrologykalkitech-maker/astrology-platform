import { Metadata } from "next";
import { requireCustomerContext } from "@/lib/auth/customer-guard";
import { getCustomerKundlisAction } from "@/app/actions/kundli";
import { calculateComprehensiveNumerology } from "@/lib/astrology/numerology-engine";
import { NumerologyClient } from "@/components/customer/NumerologyClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vedic & Chaldean Numerology | Karmic Ascension",
  description: "Calculate Moolank (Birth Number), Bhagyank (Destiny Number), and Namank (Chaldean Name Number) with personalized cosmic insights.",
};

export default async function CustomerNumerologyPage() {
  const { user, profile } = await requireCustomerContext();

  const kundliRes = await getCustomerKundlisAction();
  const kundlis = kundliRes.success && kundliRes.data ? kundliRes.data : [];

  const defaultDob = kundlis[0]?.date_of_birth || "1995-05-15";
  const defaultName = kundlis[0]?.name || profile?.full_name || "Seeker";
  const defaultTime = kundlis[0]?.time_of_birth || null;
  const defaultPlace = kundlis[0]?.birth_place || null;
  const defaultLat = kundlis[0]?.latitude ?? null;
  const defaultLng = kundlis[0]?.longitude ?? null;
  const defaultTz = kundlis[0]?.timezone ?? 5.5;

  const initialReport = calculateComprehensiveNumerology({
    fullName: defaultName,
    dateOfBirth: defaultDob,
    birthTime: defaultTime,
    birthPlace: defaultPlace,
    latitude: defaultLat,
    longitude: defaultLng,
    timezone: defaultTz,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <NumerologyClient
        userDefaultName={defaultName}
        userDefaultDob={defaultDob}
        initialReport={initialReport}
      />
    </div>
  );
}
