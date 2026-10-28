/**
 * Live Application Tools for AI Support
 *
 * Provides safe, strictly authorized read-only data access for:
 * 1. Astrologer Directory Search & Recommendation (with real approved profiles)
 * 2. Customer Bookings Summary (authenticated owner only)
 * 3. Astrologer Profile & Approval Status (authenticated owner only)
 * 4. Astrologer Assigned Leads Summary (authenticated owner only)
 * 5. User Support Tickets Status (authenticated owner only)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { AstrologerPreferenceExtraction } from "./rag-pipeline";

export interface AstrologerRecommendationCard {
  id: string;
  name: string;
  slug: string;
  avatar_url?: string | null;
  specializations: string[];
  languages: string[];
  experience_years: number;
  consultation_fee: number;
  rating_avg: number;
  total_reviews: number;
  profile_url: string;
  match_reason: string;
}

/**
 * Searches approved, publicly visible astrologers using real database records.
 * Generates rich profile cards with direct clickable profile routes.
 */
export async function searchApprovedAstrologers(
  preferences?: AstrologerPreferenceExtraction,
  limit: number = 3
): Promise<AstrologerRecommendationCard[]> {
  try {
    const adminClient = await createAdminClient("main");

    let query = adminClient
      .from("astrologer_profiles")
      .select(
        "id, slug, display_name, specializations, languages, experience_years, consultation_fee, profile_photo_url, ranking_priority, approval_status"
      )
      .eq("approval_status", "approved");

    // Filter by specialization if requested
    if (preferences?.specialization) {
      query = query.contains("specializations", [preferences.specialization]);
    }

    // Filter by language if requested
    if (preferences?.language) {
      query = query.contains("languages", [preferences.language]);
    }

    // Filter by budget if requested
    if (preferences?.maxBudget) {
      query = query.lte("consultation_fee", preferences.maxBudget);
    }

    // Filter by minimum experience if requested
    if (preferences?.minExperience) {
      query = query.gte("experience_years", preferences.minExperience);
    }

    // Order by ranking_priority descending, then experience descending
    query = query.order("ranking_priority", { ascending: false }).order("experience_years", { ascending: false }).limit(limit);

    const { data: initialAstros, error } = await query;
    let astros = initialAstros;

    // Resilient fallback: if query returned no matches with all strict filters, relax budget or specialization to give helpful options
    if ((!astros || astros.length === 0) && (preferences?.maxBudget || preferences?.language || preferences?.specialization)) {
      const relaxedQuery = adminClient
        .from("astrologer_profiles")
        .select(
          "id, slug, display_name, specializations, languages, experience_years, consultation_fee, profile_photo_url, ranking_priority, approval_status"
        )
        .eq("approval_status", "approved")
        .order("ranking_priority", { ascending: false })
        .limit(limit);

      const relaxedRes = await relaxedQuery;
      if (relaxedRes.data && relaxedRes.data.length > 0) {
        astros = relaxedRes.data;
      }
    }

    if (error || !astros || astros.length === 0) {
      return [];
    }

    // Fetch review counts and average ratings for matching astrologers
    const astroIds = astros.map((a) => a.id);
    const { data: reviews } = await adminClient
      .from("consultation_reviews")
      .select("astrologer_id, rating")
      .in("astrologer_id", astroIds)
      .eq("is_published", true);

    const reviewMap: Record<string, { count: number; totalRating: number }> = {};
    if (reviews) {
      for (const r of reviews) {
        if (!reviewMap[r.astrologer_id]) {
          reviewMap[r.astrologer_id] = { count: 0, totalRating: 0 };
        }
        reviewMap[r.astrologer_id].count += 1;
        reviewMap[r.astrologer_id].totalRating += r.rating;
      }
    }

    return astros.map((a) => {
      const rev = reviewMap[a.id];
      const count = rev?.count ?? 0;
      const avg = count > 0 ? parseFloat((rev.totalRating / count).toFixed(1)) : 4.8; // Default 4.8 for verified unreviewed astrologers

      // Construct descriptive match reason
      const reasons: string[] = [];
      if (preferences?.specialization && a.specializations?.includes(preferences.specialization)) {
        reasons.push(`Specialist in ${preferences.specialization} astrology`);
      }
      if (preferences?.language && a.languages?.includes(preferences.language)) {
        reasons.push(`Speaks ${preferences.language}`);
      }
      if (a.experience_years >= 8) {
        reasons.push(`${a.experience_years}+ years Vedic wisdom`);
      }
      const matchReason = reasons.length > 0 ? reasons.join(" • ") : "Verified Vedic astrologer on JyotishSetu";

      return {
        id: a.id,
        name: a.display_name || "Vedic Astrologer",
        slug: a.slug || a.id,
        avatar_url: a.profile_photo_url || null,
        specializations: a.specializations || ["Vedic Astrology"],
        languages: a.languages || ["Hindi", "English"],
        experience_years: a.experience_years || 5,
        consultation_fee: Number(a.consultation_fee) || 500,
        rating_avg: avg,
        total_reviews: count,
        profile_url: `/customer/astrologers/${a.slug || a.id}`,
        match_reason: matchReason,
      };
    });
  } catch (err) {
    console.error("[LiveTools: searchApprovedAstrologers] error:", err);
    return [];
  }
}

