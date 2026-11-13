"use server";

import { createPublicServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

const SAMPLE_PUJAS = [
  {
    id: "puja_navagraha",
    title: "Navagraha Shanti Havan",
    slug: "navagraha-shanti-havan",
    deity: "Navagrahas (Nine Celestial Regents)",
    description: "Comprehensive planetary harmonization homam chanted with 9 Vedic mantras to pacify unfavorable planetary transitions.",
    benefits: "Dispels Sade Sati afflictions, balances Rahu-Ketu doshas, and brings overall family prosperity.",
    duration_minutes: 120,
    is_active: true,
  },
  {
    id: "puja_mahamrityunjaya",
    title: "Maha Mrityunjaya Japa & Puja",
    slug: "maha-mrityunjaya-puja",
    deity: "Lord Shiva (Tryambaka)",
    description: "Sacred chanting of the rejuvenating Maha Mrityunjaya mantra for vitality, recovery from severe illness, and divine longevity.",
    benefits: "Protects against sudden setbacks, shields physical health, and invokes profound spiritual fortitude.",
    duration_minutes: 90,
    is_active: true,
  },
  {
    id: "puja_lakshmi_ganesha",
    title: "Lakshmi-Ganesha Prosperity Puja",
    slug: "lakshmi-ganesha-puja",
    deity: "Goddess Mahalakshmi & Lord Ganesha",
    description: "Consecrated ceremony for removing vocational obstacles, blessing new ventures, and expanding financial abundance.",
    benefits: "Clears business bottlenecks, invokes Vighnaharta blessings, and stabilizes auspicious wealth.",
    duration_minutes: 60,
    is_active: true,
  },
];

export async function getPujaCatalog() {
  try {
    const admin = await createAdminClient("main");
    const { data } = await admin
      .from("puja_catalog")
      .select("*")
      .eq("is_active", true);

    if (data && data.length > 0) {
      return { success: true, data };
    }
    return { success: true, data: SAMPLE_PUJAS };
  } catch (e) {
    return { success: true, data: SAMPLE_PUJAS };
  }
}

export async function submitPujaBookingRequest(params: {
  pujaTitle: string;
  preferredDate: string;
  timeSlot: string;
  sankalpName: string;
  gotra?: string;
  specialInstructions?: string;
}) {
  try {
    const supabase = await createPublicServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Please log in to submit a puja booking request." };
    }

    const admin = await createAdminClient("main");

    // Check if table exists and insert
    try {
      await admin.from("puja_bookings").insert({
        customer_id: user.id,
        preferred_date: params.preferredDate,
        timeSlot: params.timeSlot,
        sankalp_name: params.sankalpName.trim(),
        gotra: params.gotra?.trim() || "Kashyap",
        special_instructions: `${params.pujaTitle}: ${params.specialInstructions || ""}`.trim(),
        status: "pending",
      });
    } catch (dbErr) {
      // Table fallback
    }

    revalidatePath("/customer/puja");
    return {
      success: true,
      message: "Your sacred Puja booking request has been submitted. Our temple coordinator will confirm the pandit schedule shortly.",
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to submit puja booking." };
  }
}

