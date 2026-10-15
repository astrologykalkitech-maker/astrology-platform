import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(
  _request: Request,
  { params }: RouteContext
) {
  try {
    const { slug } = await params;

    if (!slug || slug.trim() !== slug || slug.length > 200) {
      return Response.json(
        { error: "Invalid astrologer slug." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("astrologer_profiles")
      .select(
        "id, slug, display_name, bio, experience_years, specializations, languages, city, state, consultation_fee, profile_photo_url"
      )
      .eq("slug", slug)
      .eq("approval_status", "approved")
      .maybeSingle();

    if (error) {
      console.error("Failed to fetch astrologer:", error.message);
      return Response.json(
        { error: "Unable to fetch astrologer details." },
        { status: 500 }
      );
    }

    if (!data) {
      return Response.json(
        { error: "Astrologer not found." },
        { status: 404 }
      );
    }

    return Response.json({ data });
  } catch (error) {
    console.error("Astrologer details API error:", error);
    return Response.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
