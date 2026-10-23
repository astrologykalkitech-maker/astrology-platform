
import { createClient } from "@/lib/supabase/server";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

function parsePositiveInteger(value: string | null): number | null {
  if (value === null) return null;

  if (!/^\d+$/.test(value)) return null;

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function parseFee(value: string | null): number | null {
  if (value === null) return null;

  if (value.trim() === "") return null;

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const pageValue = parsePositiveInteger(
      searchParams.get("page")
    );

    const limitValue = parsePositiveInteger(
      searchParams.get("limit")
    );

    const minFeeParam = searchParams.get("minFee");
    const maxFeeParam = searchParams.get("maxFee");

    const minFee = parseFee(minFeeParam);
    const maxFee = parseFee(maxFeeParam);

    if (
      (searchParams.has("page") && pageValue === null) ||
      (searchParams.has("limit") && limitValue === null) ||
      (minFeeParam !== null && minFee === null) ||
      (maxFeeParam !== null && maxFee === null)
    ) {
      return Response.json(
        { error: "Invalid pagination or fee parameters." },
        { status: 400 }
      );
    }

    if (
      minFee !== null &&
      maxFee !== null &&
      minFee > maxFee
    ) {
      return Response.json(
        { error: "minFee cannot be greater than maxFee." },
        { status: 400 }
      );
    }

    const page = pageValue ?? 1;
    const limit = Math.min(
      limitValue ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE
    );

    const from = (page - 1) * limit;

    if (!Number.isSafeInteger(from)) {
      return Response.json(
        { error: "Page number is too large." },
        { status: 400 }
      );
    }

    const city = searchParams.get("city")?.trim();
    const specialization = searchParams
      .get("specialization")
      ?.trim();
    const language = searchParams.get("language")?.trim();

    const supabase = await createClient();

    let query = supabase
      .from("astrologer_profiles")
      .select(
        `
          id,
          slug,
          display_name,
          bio,
          experience_years,
          specializations,
          languages,
          city,
          state,
          consultation_fee,
          profile_photo_url,
          created_at
        `,
        { count: "exact" }
      )
      .eq("approval_status", "approved");

    if (city) {
      query = query.ilike("city", `%${city}%`);
    }

    if (specialization) {
      query = query.contains("specializations", [
        specialization,
      ]);
    }

    if (language) {
      query = query.contains("languages", [language]);
    }

    if (minFee !== null) {
      query = query.gte("consultation_fee", minFee);
    }

    if (maxFee !== null) {
      query = query.lte("consultation_fee", maxFee);
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, from + limit - 1);

    if (error) {
      console.error(
        "Failed to fetch astrologers:",
        error.message
      );

      return Response.json(
        { error: "Unable to fetch astrologers." },
        { status: 500 }
      );
    }

    return Response.json({
      data: data ?? [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (error) {
    console.error("Astrologer API error:", error);

    return Response.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
