import { Metadata } from "next";
import { requireCustomerContext } from "@/lib/auth/customer-guard";
import { getCustomerKundlisAction } from "@/app/actions/kundli";
import { calculateTransitSnapshot, ZODIAC_SIGNS } from "@/lib/astrology/transits";
import { PlanetaryTransitsClient } from "@/components/customer/PlanetaryTransitsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Planetary Transits & Vedic Gochara | JyotishSetu",
  description: "Live planetary transits for all 9 Grahas, Sade Sati status, House effects, and transit timelines grounded in Chitrapaksha Lahiri Ayanamsa.",
};

export default async function PlanetaryTransitsPage() {
  await requireCustomerContext();

  const kundliRes = await getCustomerKundlisAction();
  const kundlis = kundliRes.success && kundliRes.data ? kundliRes.data : [];

  const defaultRashi = (kundlis[0]?.chart_data?.moonSign as any) || "Mesha";
  const initialSnapshot = calculateTransitSnapshot(new Date(), defaultRashi);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <PlanetaryTransitsClient
        initialSnapshot={initialSnapshot}
        kundlis={kundlis}
        defaultRashi={defaultRashi}
      />
    </div>
  );
}