/**
 * Retrieves authenticated customer's upcoming bookings summary
 */
export async function getCustomerBookingsSummary(userId: string): Promise<string> {
  try {
    const adminClient = await createAdminClient("main");

    const { data: bookings, error } = await adminClient
      .from("customer_bookings")
      .select("id, service_type, consultation_mode, scheduled_at, duration_minutes, status, astrologer_id")
      .eq("customer_id", userId)
      .order("scheduled_at", { ascending: false })
      .limit(3);

    if (error || !bookings || bookings.length === 0) {
      return "You currently have no scheduled or past consultation bookings. You can book a verified astrologer at any time from the Astrologers directory.";
    }

    // Resolve astrologer names
    const astroIds = Array.from(new Set(bookings.map((b) => b.astrologer_id)));
    const { data: astros } = await adminClient
      .from("astrologer_profiles")
      .select("id, display_name")
      .in("id", astroIds);

    const astroMap: Record<string, string> = {};
    if (astros) {
      for (const a of astros) {
        astroMap[a.id] = a.display_name;
      }
    }

    const lines = bookings.map((b) => {
      const astroName = astroMap[b.astrologer_id] || "Vedic Astrologer";
      const dateStr = new Date(b.scheduled_at).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      return `• ${b.service_type} (${b.consultation_mode}) with ${astroName} on ${dateStr} IST — Status: [${b.status.toUpperCase()}]`;
    });

    return `Here are your recent consultation bookings:\n${lines.join("\n")}\n\nVirtual consultation rooms unlock 15 minutes before the scheduled Muhurat slot on your Bookings tab (/customer/bookings).`;
  } catch (err) {
    console.error("[LiveTools: getCustomerBookingsSummary] error:", err);
    return "Unable to retrieve your bookings at this moment. Please visit your Bookings tab directly.";
  }
}

/**
 * Retrieves authenticated astrologer's profile approval and listing status
 */
export async function getAstrologerProfileStatus(userId: string): Promise<string> {
  try {
    const adminClient = await createAdminClient("main");

    const { data: profile, error } = await adminClient
      .from("astrologer_profiles")
      .select("id, display_name, approval_status, consultation_fee, experience_years, specializations, languages")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !profile) {
      return "Astrologer profile record not found. Please navigate to /astrologer/profile to complete your onboarding details.";
    }

    const status = profile.approval_status;
    let explanation = "";

    switch (status) {
      case "approved":
        explanation =
          "Your profile is fully APPROVED and publicly visible to seekers! You can receive customer bookings and lead assignments.";
        break;
      case "pending":
        explanation =
          "Your profile application is currently under review by the Super Admin moderation desk. Once verified, your public listing will go live.";
        break;
      case "changes_requested":
        explanation =
          "The Super Admin team has requested updates to your profile credentials or biography. Please visit /astrologer/profile/edit to review administrative notes and update your profile.";
        break;
      case "suspended":
        explanation =
          "Your profile is currently suspended from public discovery. Please escalate a support ticket for administrative review.";
        break;
      default:
        explanation = `Current profile status: ${status}.`;
    }

    return `Astrologer Profile Status: [${status.toUpperCase()}]\n${explanation}\nConfigured Fee: ₹${profile.consultation_fee || 0} • Experience: ${profile.experience_years || 0} years • Specializations: ${(profile.specializations || []).join(", ") || "General"}.`;
  } catch (err) {
    console.error("[LiveTools: getAstrologerProfileStatus] error:", err);
    return "Unable to retrieve your profile status at this moment.";
  }
}

/**
 * Retrieves authenticated astrologer's assigned leads summary
 */
export async function getAstrologerLeadsSummary(userId: string): Promise<string> {
  try {
    const adminClient = await createAdminClient("main");

    const { data: astro } = await adminClient
      .from("astrologer_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!astro) {
      return "Astrologer profile not found.";
    }

    const { data: leads, error } = await adminClient
      .from("leads")
      .select("id, subject, status, created_at")
      .eq("astrologer_id", astro.id)
      .order("created_at", { ascending: false })
      .limit(4);

    if (error || !leads || leads.length === 0) {
      return "You currently have no new customer leads assigned. When new consultation enquiries arrive from seekers, they will appear in your Leads inbox (/astrologer/leads).";
    }

    const lines = leads.map((l) => {
      return `• Enquiry: "${l.subject}" — Status: [${l.status.toUpperCase()}]`;
    });

    return `Here are your assigned customer leads:\n${lines.join("\n")}\n\nYou can contact seekers and launch consultation rooms directly from /astrologer/leads.`;
  } catch (err) {
    console.error("[LiveTools: getAstrologerLeadsSummary] error:", err);
    return "Unable to retrieve your assigned leads at this moment.";
  }
}

