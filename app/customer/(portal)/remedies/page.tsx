import { Metadata } from "next";
import { requireCustomerContext } from "@/lib/auth/customer-guard";
import { getCustomerKundlisAction } from "@/app/actions/kundli";
import { generateFullAstrologyReport } from "@/lib/astrology";
import { RemediesClient } from "@/components/customer/RemediesClient";

export const metadata: Metadata = {
  title: "Vedic Remedies & Protection Rituals | JyotishSetu",
  description: "Personalized Vedic Gemstones, Rudraksha, Mantras, and Charity prescribed according to your authentic Janam Kundli.",
};

export default async function CustomerRemediesPage() {
  const { user } = await requireCustomerContext();

  const kundliRes = await getCustomerKundlisAction();
  const kundlis = kundliRes.success && kundliRes.data ? kundliRes.data : [];

  let activeReport = null;
  if (kundlis.length > 0) {
    const k = kundlis[0];
    activeReport = generateFullAstrologyReport({
      name: k.name,
      gender: k.gender === "male" || k.gender === "female" ? k.gender : "other",
      date: k.date_of_birth,
      time: (k.time_of_birth as string).slice(0, 5),
      location: {
        latitude: Number(k.latitude),
        longitude: Number(k.longitude),
        timezoneOffsetHours: Number(k.timezone || 5.5),
        cityName: k.birth_place,
      },
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <RemediesClient kundlis={kundlis} initialReport={activeReport} />
    </div>
  );
}