/**
 * Retrieves authenticated user's support tickets summary
 */
export async function getUserTicketsSummary(userId: string): Promise<string> {
  try {
    const adminClient = await createAdminClient("main");

    const { data: tickets, error } = await adminClient
      .from("support_tickets")
      .select("id, ticket_number, subject, status, priority, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3);

    if (error || !tickets || tickets.length === 0) {
      return "You do not have any open or previous support tickets. If you need assistance with an account or technical issue, you can click 'Request Human Support' to submit a ticket.";
    }

    const lines = tickets.map((t) => {
      return `• Ticket ${t.ticket_number}: "${t.subject}" — Status: [${t.status.toUpperCase()}] (Priority: ${t.priority})`;
    });

    return `Here is the status of your recent support tickets:\n${lines.join("\n")}\n\nYou can view full conversations and replies under your Support Tickets tab.`;
  } catch (err) {
    console.error("[LiveTools: getUserTicketsSummary] error:", err);
    return "Unable to retrieve your support tickets at this moment.";
  }
}


/**
 * Retrieves a single approved astrologer profile card by slug or ID
 */
export async function getAstrologerBySlug(slugOrId: string): Promise<AstrologerRecommendationCard | null> {
  try {
    const adminClient = await createAdminClient("main");
    const clean = slugOrId.trim().toLowerCase();

    const { data: astro, error } = await adminClient
      .from("astrologer_profiles")
      .select("id, slug, display_name, specializations, languages, experience_years, consultation_fee, profile_photo_url, approval_status")
      .eq("approval_status", "approved")
      .or(`slug.eq.${clean},id.eq.${clean}`)
      .maybeSingle();

    if (error || !astro) {
      return null;
    }

    // Get reviews
    const { data: reviews } = await adminClient
      .from("consultation_reviews")
      .select("rating")
      .eq("astrologer_id", astro.id)
      .eq("is_published", true);

    const count = reviews?.length || 0;
    const avg = count > 0 ? parseFloat(((reviews || []).reduce((acc, r) => acc + r.rating, 0) / count).toFixed(1)) : 4.8;

    return {
      id: astro.id,
      name: astro.display_name || "Vedic Astrologer",
      slug: astro.slug || astro.id,
      avatar_url: astro.profile_photo_url || null,
      specializations: astro.specializations || ["Vedic Astrology"],
      languages: astro.languages || ["Hindi", "English"],
      experience_years: astro.experience_years || 5,
      consultation_fee: Number(astro.consultation_fee) || 500,
      rating_avg: avg,
      total_reviews: count,
      profile_url: `/customer/astrologers/${astro.slug || astro.id}`,
      match_reason: "Verified Vedic astrologer on JyotishSetu",
    };
  } catch (err) {
    console.error("[LiveTools: getAstrologerBySlug] error:", err);
    return null;
  }
}

/**
 * Compares two approved astrologers side-by-side
 */
export async function compareAstrologers(slug1: string, slug2: string): Promise<{
  text: string;
  cards: AstrologerRecommendationCard[];
}> {
  const [a1, a2] = await Promise.all([getAstrologerBySlug(slug1), getAstrologerBySlug(slug2)]);

  if (!a1 && !a2) {
    return {
      text: "Unable to find the specified astrologer profiles for comparison.",
      cards: [],
    };
  }

  if (a1 && !a2) {
    return {
      text: `Found profile for ${a1.name}, but could not find the second profile.`,
      cards: [a1],
    };
  }

  if (!a1 && a2) {
    return {
      text: `Found profile for ${a2.name}, but could not find the first profile.`,
      cards: [a2],
    };
  }

  const card1 = a1!;
  const card2 = a2!;

  const text = `Here is a side-by-side comparison of ${card1.name} and ${card2.name}:\n\n` +
    `• **${card1.name}**: ${card1.experience_years}+ years experience | ₹${card1.consultation_fee}/session | Rating: ⭐ ${card1.rating_avg} (${card1.total_reviews} reviews)\n  Specializations: ${card1.specializations.join(", ")} | Languages: ${card1.languages.join(", ")}\n\n` +
    `• **${card2.name}**: ${card2.experience_years}+ years experience | ₹${card2.consultation_fee}/session | Rating: ⭐ ${card2.rating_avg} (${card2.total_reviews} reviews)\n  Specializations: ${card2.specializations.join(", ")} | Languages: ${card2.languages.join(", ")}\n\n` +
    `Both consultants are verified by our Super Admin team. You can click on either card below to view their complete profile and book a session.`;

  return {
    text,
    cards: [card1, card2],
  };
}
